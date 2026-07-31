export function createHttpError(status, message) {
  const error = new Error(message)
  error.status = status

  return error
}

export function sendJson(response, status, data) {
  response.status(status).json(data)
}

export function methodNotAllowed(response, allowedMethods) {
  response.setHeader('Allow', allowedMethods.join(', '))
  sendJson(response, 405, { message: 'Method not allowed.' })
}

export function questionPayload(body) {
  const question = String(body?.question || '').trim()
  const answer = String(body?.answer || '').trim()
  const videoUrl = String(body?.videoUrl ?? body?.video_url ?? '').trim()
  const enabledValue = body?.isEnabled ?? body?.enabled

  if (!question || !answer) {
    throw createHttpError(400, 'Question and answer are required.')
  }

  const payload = {
    question,
    answer,
    videoUrl,
  }

  if (typeof enabledValue === 'boolean') {
    payload.isEnabled = enabledValue
  }

  return payload
}

export function enabledPayload(body) {
  const enabledValue = body?.isEnabled ?? body?.enabled

  if (typeof enabledValue !== 'boolean') {
    throw createHttpError(400, 'Enabled value must be true or false.')
  }

  return enabledValue
}

export async function handleApiError(response, error) {
  const status = error.status || 500
  const message = status === 500 ? 'Server error.' : error.message

  if (status === 500) {
    console.error(error)
  }

  sendJson(response, status, { message })
}
