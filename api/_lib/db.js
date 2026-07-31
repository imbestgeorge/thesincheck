import { neon } from '@neondatabase/serverless'
import { createHttpError } from './http.js'

let sql
let schemaPromise

const SEARCH_STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'against',
  'also',
  'and',
  'are',
  'ask',
  'bad',
  'but',
  'can',
  'does',
  'for',
  'from',
  'have',
  'how',
  'into',
  'is',
  'it',
  'not',
  'of',
  'or',
  'sin',
  'sins',
  'that',
  'the',
  'this',
  'to',
  'was',
  'what',
  'when',
  'where',
  'who',
  'why',
  'with',
  'you',
])

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw createHttpError(503, 'DATABASE_URL is not configured.')
  }

  if (!sql) {
    sql = neon(process.env.DATABASE_URL)
  }

  return sql
}

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = setupSchema().catch((error) => {
      schemaPromise = undefined
      throw error
    })
  }

  return schemaPromise
}

async function setupSchema() {
  const database = getSql()

  await database`
    CREATE TABLE IF NOT EXISTS sincheck_state (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    )
  `
  await database`
    CREATE TABLE IF NOT EXISTS sincheck_questions (
      id INTEGER PRIMARY KEY,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      video_url TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await database`
    CREATE TABLE IF NOT EXISTS sincheck_chat_daily_usage (
      rate_key TEXT NOT NULL,
      usage_date DATE NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (rate_key, usage_date)
    )
  `
  await database`
    INSERT INTO sincheck_state (key, value)
    VALUES ('next_question_id', 1)
    ON CONFLICT (key) DO NOTHING
  `
}

function normalizeQuestion(row) {
  return {
    id: Number(row.id),
    question: row.question,
    answer: row.answer,
    videoUrl: row.videoUrl,
  }
}

function normalizeSearchText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function searchTokens(text) {
  return normalizeSearchText(text)
    .split(' ')
    .filter((token) => token.length > 2 && !SEARCH_STOP_WORDS.has(token))
}

function scoreQuestionMatch(item, terms, normalizedMessage) {
  const questionText = normalizeSearchText(item.question)
  const answerText = normalizeSearchText(item.answer)
  let score = questionText.includes(normalizedMessage) ? 20 : 0

  for (const term of terms) {
    if (questionText.includes(term)) {
      score += 3
    }

    if (answerText.includes(term)) {
      score += 1
    }
  }

  return score
}

async function getNextId(database) {
  const rows = await database`
    SELECT value AS "nextId"
    FROM sincheck_state
    WHERE key = 'next_question_id'
  `

  return Number(rows[0]?.nextId || 1)
}

export async function getCatalog() {
  await ensureSchema()

  const database = getSql()
  const questions = await database`
    SELECT id, question, answer, video_url AS "videoUrl"
    FROM sincheck_questions
    ORDER BY id ASC
  `
  const nextId = await getNextId(database)

  return {
    nextId,
    questions: questions.map(normalizeQuestion),
  }
}

export async function getRelevantQuestions(message, limit = 8) {
  await ensureSchema()

  const database = getSql()
  const searchLimit = Math.max(1, Math.min(Number(limit) || 8, 12))
  const rows = await database`
    SELECT id, question, answer, video_url AS "videoUrl"
    FROM sincheck_questions
    WHERE to_tsvector('english', question || ' ' || answer) @@ websearch_to_tsquery('english', ${message})
    ORDER BY
      ts_rank_cd(
        to_tsvector('english', question || ' ' || answer),
        websearch_to_tsquery('english', ${message})
      ) DESC,
      id ASC
    LIMIT ${searchLimit}
  `

  if (rows.length > 0) {
    return rows.map(normalizeQuestion)
  }

  const fallbackRows = await database`
    SELECT id, question, answer, video_url AS "videoUrl"
    FROM sincheck_questions
    ORDER BY id ASC
    LIMIT 200
  `
  const normalizedMessage = normalizeSearchText(message)
  const terms = searchTokens(message)

  if (!normalizedMessage || terms.length === 0) {
    return []
  }

  return fallbackRows
    .map(normalizeQuestion)
    .map((item) => ({
      item,
      score: scoreQuestionMatch(item, terms, normalizedMessage),
    }))
    .filter((match) => match.score > 0)
    .sort((first, second) => second.score - first.score || first.item.id - second.item.id)
    .slice(0, searchLimit)
    .map((match) => match.item)
}

export async function reserveChatMessage(rateKey, limit, usageDate) {
  await ensureSchema()

  const database = getSql()
  const rows = await database`
    INSERT INTO sincheck_chat_daily_usage (rate_key, usage_date, count)
    VALUES (${rateKey}, ${usageDate}, 1)
    ON CONFLICT (rate_key, usage_date)
    DO UPDATE SET
      count = sincheck_chat_daily_usage.count + 1,
      updated_at = NOW()
    WHERE sincheck_chat_daily_usage.count < ${limit}
    RETURNING count
  `

  if (rows.length > 0) {
    const count = Number(rows[0].count)

    return {
      allowed: true,
      count,
      limit,
      remaining: Math.max(limit - count, 0),
    }
  }

  const currentRows = await database`
    SELECT count
    FROM sincheck_chat_daily_usage
    WHERE rate_key = ${rateKey} AND usage_date = ${usageDate}
  `
  const count = Number(currentRows[0]?.count || limit)

  return {
    allowed: false,
    count,
    limit,
    remaining: 0,
  }
}

export async function refundChatMessage(rateKey, usageDate) {
  await ensureSchema()

  const database = getSql()

  await database`
    UPDATE sincheck_chat_daily_usage
    SET
      count = GREATEST(count - 1, 0),
      updated_at = NOW()
    WHERE rate_key = ${rateKey} AND usage_date = ${usageDate}
  `
}

export async function createQuestion(payload) {
  await ensureSchema()

  const database = getSql()
  const createdRows = await database`
    WITH next_value AS (
      UPDATE sincheck_state
      SET value = value + 1
      WHERE key = 'next_question_id'
      RETURNING value - 1 AS id
    ),
    inserted AS (
      INSERT INTO sincheck_questions (id, question, answer, video_url)
      SELECT id, ${payload.question}, ${payload.answer}, ${payload.videoUrl}
      FROM next_value
      RETURNING id, question, answer, video_url AS "videoUrl"
    )
    SELECT id, question, answer, "videoUrl"
    FROM inserted
  `
  const catalog = await getCatalog()

  return {
    ...catalog,
    created: normalizeQuestion(createdRows[0]),
  }
}

export async function updateQuestion(id, payload) {
  await ensureSchema()

  const database = getSql()
  const updatedRows = await database`
    UPDATE sincheck_questions
    SET
      question = ${payload.question},
      answer = ${payload.answer},
      video_url = ${payload.videoUrl},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, question, answer, video_url AS "videoUrl"
  `

  if (updatedRows.length === 0) {
    throw createHttpError(404, `Question ${id} was not found.`)
  }

  const catalog = await getCatalog()

  return {
    ...catalog,
    updated: normalizeQuestion(updatedRows[0]),
  }
}

export async function deleteQuestion(id) {
  await ensureSchema()

  const database = getSql()
  const deletedRows = await database`
    DELETE FROM sincheck_questions
    WHERE id = ${id}
    RETURNING id
  `

  if (deletedRows.length === 0) {
    throw createHttpError(404, `Question ${id} was not found.`)
  }

  const catalog = await getCatalog()

  return {
    ...catalog,
    deletedId: id,
  }
}
