import { assertPassword, createAdminToken } from '../_lib/auth.js'
import { handleApiError, methodNotAllowed, sendJson } from '../_lib/http.js'

export default async function handler(request, response) {
  try {
    if (request.method !== 'POST') {
      methodNotAllowed(response, ['POST'])
      return
    }

    assertPassword(request.body?.password)
    sendJson(response, 200, { token: createAdminToken() })
  } catch (error) {
    await handleApiError(response, error)
  }
}
