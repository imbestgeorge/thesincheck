import express from 'express'
import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import adminLoginHandler from './api/admin/login.js'
import adminLogoutHandler from './api/admin/logout.js'
import chatHandler from './api/chat.js'
import questionHandler from './api/questions/[id].js'
import questionImportHandler from './api/questions/import.js'
import questionsHandler from './api/questions/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()

const PORT = Number(process.env.PORT) || 5173
const HOST = process.env.HOST || '127.0.0.1'
const isProduction = process.env.NODE_ENV === 'production'

app.use(express.json())

function apiHandlerMiddleware(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response)).catch(next)
  }
}

app.all('/api/questions', apiHandlerMiddleware(questionsHandler))
app.all('/api/questions/import', apiHandlerMiddleware(questionImportHandler))
app.all('/api/questions/:id', apiHandlerMiddleware(questionHandler))
app.all('/api/chat', apiHandlerMiddleware(chatHandler))
app.all('/api/admin/login', apiHandlerMiddleware(adminLoginHandler))
app.all('/api/admin/logout', apiHandlerMiddleware(adminLogoutHandler))

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
