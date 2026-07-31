import express from 'express'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultQuestions, SAMPLE_SHORT_URL } from './src/questions.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()
const adminTokens = new Set()

const PORT = Number(process.env.PORT) || 5173
const HOST = process.env.HOST || '127.0.0.1'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'george67'
const DATA_DIR = path.join(__dirname, 'data')
const DATA_FILE = path.join(DATA_DIR, 'questions.json')
const isProduction = process.env.NODE_ENV === 'production'

app.use(express.json())

function normalizeQuestion(item) {
  const id = Number(item.id)

  if (!Number.isInteger(id) || id < 1) {
    return null
  }

  return {
    id,
    question: String(item.question || ''),
    answer: String(item.answer || ''),
    videoUrl: String(item.videoUrl || SAMPLE_SHORT_URL),
  }
}

function normalizeStore(store) {
  const questions = Array.isArray(store.questions)
    ? store.questions.map(normalizeQuestion).filter(Boolean)
    : []
  const sortedQuestions = questions.sort((first, second) => first.id - second.id)
  const highestQuestionId =
    sortedQuestions.length > 0 ? Math.max(...sortedQuestions.map((item) => item.id)) : 0
  const savedNextId = Number(store.nextId)
  const nextId =
    Number.isInteger(savedNextId) && savedNextId > highestQuestionId
      ? savedNextId
      : highestQuestionId + 1

  return {
    nextId,
    questions: sortedQuestions,
  }
}

function seedStore() {
  return normalizeStore({
    nextId: defaultQuestions.length + 1,
    questions: defaultQuestions,
  })
}

async function writeStore(store) {
  await mkdir(DATA_DIR, { recursive: true })
  const normalizedStore = normalizeStore(store)
  const temporaryFile = `${DATA_FILE}.tmp`

  await writeFile(temporaryFile, `${JSON.stringify(normalizedStore, null, 2)}\n`)
  await rename(temporaryFile, DATA_FILE)

  return normalizedStore
}

async function readStore() {
  try {
    const store = JSON.parse(await readFile(DATA_FILE, 'utf8'))

    return normalizeStore(store)
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }

    return writeStore(seedStore())
  }
}

function createHttpError(status, message) {
  const error = new Error(message)
  error.status = status

  return error
}

function asyncHandler(handler) {
  return async (request, response, next) => {
    try {
      await handler(request, response)
    } catch (error) {
      next(error)
    }
  }
}

function questionPayload(body) {
  const question = String(body.question || '').trim()
  const answer = String(body.answer || '').trim()
  const videoUrl = String(body.videoUrl || SAMPLE_SHORT_URL).trim()

  if (!question || !answer || !videoUrl) {
    throw createHttpError(400, 'Question, answer, and YouTube Short are required.')
  }

  return {
    question,
    answer,
    videoUrl,
  }
}

function requireAdmin(request, response, next) {
  const authorization = request.get('authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''

  if (!adminTokens.has(token)) {
    response.status(401).json({ message: 'Please sign in again.' })
    return
  }

  next()
}

app.get(
  '/api/questions',
  asyncHandler(async (_request, response) => {
    response.json(await readStore())
  }),
)

app.post('/api/admin/login', (request, response) => {
  if (String(request.body.password || '') !== ADMIN_PASSWORD) {
    response.status(401).json({ message: 'Incorrect password.' })
    return
  }

  const token = randomBytes(32).toString('hex')

  adminTokens.add(token)
  response.json({ token })
})

app.post('/api/admin/logout', requireAdmin, (request, response) => {
  const token = request.get('authorization').slice(7)

  adminTokens.delete(token)
  response.json({ ok: true })
})

app.post(
  '/api/questions',
  requireAdmin,
  asyncHandler(async (request, response) => {
    const store = await readStore()
    const newQuestion = {
      id: store.nextId,
      ...questionPayload(request.body),
    }
    const nextStore = await writeStore({
      nextId: store.nextId + 1,
      questions: [...store.questions, newQuestion],
    })

    response.status(201).json({ ...nextStore, created: newQuestion })
  }),
)

app.put(
  '/api/questions/:id',
  requireAdmin,
  asyncHandler(async (request, response) => {
    const id = Number(request.params.id)

    if (!Number.isInteger(id)) {
      throw createHttpError(400, 'Question number must be valid.')
    }

    const store = await readStore()
    const existingQuestion = store.questions.find((item) => item.id === id)

    if (!existingQuestion) {
      throw createHttpError(404, `Question ${id} was not found.`)
    }

    const updatedQuestion = {
      id,
      ...questionPayload(request.body),
    }
    const nextStore = await writeStore({
      nextId: store.nextId,
      questions: store.questions.map((item) => (item.id === id ? updatedQuestion : item)),
    })

    response.json({ ...nextStore, updated: updatedQuestion })
  }),
)

app.delete(
  '/api/questions/:id',
  requireAdmin,
  asyncHandler(async (request, response) => {
    const id = Number(request.params.id)

    if (!Number.isInteger(id)) {
      throw createHttpError(400, 'Question number must be valid.')
    }

    const store = await readStore()
    const nextQuestions = store.questions.filter((item) => item.id !== id)

    if (nextQuestions.length === store.questions.length) {
      throw createHttpError(404, `Question ${id} was not found.`)
    }

    const nextStore = await writeStore({
      nextId: store.nextId,
      questions: nextQuestions,
    })

    response.json({ ...nextStore, deletedId: id })
  }),
)

app.use('/api', (_request, response) => {
  response.status(404).json({ message: 'API route not found.' })
})

app.use((error, _request, response, _next) => {
  const status = error.status || 500
  const message = status === 500 ? 'Server error.' : error.message

  if (status === 500) {
    console.error(error)
  }

  response.status(status).json({ message })
})

if (isProduction) {
  const distPath = path.join(__dirname, 'dist')

  app.use(express.static(distPath))
  app.use((request, response, next) => {
    if (request.method !== 'GET') {
      next()
      return
    }

    response.sendFile(path.join(distPath, 'index.html'))
  })
} else {
  const { createServer: createViteServer } = await import('vite')
  const vite = await createViteServer({
    appType: 'spa',
    server: {
      middlewareMode: true,
    },
  })

  app.use(vite.middlewares)
}

app.listen(PORT, HOST, () => {
  const visibleHost = HOST === '0.0.0.0' ? '127.0.0.1' : HOST

  console.log(`The Sin Check is running at http://${visibleHost}:${PORT}/`)
})
