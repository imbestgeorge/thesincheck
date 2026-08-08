import { handleSeoError, llmsFullHandler } from '../_lib/seo.js'

export default async function handler(request, response) {
  try {
    await llmsFullHandler(request, response)
  } catch (error) {
    await handleSeoError(request, response, error)
  }
}
