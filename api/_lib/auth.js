import { createHmac, timingSafeEqual } from 'node:crypto'
import { createHttpError } from './http.js'

const SESSION_DURATION_MS = 12 * 60 * 60 * 1000

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || 'george67'
}

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || getAdminPassword()
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url')
}

function sign(value) {
  return createHmac('sha256', getSessionSecret()).update(value).digest('base64url')
}

function signaturesMatch(firstSignature, secondSignature) {
  const firstBuffer = Buffer.from(firstSignature)
  const secondBuffer = Buffer.from(secondSignature)

  if (firstBuffer.length !== secondBuffer.length) {
    return false
  }

  return timingSafeEqual(firstBuffer, secondBuffer)
}

export function createAdminToken() {
  const payload = base64UrlEncode(
    JSON.stringify({
      role: 'admin',
      expiresAt: Date.now() + SESSION_DURATION_MS,
    }),
  )

  return `${payload}.${sign(payload)}`
}

export function assertPassword(password) {
  if (String(password || '') !== getAdminPassword()) {
    throw createHttpError(401, 'Incorrect password.')
  }
}

export function requireAdmin(request) {
  const authorization = request.headers.authorization || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const [payload, signature] = token.split('.')

  if (!payload || !signature || !signaturesMatch(signature, sign(payload))) {
    throw createHttpError(401, 'Please sign in again.')
  }

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))

    if (session.role !== 'admin' || Number(session.expiresAt) < Date.now()) {
      throw createHttpError(401, 'Please sign in again.')
    }
  } catch (error) {
    if (error.status) {
      throw error
    }

    throw createHttpError(401, 'Please sign in again.')
  }
}
