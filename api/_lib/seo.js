import { getSeoQuestions } from './db.js'
import {
  siDiscord,
  siInstagram,
  siThreads,
  siX,
} from 'simple-icons'
import {
  QUESTION_ROUTE_PREFIX,
  SITE_NAME,
  answerExcerpt,
  normalizeWhitespace,
  questionPageTitle,
  questionPath,
  slugifyQuestion,
} from '../../shared/seo.js'

const CACHE_CONTROL = 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400'
const FALLBACK_SITE_ORIGIN = 'https://thesincheck.com'
const KOFI_WIDGET_ID = 'J3J41DE2OT'
const CHAT_HISTORY_LIMIT = 8
const CHAT_WELCOME_MESSAGE =
  "Hey, I'm the virtual assistant for TheSinCheck. You can ask me questions about whether something is sinful. I'll use TheSinCheck Q&A first, then answer from a biblical Christian point of view."

const socialLinks = [
  {
    name: 'Instagram',
    href: 'https://www.instagram.com/imbestgeorge',
    icon: siInstagram,
  },
  {
    name: 'X',
    href: 'https://x.com/imbestgeorge',
    icon: siX,
  },
  {
    name: 'Threads',
    href: 'https://www.threads.com/@imbestgeorge',
    icon: siThreads,
  },
  {
    name: 'Discord',
    href: 'https://discord.gg/MFJsEPKGfb',
    icon: siDiscord,
  },
]

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

function findQuestionBySlug(questions, slug) {
  const normalizedSlug = slugifyQuestion(slug)

  return questions.find((item) => slugifyQuestion(item.question) === normalizedSlug)
}

function questionStructuredData(question, origin, canonicalUrl) {
  const questionText = normalizeWhitespace(question.question)
  const answerText = String(question.answer || '').trim()
  const datePublished = question.createdAt || question.updatedAt || undefined
  const dateModified = question.updatedAt || question.createdAt || undefined

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${canonicalUrl}#webpage`,
        url: canonicalUrl,
        name: questionPageTitle(question),
        description: answerExcerpt(question),
        isPartOf: {
          '@type': 'WebSite',
          name: SITE_NAME,
          url: `${origin}/`,
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
            acceptedAnswer: {
              '@type': 'Answer',
              '@id': `${canonicalUrl}#answer`,
              text: answerText,
              url: `${canonicalUrl}#answer`,
            },
          },
        ],
      },
    ],
  }
}

function htmlDocument({ title, description, canonicalUrl, structuredData, body }) {
  const socialItems = socialLinks
    .map(
      (item) => `<li class="nav-item">
              <a
                class="nav-link p-1 d-inline-flex align-items-center justify-content-center"
                href="${escapeHtml(item.href)}"
                target="_blank"
                rel="noreferrer"
                aria-label="${escapeHtml(item.name)}"
              >
                <svg
                  width="30"
                  height="30"
                  viewBox="0 0 24 24"
                  role="img"
                  aria-hidden="true"
                >
                  <path fill="#fff" d="${escapeHtml(item.icon.path)}"></path>
                </svg>
              </a>
            </li>`,
    )
    .join('\n')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <link rel="apple-touch-icon" href="/favicon.png" />
    <link rel="stylesheet" href="/bootstrap.min.css" />
    <link rel="stylesheet" href="/bootstrap-icons.css" />
    <link rel="stylesheet" href="/bootstrap-theme.css" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <script type="application/ld+json">${escapeJsonForHtml(structuredData)}</script>
    <style>
      .page-shell {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }

      main {
        width: min(820px, calc(100% - 32px));
        margin: 0 auto;
        padding: 48px 0;
        flex: 1;
      }

      .all-questions-link {
        color: #000000;
        display: inline-block;
        margin-bottom: 1.5rem;
        text-decoration: underline;
        text-underline-offset: 0.18em;
      }

      h1 {
        margin: 0 0 24px;
        font-size: 1.5rem;
        font-weight: 600;
        line-height: 1.5;
        letter-spacing: 0;
      }

      .answer {
        font-size: 1.15rem;
      }

      .answer p {
        margin: 0 0 18px;
      }
    </style>
  </head>
  <body>
    <div class="page-shell">
      <nav class="navbar bg-success">
        <div class="container-fluid">
          <div class="row align-items-center g-1 g-md-3 w-100">
            <div class="col-4 col-md-3"></div>
            <div class="col-4 col-md-6 text-center">
              <a href="/" class="navbar-brand m-0">
                <img
                  src="/logo.png"
                  width="170"
                  height="80"
                  class="img-fluid"
                  alt="${escapeHtml(SITE_NAME)}"
                />
              </a>
            </div>
            <div class="d-none d-md-flex col-md-3 justify-content-md-end">
              <div aria-label="Support me on Ko-fi"></div>
            </div>
          </div>
        </div>
      </nav>
      ${body}
      <footer class="bg-success py-4 mt-auto">
        <div class="container">
          <div class="d-flex d-md-none justify-content-center mb-3">
            <div aria-label="Support me on Ko-fi"></div>
          </div>
          <ul class="nav justify-content-center gap-3">
            ${socialItems}
          </ul>
        </div>
      </footer>
      <div class="chatbot-widget" data-chatbot>
        <section class="chatbot-panel bg-white border border-success shadow d-none" aria-label="Chatbot">
          <div class="chatbot-header px-3 py-3">
            <img src="/logo.png" class="chatbot-logo" alt="${escapeHtml(SITE_NAME)}" />
            <h2 class="h6 m-0">TSC Virtual Assistant</h2>
            <button
              type="button"
              class="btn btn-success d-inline-flex align-items-center justify-content-center chatbot-close"
              aria-label="Close chatbot"
              title="Close chatbot"
              data-chatbot-close
            >
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </div>

          <div class="chatbot-messages" data-chatbot-messages>
            <div class="chatbot-message chatbot-message-assistant">
              <p>${escapeHtml(CHAT_WELCOME_MESSAGE)}</p>
            </div>
            <div data-chatbot-end></div>
          </div>

          <div class="chatbot-error alert alert-dark border-dark d-none" data-chatbot-error></div>

          <form class="chatbot-form" data-chatbot-form>
            <label for="chatbot-message" class="visually-hidden">Chat message</label>
            <textarea
              id="chatbot-message"
              class="form-control border-success shadow-none chatbot-input"
              rows="1"
              maxlength="800"
              placeholder="Ask a question..."
              data-chatbot-input
            ></textarea>
            <button
              type="submit"
              class="btn btn-success d-inline-flex align-items-center justify-content-center chatbot-send"
              disabled
              aria-label="Send message"
              title="Send message"
              data-chatbot-send
            >
              <i class="bi bi-send-fill" aria-hidden="true"></i>
            </button>
          </form>

          <div class="chatbot-meta d-none" data-chatbot-meta></div>
        </section>

        <button
          type="button"
          class="btn btn-success chatbot-toggle d-inline-flex align-items-center justify-content-center"
          aria-label="Open chatbot"
          aria-expanded="false"
          title="Open chatbot"
          data-chatbot-toggle
        >
          <i class="bi bi-chat-dots-fill" aria-hidden="true"></i>
        </button>
      </div>
    </div>
    <script>
      (function () {
        function renderKofiWidgets() {
          if (!window.kofiwidget2) return;
          var widgets = document.querySelectorAll('[aria-label="Support me on Ko-fi"]');
          widgets.forEach(function (widget) {
            if (widget.dataset.rendered === 'true') return;
            window.kofiwidget2.init('Support me on Ko-fi', '#72a4f2', '${KOFI_WIDGET_ID}');
            widget.innerHTML = window.kofiwidget2.getHTML();
            widget.dataset.rendered = 'true';
          });
        }

        if (window.kofiwidget2) {
          renderKofiWidgets();
          return;
        }

        var script = document.createElement('script');
        script.src = 'https://storage.ko-fi.com/cdn/widget/Widget_2.js';
        script.async = true;
        script.addEventListener('load', renderKofiWidgets);
        document.body.appendChild(script);
      })();

      (function () {
        var chatbot = document.querySelector('[data-chatbot]');
        if (!chatbot) return;

        var panel = chatbot.querySelector('.chatbot-panel');
        var toggleButton = chatbot.querySelector('[data-chatbot-toggle]');
        var closeButton = chatbot.querySelector('[data-chatbot-close]');
        var form = chatbot.querySelector('[data-chatbot-form]');
        var input = chatbot.querySelector('[data-chatbot-input]');
        var sendButton = chatbot.querySelector('[data-chatbot-send]');
        var messagesContainer = chatbot.querySelector('[data-chatbot-messages]');
        var messagesEnd = chatbot.querySelector('[data-chatbot-end]');
        var errorBox = chatbot.querySelector('[data-chatbot-error]');
        var metaBox = chatbot.querySelector('[data-chatbot-meta]');
        var isOpen = false;
        var isSending = false;
        var remaining = null;
        var limit = null;
        var messages = [
          {
            role: 'assistant',
            text: ${JSON.stringify(CHAT_WELCOME_MESSAGE)},
          },
        ];

        function setOpen(nextOpen) {
          isOpen = nextOpen;
          panel.classList.toggle('d-none', !isOpen);
          toggleButton.setAttribute('aria-expanded', String(isOpen));
          toggleButton.setAttribute('aria-label', isOpen ? 'Close chatbot' : 'Open chatbot');
          toggleButton.setAttribute('title', isOpen ? 'Close chatbot' : 'Open chatbot');
          toggleButton.innerHTML = '<i class="bi ' + (isOpen ? 'bi-x-lg' : 'bi-chat-dots-fill') + '" aria-hidden="true"></i>';

          if (isOpen) {
            scrollToEnd();
            input.focus();
          }
        }

        function scrollToEnd() {
          messagesEnd.scrollIntoView({ block: 'end' });
        }

        function setError(message) {
          errorBox.textContent = message || '';
          errorBox.classList.toggle('d-none', !message);
        }

        function setMeta() {
          var shouldShow = Number.isInteger(remaining) && Number.isInteger(limit);
          metaBox.classList.toggle('d-none', !shouldShow);
          metaBox.textContent = shouldShow ? remaining + ' of ' + limit + ' messages left today' : '';
        }

        function updateSendState() {
          sendButton.disabled = !input.value.trim() || isSending || remaining === 0;
          input.disabled = isSending || remaining === 0;
          input.placeholder = remaining === 0 ? 'Daily limit reached' : 'Ask a question...';
        }

        function appendMessage(role, text) {
          messages.push({ role: role, text: text });

          var messageEl = document.createElement('div');
          messageEl.className = 'chatbot-message chatbot-message-' + role;
          var paragraph = document.createElement('p');
          paragraph.textContent = text;
          messageEl.appendChild(paragraph);
          messagesContainer.insertBefore(messageEl, messagesEnd);
          scrollToEnd();
        }

        function setThinking(showThinking) {
          var existing = chatbot.querySelector('[data-chatbot-thinking]');

          if (existing) {
            existing.remove();
          }

          if (!showThinking) {
            return;
          }

          var thinkingEl = document.createElement('div');
          thinkingEl.className = 'chatbot-message chatbot-message-assistant d-inline-flex align-items-center gap-2';
          thinkingEl.dataset.chatbotThinking = 'true';
          thinkingEl.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>Thinking...</span>';
          messagesContainer.insertBefore(thinkingEl, messagesEnd);
          scrollToEnd();
        }

        async function parseChatResponse(response) {
          var data = await response.json().catch(function () {
            return {};
          });

          if (!response.ok) {
            var error = new Error(data.message || 'The chatbot could not answer right now.');
            error.remaining = data.remaining;
            error.limit = data.limit;
            throw error;
          }

          return data;
        }

        toggleButton.addEventListener('click', function () {
          setOpen(!isOpen);
        });

        closeButton.addEventListener('click', function () {
          setOpen(false);
        });

        input.addEventListener('input', updateSendState);
        input.addEventListener('keydown', function (event) {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            form.requestSubmit();
          }
        });

        form.addEventListener('submit', async function (event) {
          event.preventDefault();

          var messageText = input.value.trim();
          if (!messageText || isSending || remaining === 0) return;

          var history = messages
            .slice(1)
            .slice(-${CHAT_HISTORY_LIMIT})
            .map(function (message) {
              return {
                role: message.role,
                text: message.text,
              };
            });

          appendMessage('user', messageText);
          input.value = '';
          setError('');
          isSending = true;
          setThinking(true);
          updateSendState();

          try {
            var response = await fetch('/api/chat', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                message: messageText,
                history: history,
              }),
            });
            var data = await parseChatResponse(response);

            appendMessage('assistant', data.reply);
            remaining = data.remaining;
            limit = data.limit;
            setMeta();
          } catch (error) {
            setError(error.message);

            if (Number.isInteger(error.remaining)) {
              remaining = error.remaining;
            }

            if (Number.isInteger(error.limit)) {
              limit = error.limit;
            }

            setMeta();
          } finally {
            isSending = false;
            setThinking(false);
            updateSendState();
          }
        });

        updateSendState();
      })();
    </script>
  </body>
</html>`
}

function renderQuestionPage(question, origin) {
  const canonicalPath = questionPath(question)
  const canonicalUrl = absoluteUrl(origin, canonicalPath)
  const title = questionPageTitle(question)
  const description = answerExcerpt(question)
  const body = `<main>
    <a class="all-questions-link" href="/">&larr; View All Questions</a>
    <article>
      <h1>${escapeHtml(question.question)}</h1>
      <div class="answer" id="answer">
        ${renderTextBlocks(question.answer)}
      </div>
    </article>
  </main>`

  return htmlDocument({
    title,
    description,
    canonicalUrl,
    structuredData: questionStructuredData(question, origin, canonicalUrl),
    body,
  })
}

function renderSitemapXml(questions, origin) {
  const latestDate = latestQuestionDate(questions)
  const urlEntries = [
    { loc: `${origin}/`, lastmod: latestDate },
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
  return `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/

Sitemap: ${absoluteUrl(origin, '/sitemap.xml')}
`
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

  const rawSlug =
    request.query?.slug ||
    request.params?.slug ||
    requestPath(request).replace(`${QUESTION_ROUTE_PREFIX}/`, '')

  if (!rawSlug) {
    redirectResponse(response, 302, '/')
    return
  }

  const questions = await getSeoQuestions()
  const question = findQuestionBySlug(questions, rawSlug)

  if (!question) {
    redirectResponse(response, 302, '/')
    return
  }

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
    renderQuestionPage(question, origin),
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

export async function handleSeoError(request, response, error) {
  const status = error.status || 500

  if (status === 500) {
    console.error(error)
  }

  redirectResponse(response, 302, '/')
}
