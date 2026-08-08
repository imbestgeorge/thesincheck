import { handleSeoError, sitemapHandler } from '../_lib/seo.js'

export default async function handler(request, response) {
  try {
    await sitemapHandler(request, response)
  } catch (error) {
    await handleSeoError(request, response, error)
  }
}
