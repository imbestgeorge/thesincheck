import { requireAdmin } from '../_lib/auth.js'
import { createQuestion, getCatalog } from '../_lib/db.js'
import { handleApiError, methodNotAllowed, questionPayload, sendJson } from '../_lib/http.js'

export default async function handler(request, response) {
  try {
    if (request.method === 'GET') {
      sendJson(response, 200, await getCatalog())
      return
    }

    if (request.method === 'POST') {
      requireAdmin(request)
      sendJson(response, 201, await createQuestion(questionPayload(request.body)))
      return
    }

    methodNotAllowed(response, ['GET', 'POST'])
  } catch (error) {
    await handleApiError(response, error)
  }
}
