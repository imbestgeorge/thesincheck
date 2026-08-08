import {
  answersJsonHandler,
  handleSeoError,
  llmsFullHandler,
  llmsHandler,
  questionPageHandler,
  questionsIndexPageHandler,
  robotsHandler,
  sitemapHandler,
} from './_lib/seo.js'
import { createHttpError } from './_lib/http.js'

const routeHandlers = {
  question: questionPageHandler,
  questions: questionsIndexPageHandler,
  sitemap: sitemapHandler,
  robots: robotsHandler,
  llms: llmsHandler,
  'llms-full': llmsFullHandler,
  'answers-json': answersJsonHandler,
}

export default async function handler(request, response) {
  try {
    const route = String(request.query?.route || '').toLowerCase()
    const routeHandler = routeHandlers[route]

    if (!routeHandler) {
      throw createHttpError(404, 'SEO route was not found.')
    }

    await routeHandler(request, response)
  } catch (error) {
    await handleSeoError(request, response, error)
  }
}
