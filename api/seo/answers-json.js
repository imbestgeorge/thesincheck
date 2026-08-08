import { answersJsonHandler, handleSeoError } from '../_lib/seo.js'

export default async function handler(request, response) {
  try {
    await answersJsonHandler(request, response)
  } catch (error) {
    await handleSeoError(request, response, error)
  }
}
