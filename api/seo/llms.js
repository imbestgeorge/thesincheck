import { handleSeoError, llmsHandler } from '../_lib/seo.js'

export default async function handler(request, response) {
  try {
    await llmsHandler(request, response)
  } catch (error) {
    await handleSeoError(request, response, error)
  }
}
