export const SITE_NAME = 'The Sin Check'
export const SITE_TITLE = 'The Sin Check | Christian Answers to Sin Questions'
export const SITE_DESCRIPTION =
  'The Sin Check gives short, clear Christian answers to is it a sin questions with faith-focused explanations and related videos.'
export const QUESTION_ROUTE_PREFIX = '/questions'

export const SOCIAL_PROFILES = [
  'https://www.youtube.com/@TheSinCheck',
  'https://www.tiktok.com/@thesincheck',
  'https://www.instagram.com/thesincheck',
  'https://x.com/TheSinCheck',
  'https://www.threads.com/@thesincheck',
  'https://discord.gg/MFJsEPKGfb',
]

export function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

export function truncateText(text, maxLength = 160) {
  const normalizedText = normalizeWhitespace(text)

  if (normalizedText.length <= maxLength) {
    return normalizedText
  }

  const clippedText = normalizedText.slice(0, maxLength - 1)
  const lastSpaceIndex = clippedText.lastIndexOf(' ')
  const safeText = lastSpaceIndex > 80 ? clippedText.slice(0, lastSpaceIndex) : clippedText

  return `${safeText.trim()}...`
}

export function slugifyQuestion(question) {
  const slug = normalizeWhitespace(question)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 90)
    .replace(/-+$/g, '')

  return slug || 'answer'
}

export function parseQuestionIdSlug(value) {
  const match = String(value || '').match(/^(\d+)/)
  const id = Number(match?.[1] || 0)

  return Number.isInteger(id) && id > 0 ? id : null
}

export function questionPath(item) {
  const id = Number(item?.id)

  if (!Number.isInteger(id) || id < 1) {
    return QUESTION_ROUTE_PREFIX
  }

  return `${QUESTION_ROUTE_PREFIX}/${id}-${slugifyQuestion(item.question)}`
}

export function answerExcerpt(item, maxLength = 158) {
  const answer = normalizeWhitespace(item?.answer)

  if (!answer) {
    return `${SITE_NAME} answers this Christian question.`
  }

  return truncateText(`Christian answer: ${answer}`, maxLength)
}

export function questionPageTitle(item) {
  return `${normalizeWhitespace(item?.question) || 'Christian question'} | ${SITE_NAME}`
}
