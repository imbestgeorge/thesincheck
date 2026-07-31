import { requireQuestionImportAccess } from '../_lib/auth.js'
import { createDisabledQuestions } from '../_lib/db.js'
import { createHttpError, sendJson } from '../_lib/http.js'

const MAX_IMPORT_ITEMS = 500

function rawImportItems(body) {
  if (Array.isArray(body)) {
    return body
  }

  if (Array.isArray(body?.questions)) {
    return body.questions
  }

  if (Array.isArray(body?.items)) {
    return body.items
  }

  return [body]
}

function cleanImportItem(item, index) {
  const question = String(item?.question || item?.q || '').trim()
  const answer = String(item?.answer || item?.a || '').trim()
  const videoUrl = String(item?.videoUrl ?? item?.video_url ?? '').trim()
  const errors = []

  if (!question) {
    errors.push('Question is required.')
  }

  if (!answer) {
    errors.push('Answer is required.')
  }

  if (errors.length > 0) {
    return {
      index,
      success: false,
      error: errors.join(' '),
    }
  }

  return {
    index,
    success: true,
    payload: {
      inputIndex: index,
      question,
      answer,
      videoUrl,
    },
  }
}

function statusForResult(createdCount, failedCount) {
  if (createdCount > 0 && failedCount === 0) {
    return 201
  }

  if (createdCount > 0 && failedCount > 0) {
    return 207
  }

  return 400
}

function sendImportError(response, error) {
  const status = error.status || 500
  const message = status === 500 ? 'Question import failed.' : error.message

  if (status === 500) {
    console.error(error)
  }

  sendJson(response, status, {
    success: false,
    message,
    createdCount: 0,
    failedCount: 0,
  })
}

export default async function handler(request, response) {
  try {
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST')
      sendJson(response, 405, {
        success: false,
        message: 'Method not allowed.',
        createdCount: 0,
        failedCount: 0,
      })
      return
    }

    requireQuestionImportAccess(request)

    const items = rawImportItems(request.body)

    if (items.length === 0) {
      throw createHttpError(400, 'At least one question is required.')
    }

    if (items.length > MAX_IMPORT_ITEMS) {
      throw createHttpError(400, `Import is limited to ${MAX_IMPORT_ITEMS} questions at a time.`)
    }

    const validationResults = items.map(cleanImportItem)
    const validItems = validationResults
      .filter((item) => item.success)
      .map((item) => item.payload)
    const createdRows = await createDisabledQuestions(validItems)
    const createdByIndex = new Map(createdRows.map((item) => [item.inputIndex, item]))
    const results = validationResults.map((item) => {
      if (!item.success) {
        return item
      }

      const created = createdByIndex.get(item.index)

      if (!created) {
        return {
          index: item.index,
          success: false,
          error: 'Question was not inserted.',
        }
      }

      return {
        index: item.index,
        success: true,
        created,
      }
    })
    const createdCount = results.filter((item) => item.success).length
    const failedCount = results.length - createdCount

    sendJson(response, statusForResult(createdCount, failedCount), {
      success: createdCount > 0 && failedCount === 0,
      message:
        createdCount === 0
          ? `${failedCount} question${failedCount === 1 ? '' : 's'} failed.`
          : failedCount === 0
          ? `${createdCount} question${createdCount === 1 ? '' : 's'} imported disabled.`
          : `${createdCount} question${createdCount === 1 ? '' : 's'} imported disabled; ${failedCount} failed.`,
      createdCount,
      failedCount,
      results,
    })
  } catch (error) {
    sendImportError(response, error)
  }
}
