import { handleSeoError, questionsIndexPageHandler } from '../_lib/seo.js'

export default async function handler(request, response) {
  try {
    await questionsIndexPageHandler(request, response)
  } catch (error) {
    await handleSeoError(request, response, error)
  }
}
