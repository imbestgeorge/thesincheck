import { neon } from '@neondatabase/serverless'
import { createHttpError } from './http.js'

let sql
let schemaPromise

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
