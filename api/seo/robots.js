import { handleSeoError, robotsHandler } from '../_lib/seo.js'

export default async function handler(request, response) {
  try {
    await robotsHandler(request, response)
  } catch (error) {
    await handleSeoError(request, response, error)
  }
}
