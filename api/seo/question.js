import { handleSeoError, questionPageHandler } from '../_lib/seo.js'

export default async function handler(request, response) {
  try {
    await questionPageHandler(request, response)
  } catch (error) {
    await handleSeoError(request, response, error)
  }
}
