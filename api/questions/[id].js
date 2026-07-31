import { requireAdmin } from '../_lib/auth.js'
import { deleteQuestion, setQuestionEnabled, updateQuestion } from '../_lib/db.js'
import {
  createHttpError,
  enabledPayload,
  handleApiError,
  methodNotAllowed,
  questionPayload,
  sendJson,
} from '../_lib/http.js'

function questionId(request) {
  const id = Number(request.query?.id || request.params?.id)

  if (!Number.isInteger(id) || id < 1) {
    throw createHttpError(400, 'Question number must be valid.')
  }

  return id
}

export default async function handler(request, response) {
  try {
    requireAdmin(request)

    if (request.method === 'PUT') {
      sendJson(
        response,
        200,
        await updateQuestion(questionId(request), questionPayload(request.body), {
          includeDisabled: true,
        }),
      )
      return
    }

    if (request.method === 'PATCH') {
      sendJson(
        response,
        200,
        await setQuestionEnabled(questionId(request), enabledPayload(request.body)),
      )
      return
    }

    if (request.method === 'DELETE') {
      sendJson(response, 200, await deleteQuestion(questionId(request), { includeDisabled: true }))
      return
    }

    methodNotAllowed(response, ['PUT', 'PATCH', 'DELETE'])
  } catch (error) {
    await handleApiError(response, error)
  }
}
