import { requireAdmin } from '../_lib/auth.js'
import { handleApiError, methodNotAllowed, sendJson } from '../_lib/http.js'

export default async function handler(request, response) {
  try {
    if (request.method !== 'POST') {
      methodNotAllowed(response, ['POST'])
      return
    }

    requireAdmin(request)
    sendJson(response, 200, { ok: true })
  } catch (error) {
    await handleApiError(response, error)
  }
}
