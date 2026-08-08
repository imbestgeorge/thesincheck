export const SITE_NAME = 'TheSinCheck'
export const SITE_DESCRIPTION =
  'TheSinCheck gives short, clear Christian answers to is it a sin questions with faith-focused explanations and related videos.'
export const QUESTION_ROUTE_PREFIX = '/questions'

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

export function questionPath(item) {
  const slug = slugifyQuestion(item?.question)

  return `${QUESTION_ROUTE_PREFIX}/${slug}`
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
