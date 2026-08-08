import { getPublicQuestion, getSeoQuestions } from './db.js'
import { createHttpError } from './http.js'
import {
  QUESTION_ROUTE_PREFIX,
  SITE_DESCRIPTION,
  SITE_NAME,
  SOCIAL_PROFILES,
  answerExcerpt,
  normalizeWhitespace,
  parseQuestionIdSlug,
  questionPageTitle,
  questionPath,
  truncateText,
} from '../../shared/seo.js'

const CACHE_CONTROL = 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400'
const FALLBACK_SITE_ORIGIN = 'https://thesincheck.com'

function firstHeader(value) {
  if (Array.isArray(value)) {
    return firstHeader(value[0])
  }

  return String(value || '').split(',')[0].trim()
}

function getHeader(request, name) {
  return firstHeader(request.headers?.[name.toLowerCase()] || request.headers?.[name])
}

function setStatus(response, status) {
  if (typeof response.status === 'function') {
    return response.status(status)
  }

  response.statusCode = status
  return response
}

function sendBody(request, response, status, body, contentType) {
  setStatus(response, status)
  response.setHeader('Content-Type', contentType)
  response.setHeader('Cache-Control', CACHE_CONTROL)

  if (request.method === 'HEAD') {
    response.end()
    return
  }

  if (typeof response.send === 'function') {
    response.send(body)
    return
  }

  response.end(body)
}

function sendJsonBody(request, response, status, data) {
  setStatus(response, status)
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', CACHE_CONTROL)

  if (request.method === 'HEAD') {
    response.end()
    return
  }

  if (typeof response.json === 'function') {
    response.json(data)
    return
  }

  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(data))
}

function ensurePublicGet(request, response) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return true
  }

  response.setHeader('Allow', 'GET, HEAD')
  sendBody(request, response, 405, 'Method not allowed.', 'text/plain; charset=utf-8')

  return false
}

function redirectResponse(response, status, location) {
  if (typeof response.redirect === 'function') {
    response.redirect(status, location)
    return
  }

  setStatus(response, status)
  response.setHeader('Location', location)
  response.end()
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeXml(value) {
  return escapeHtml(value)
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

function absoluteUrl(origin, path) {
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`
}

function formatDisplayDate(value) {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat('en', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function requestPath(request) {
  if (request.path) {
    return request.path
  }

  try {
    return new URL(request.url, 'http://localhost').pathname
  } catch {
    return ''
  }
}

function latestQuestionDate(questions) {
  const timestamps = questions
    .map((item) => new Date(item.updatedAt || item.createdAt || '').getTime())
    .filter((time) => !Number.isNaN(time))

  if (timestamps.length === 0) {
    return ''
  }

  return new Date(Math.max(...timestamps)).toISOString()
}

function renderTextBlocks(text) {
  const blocks = String(text || '')
    .split(/\n{2,}/)
    .map(normalizeWhitespace)
    .filter(Boolean)

  if (blocks.length === 0) {
    return '<p>Answer coming soon.</p>'
  }

  return blocks.map((block) => `<p>${escapeHtml(block)}</p>`).join('\n')
}

function getYouTubeEmbedUrl(url) {
  try {
    const parsedUrl = new URL(url)
    const shortId = parsedUrl.pathname.split('/').filter(Boolean).at(-1)
    const videoId = parsedUrl.searchParams.get('v') || shortId

    if (!videoId) {
      return ''
    }

    return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`
  } catch {
    return ''
  }
}

function htmlDocument({ title, description, canonicalUrl, structuredData, body }) {
  const jsonLd = structuredData
    ? `<script type="application/ld+json">${escapeJsonForHtml(structuredData)}</script>`
    : ''

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
    <link rel="alternate" type="text/plain" title="LLM reference" href="/llms.txt" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    ${jsonLd}
    <style>
      :root {
        color-scheme: light;
        --accent: #198754;
        --ink: #111111;
        --muted: #5f6a63;
        --line: #d8e6dc;
        --paper: #ffffff;
        --wash: #f5faf7;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: var(--paper);
        color: var(--ink);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.65;
      }

      a {
        color: #0f6b41;
        text-decoration-thickness: 0.08em;
        text-underline-offset: 0.18em;
      }

      .site-header,
      .site-footer {
        border-color: var(--line);
        border-style: solid;
        border-width: 0 0 1px;
      }

      .site-footer {
        border-width: 1px 0 0;
      }

      .wrap {
        width: min(960px, calc(100% - 32px));
        margin: 0 auto;
      }

      .site-header .wrap,
      .site-footer .wrap {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 18px 0;
      }

      .brand {
        color: var(--ink);
        font-size: 1.05rem;
        font-weight: 800;
        text-decoration: none;
      }

      .nav-link {
        font-size: 0.95rem;
        font-weight: 650;
      }

      main.wrap {
        padding: 34px 0 48px;
      }

      .breadcrumb {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 0 0 28px;
        padding: 0;
        color: var(--muted);
        font-size: 0.92rem;
        list-style: none;
      }

      .breadcrumb li:not(:last-child)::after {
        content: "/";
        margin-left: 8px;
        color: #8ba394;
      }

      .eyebrow {
        margin: 0 0 8px;
        color: var(--accent);
        font-size: 0.84rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        max-width: 880px;
        margin: 0;
        font-size: clamp(2.1rem, 6vw, 4.6rem);
        line-height: 1.02;
        letter-spacing: 0;
      }

      h2 {
        margin: 34px 0 10px;
        font-size: clamp(1.35rem, 3vw, 2rem);
        letter-spacing: 0;
      }

      .lede {
        max-width: 760px;
        margin: 18px 0 0;
        color: var(--muted);
        font-size: 1.1rem;
      }

      .answer {
        max-width: 790px;
        font-size: 1.15rem;
      }

      .answer p {
        margin: 0 0 18px;
      }

      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin: 20px 0 0;
        color: var(--muted);
        font-size: 0.95rem;
      }

      .video {
        max-width: 820px;
        margin-top: 26px;
      }

      .video iframe {
        width: 100%;
        aspect-ratio: 16 / 9;
        border: 1px solid var(--accent);
      }

      .question-list {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 14px;
        margin: 18px 0 0;
        padding: 0;
        list-style: none;
      }

      .question-list li {
        border-top: 1px solid var(--line);
        padding-top: 14px;
      }

      .question-list a {
        color: var(--ink);
        font-weight: 750;
      }

      .question-list p {
        margin: 6px 0 0;
        color: var(--muted);
        font-size: 0.95rem;
      }

      .feed-links {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 22px;
      }

      .feed-links a {
        border: 1px solid var(--line);
        padding: 8px 11px;
        border-radius: 6px;
        background: var(--wash);
        font-weight: 700;
        text-decoration: none;
      }
    </style>
  </head>
  <body>
    <header class="site-header">
      <div class="wrap">
        <a class="brand" href="/">${escapeHtml(SITE_NAME)}</a>
        <a class="nav-link" href="${QUESTION_ROUTE_PREFIX}">All questions</a>
      </div>
    </header>
    ${body}
    <footer class="site-footer">
      <div class="wrap">
        <span>${escapeHtml(SITE_NAME)}</span>
        <a href="/sitemap.xml">Sitemap</a>
      </div>
    </footer>
  </body>
</html>`
}

function baseStructuredData(origin) {
  return [
    {
      '@type': 'Organization',
      '@id': `${origin}/#organization`,
      name: SITE_NAME,
      url: `${origin}/`,
      logo: `${origin}/favicon.svg`,
      sameAs: SOCIAL_PROFILES,
    },
    {
      '@type': 'WebSite',
      '@id': `${origin}/#website`,
      name: SITE_NAME,
      url: `${origin}/`,
      description: SITE_DESCRIPTION,
      publisher: {
        '@id': `${origin}/#organization`,
      },
    },
  ]
}

function questionStructuredData(question, questions, origin, canonicalUrl) {
  const questionText = normalizeWhitespace(question.question)
  const answerText = String(question.answer || '').trim()
  const datePublished = question.createdAt || question.updatedAt || undefined
  const dateModified = question.updatedAt || question.createdAt || undefined

  return {
    '@context': 'https://schema.org',
    '@graph': [
      ...baseStructuredData(origin),
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonicalUrl}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: `${origin}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Questions',
            item: absoluteUrl(origin, QUESTION_ROUTE_PREFIX),
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: questionText,
            item: canonicalUrl,
          },
        ],
      },
      {
        '@type': 'WebPage',
        '@id': `${canonicalUrl}#webpage`,
        url: canonicalUrl,
        name: questionPageTitle(question),
        description: answerExcerpt(question),
        isPartOf: {
          '@id': `${origin}/#website`,
        },
        breadcrumb: {
          '@id': `${canonicalUrl}#breadcrumb`,
        },
        mainEntity: {
          '@id': `${canonicalUrl}#question`,
        },
        inLanguage: 'en-US',
        ...(datePublished ? { datePublished } : {}),
        ...(dateModified ? { dateModified } : {}),
      },
      {
        '@type': 'FAQPage',
        '@id': `${canonicalUrl}#faq`,
        url: canonicalUrl,
        name: questionText,
        mainEntity: [
          {
            '@type': 'Question',
            '@id': `${canonicalUrl}#question`,
            name: questionText,
            text: questionText,
            answerCount: 1,
            acceptedAnswer: {
              '@type': 'Answer',
              '@id': `${canonicalUrl}#answer`,
              text: answerText,
              url: `${canonicalUrl}#answer`,
              author: {
                '@id': `${origin}/#organization`,
              },
            },
          },
        ],
      },
      {
        '@type': 'Article',
        '@id': `${canonicalUrl}#article`,
        headline: questionText,
        description: answerExcerpt(question),
        articleSection: 'Christian Q&A',
        keywords: ['is it a sin', 'Christian answers', 'Bible questions', questionText],
        author: {
          '@id': `${origin}/#organization`,
        },
        publisher: {
          '@id': `${origin}/#organization`,
        },
        mainEntityOfPage: {
          '@id': `${canonicalUrl}#webpage`,
        },
        ...(datePublished ? { datePublished } : {}),
        ...(dateModified ? { dateModified } : {}),
      },
      {
        '@type': 'ItemList',
        '@id': `${canonicalUrl}#related-questions`,
        name: 'Related Christian questions',
        itemListElement: questions.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: absoluteUrl(origin, questionPath(item)),
          name: normalizeWhitespace(item.question),
        })),
      },
    ],
  }
}

function questionsIndexStructuredData(questions, origin, canonicalUrl) {
  const latestDate = latestQuestionDate(questions)

  return {
    '@context': 'https://schema.org',
    '@graph': [
      ...baseStructuredData(origin),
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonicalUrl}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: `${origin}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Questions',
            item: canonicalUrl,
          },
        ],
      },
      {
        '@type': 'CollectionPage',
        '@id': `${canonicalUrl}#webpage`,
        url: canonicalUrl,
        name: `Christian Questions and Answers | ${SITE_NAME}`,
        description: SITE_DESCRIPTION,
        isPartOf: {
          '@id': `${origin}/#website`,
        },
        breadcrumb: {
          '@id': `${canonicalUrl}#breadcrumb`,
        },
        mainEntity: {
          '@id': `${canonicalUrl}#questions`,
        },
        inLanguage: 'en-US',
        ...(latestDate ? { dateModified: latestDate } : {}),
      },
      {
        '@type': 'ItemList',
        '@id': `${canonicalUrl}#questions`,
        name: 'Christian questions answered by The Sin Check',
        numberOfItems: questions.length,
        itemListElement: questions.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: absoluteUrl(origin, questionPath(item)),
          name: normalizeWhitespace(item.question),
        })),
      },
    ],
  }
}

function relatedQuestionsFor(question, questions) {
  const questionIndex = questions.findIndex((item) => item.id === question.id)
  const relatedQuestions =
    questionIndex === -1
      ? questions
      : [
          ...questions.slice(Math.max(0, questionIndex - 3), questionIndex),
          ...questions.slice(questionIndex + 1, questionIndex + 4),
        ]

  return relatedQuestions.filter((item) => item.id !== question.id).slice(0, 6)
}

function renderRelatedQuestions(questions, origin) {
  if (questions.length === 0) {
    return ''
  }

  const links = questions
    .map(
      (item) => `<li>
        <a href="${escapeHtml(questionPath(item))}">${escapeHtml(item.question)}</a>
        <p>${escapeHtml(truncateText(item.answer, 118))}</p>
      </li>`,
    )
    .join('\n')

  return `<section aria-labelledby="related-title">
    <h2 id="related-title">Related Questions</h2>
    <ul class="question-list">${links}</ul>
    <div class="feed-links">
      <a href="${QUESTION_ROUTE_PREFIX}">Browse all questions</a>
      <a href="${absoluteUrl(origin, '/llms.txt')}">LLM reference</a>
    </div>
  </section>`
}

function renderQuestionPage(question, questions, origin) {
  const canonicalPath = questionPath(question)
  const canonicalUrl = absoluteUrl(origin, canonicalPath)
  const title = questionPageTitle(question)
  const description = answerExcerpt(question)
  const relatedQuestions = relatedQuestionsFor(question, questions)
  const embedUrl = getYouTubeEmbedUrl(question.videoUrl)
  const updatedDate = formatDisplayDate(question.updatedAt || question.createdAt)
  const videoHtml = question.videoUrl
    ? `<section class="video" aria-labelledby="video-title">
        <h2 id="video-title">Video</h2>
        ${
          embedUrl
            ? `<iframe src="${escapeHtml(embedUrl)}" title="${escapeHtml(
                `Video answer for ${question.question}`,
              )}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`
            : ''
        }
        <p><a href="${escapeHtml(question.videoUrl)}" rel="noopener noreferrer">Watch the related video</a></p>
      </section>`
    : ''
  const updatedHtml = updatedDate
    ? `<span>Updated <time datetime="${escapeHtml(
        question.updatedAt || question.createdAt,
      )}">${escapeHtml(updatedDate)}</time></span>`
    : ''
  const body = `<main class="wrap">
    <nav aria-label="Breadcrumb">
      <ol class="breadcrumb">
        <li><a href="/">Home</a></li>
        <li><a href="${QUESTION_ROUTE_PREFIX}">Questions</a></li>
        <li>${escapeHtml(question.question)}</li>
      </ol>
    </nav>
    <article>
      <p class="eyebrow">Question ${escapeHtml(question.id)}</p>
      <h1>${escapeHtml(question.question)}</h1>
      <p class="lede">${escapeHtml(description)}</p>
      <div class="meta">
        <span>Official answer from ${escapeHtml(SITE_NAME)}</span>
        ${updatedHtml}
      </div>
      <section class="answer" id="answer" aria-labelledby="answer-title">
        <h2 id="answer-title">Answer</h2>
        ${renderTextBlocks(question.answer)}
      </section>
      ${videoHtml}
      ${renderRelatedQuestions(relatedQuestions, origin)}
    </article>
  </main>`

  return htmlDocument({
    title,
    description,
    canonicalUrl,
    structuredData: questionStructuredData(question, relatedQuestions, origin, canonicalUrl),
    body,
  })
}

function renderQuestionsIndexPage(questions, origin) {
  const canonicalUrl = absoluteUrl(origin, QUESTION_ROUTE_PREFIX)
  const title = `Christian Questions and Answers | ${SITE_NAME}`
  const description = `Browse every ${SITE_NAME} Christian answer as a crawlable index of questions about sin, faith, and Scripture.`
  const links = questions
    .map(
      (item) => `<li>
        <a href="${escapeHtml(questionPath(item))}">${escapeHtml(item.question)}</a>
        <p>${escapeHtml(truncateText(item.answer, 132))}</p>
      </li>`,
    )
    .join('\n')
  const body = `<main class="wrap">
    <nav aria-label="Breadcrumb">
      <ol class="breadcrumb">
        <li><a href="/">Home</a></li>
        <li>Questions</li>
      </ol>
    </nav>
    <section>
      <p class="eyebrow">Christian Q&A Library</p>
      <h1>Christian Questions and Answers</h1>
      <p class="lede">${escapeHtml(description)}</p>
      <div class="feed-links">
        <a href="/sitemap.xml">XML sitemap</a>
        <a href="/llms.txt">LLM reference</a>
        <a href="/answers.json">Answer data</a>
      </div>
      <ul class="question-list">${links}</ul>
    </section>
  </main>`

  return htmlDocument({
    title,
    description,
    canonicalUrl,
    structuredData: questionsIndexStructuredData(questions, origin, canonicalUrl),
    body,
  })
}

function renderSitemapXml(questions, origin) {
  const latestDate = latestQuestionDate(questions)
  const urlEntries = [
    { loc: `${origin}/`, lastmod: latestDate },
    { loc: absoluteUrl(origin, QUESTION_ROUTE_PREFIX), lastmod: latestDate },
    ...questions.map((item) => ({
      loc: absoluteUrl(origin, questionPath(item)),
      lastmod: item.updatedAt || item.createdAt || '',
    })),
  ]
    .map(
      (item) => `  <url>
    <loc>${escapeXml(item.loc)}</loc>${item.lastmod ? `\n    <lastmod>${escapeXml(item.lastmod)}</lastmod>` : ''}
  </url>`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>
`
}

function renderRobotsTxt(origin) {
  const rules = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    '',
    'User-agent: OAI-SearchBot',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    '',
    'User-agent: GPTBot',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    '',
    'User-agent: ChatGPT-User',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    '',
    `Sitemap: ${absoluteUrl(origin, '/sitemap.xml')}`,
  ]

  return `${rules.join('\n')}\n`
}

function renderLlmsTxt(questions, origin) {
  const questionLinks = questions
    .map(
      (item) =>
        `- [${normalizeWhitespace(item.question)}](${absoluteUrl(
          origin,
          questionPath(item),
        )}): ${truncateText(item.answer, 150)}`,
    )
    .join('\n')

  return `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

This file points AI assistants and retrieval systems to the canonical public answers on ${SITE_NAME}.

## Primary Resources

- [Question index](${absoluteUrl(origin, QUESTION_ROUTE_PREFIX)})
- [Full answer corpus](${absoluteUrl(origin, '/llms-full.txt')})
- [Machine-readable answer data](${absoluteUrl(origin, '/answers.json')})
- [XML sitemap](${absoluteUrl(origin, '/sitemap.xml')})

## Questions

${questionLinks}
`
}

function renderLlmsFullTxt(questions, origin) {
  const answers = questions
    .map(
      (item) => `## ${normalizeWhitespace(item.question)}

Canonical URL: ${absoluteUrl(origin, questionPath(item))}
Question ID: ${item.id}

${String(item.answer || '').trim()}
`,
    )
    .join('\n')

  return `# ${SITE_NAME} Full Answer Corpus

${SITE_DESCRIPTION}

${answers}
`
}

function answersJson(questions, origin) {
  const latestDate = latestQuestionDate(questions)

  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${SITE_NAME} Christian Q&A Answers`,
    description: SITE_DESCRIPTION,
    url: absoluteUrl(origin, '/answers.json'),
    license: absoluteUrl(origin, '/'),
    creator: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: `${origin}/`,
      sameAs: SOCIAL_PROFILES,
    },
    ...(latestDate ? { dateModified: latestDate } : {}),
    hasPart: questions.map((item) => ({
      '@type': 'Question',
      identifier: String(item.id),
      name: normalizeWhitespace(item.question),
      url: absoluteUrl(origin, questionPath(item)),
      acceptedAnswer: {
        '@type': 'Answer',
        text: String(item.answer || '').trim(),
        url: `${absoluteUrl(origin, questionPath(item))}#answer`,
      },
      ...(item.createdAt ? { dateCreated: item.createdAt } : {}),
      ...(item.updatedAt ? { dateModified: item.updatedAt } : {}),
    })),
  }
}

export function requestOrigin(request) {
  const configuredOrigin = String(
    process.env.PUBLIC_SITE_URL || process.env.SITE_URL || process.env.VITE_PUBLIC_SITE_URL || '',
  )
    .trim()
    .replace(/\/+$/g, '')

  if (configuredOrigin) {
    return configuredOrigin
  }

  const host = getHeader(request, 'x-forwarded-host') || getHeader(request, 'host')

  if (!host) {
    return FALLBACK_SITE_ORIGIN
  }

  const protocol =
    getHeader(request, 'x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')

  return `${protocol}://${host}`.replace(/\/+$/g, '')
}

export async function questionPageHandler(request, response) {
  if (!ensurePublicGet(request, response)) {
    return
  }

  const rawId =
    request.query?.idSlug ||
    request.query?.id ||
    request.params?.idSlug ||
    request.params?.id ||
    requestPath(request).replace(`${QUESTION_ROUTE_PREFIX}/`, '')
  const id = parseQuestionIdSlug(rawId)

  if (!id) {
    throw createHttpError(404, 'Question was not found.')
  }

  const [question, questions] = await Promise.all([getPublicQuestion(id), getSeoQuestions()])
  const origin = requestOrigin(request)
  const canonicalPath = questionPath(question)
  const path = requestPath(request)

  if (request.method === 'GET' && path.startsWith(QUESTION_ROUTE_PREFIX) && path !== canonicalPath) {
    redirectResponse(response, 301, canonicalPath)
    return
  }

  sendBody(
    request,
    response,
    200,
    renderQuestionPage(question, questions, origin),
    'text/html; charset=utf-8',
  )
}

export async function questionsIndexPageHandler(request, response) {
  if (!ensurePublicGet(request, response)) {
    return
  }

  const questions = await getSeoQuestions()
  const origin = requestOrigin(request)

  sendBody(
    request,
    response,
    200,
    renderQuestionsIndexPage(questions, origin),
    'text/html; charset=utf-8',
  )
}

export async function sitemapHandler(request, response) {
  if (!ensurePublicGet(request, response)) {
    return
  }

  const questions = await getSeoQuestions()

  sendBody(
    request,
    response,
    200,
    renderSitemapXml(questions, requestOrigin(request)),
    'application/xml; charset=utf-8',
  )
}

export async function robotsHandler(request, response) {
  if (!ensurePublicGet(request, response)) {
    return
  }

  sendBody(
    request,
    response,
    200,
    renderRobotsTxt(requestOrigin(request)),
    'text/plain; charset=utf-8',
  )
}

export async function llmsHandler(request, response) {
  if (!ensurePublicGet(request, response)) {
    return
  }

  const questions = await getSeoQuestions()

  sendBody(
    request,
    response,
    200,
    renderLlmsTxt(questions, requestOrigin(request)),
    'text/plain; charset=utf-8',
  )
}

export async function llmsFullHandler(request, response) {
  if (!ensurePublicGet(request, response)) {
    return
  }

  const questions = await getSeoQuestions()

  sendBody(
    request,
    response,
    200,
    renderLlmsFullTxt(questions, requestOrigin(request)),
    'text/plain; charset=utf-8',
  )
}

export async function answersJsonHandler(request, response) {
  if (!ensurePublicGet(request, response)) {
    return
  }

  const questions = await getSeoQuestions()

  sendJsonBody(request, response, 200, answersJson(questions, requestOrigin(request)))
}

export async function handleSeoError(request, response, error) {
  const status = error.status || 500
  const message = status === 500 ? 'Server error.' : error.message

  if (status === 500) {
    console.error(error)
  }

  const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="robots" content="noindex, follow" />
    <title>${escapeHtml(message)} | ${escapeHtml(SITE_NAME)}</title>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(message)}</h1>
      <p><a href="/">Return to ${escapeHtml(SITE_NAME)}</a></p>
    </main>
  </body>
</html>`

  sendBody(request, response, status, body, 'text/html; charset=utf-8')
}
