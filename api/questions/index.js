import { requireAdmin } from '../_lib/auth.js'
import { createQuestion, getCatalog } from '../_lib/db.js'
import { handleApiError, methodNotAllowed, questionPayload, sendJson } from '../_lib/http.js'

function includeDisabledQuestions(request) {
  return ['1', 'true', 'yes'].includes(String(request.query?.includeDisabled || '').toLowerCase())
}

export default async function handler(request, response) {
  try {
    if (request.method === 'GET') {
      const includeDisabled = includeDisabledQuestions(request)

      if (includeDisabled) {
        requireAdmin(request)
      }

      sendJson(response, 200, await getCatalog({ includeDisabled }))
      return
    }

    if (request.method === 'POST') {
      requireAdmin(request)
      sendJson(
        response,
        201,
        await createQuestion(questionPayload(request.body), { includeDisabled: true }),
      )
      return
    }

    methodNotAllowed(response, ['GET', 'POST'])
  } catch (error) {
    await handleApiError(response, error)
  }
}
