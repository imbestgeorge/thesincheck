import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  siDiscord,
  siInstagram,
  siThreads,
  siX,
} from 'simple-icons'
import logo from './assets/logo.png'

const PAGE_SIZE = 12
const ADMIN_TOKEN_KEY = 'thesincheck.adminToken'
const CHAT_HISTORY_LIMIT = 8
const NOTICE_VISIBLE_MS = 3200
const NOTICE_FADE_MS = 350

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

function normalizeCatalog(data) {
  const questions = Array.isArray(data.questions)
    ? data.questions
        .filter((item) => Number.isInteger(item.id))
        .map((item) => ({
          id: item.id,
          question: String(item.question || ''),
          answer: String(item.answer || ''),
          videoUrl: String(item.videoUrl || ''),
          isEnabled: item.isEnabled !== false,
        }))
        .sort((first, second) => first.id - second.id)
    : []
  const highestQuestionId =
    questions.length > 0 ? Math.max(...questions.map((item) => item.id)) : 0
  const nextId = Number.isInteger(data.nextId) && data.nextId > highestQuestionId
    ? data.nextId
    : highestQuestionId + 1

  return {
    questions,
    nextId,
  }
}

async function parseApiResponse(response) {
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.message || 'Something went wrong.')
  }

  return data
}

async function parseChatApiResponse(response) {
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(data.message || 'The chatbot could not answer right now.')

    error.remaining = data.remaining
    error.limit = data.limit
    throw error
  }

  return data
}

function AutoDismissAlert({ text, variant, onDismiss }) {
  const [isShowing, setIsShowing] = useState(false)
  const onDismissRef = useRef(onDismiss)

  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    if (!text) {
      return undefined
    }

    setIsShowing(true)

    const fadeTimer = window.setTimeout(() => {
      setIsShowing(false)
    }, NOTICE_VISIBLE_MS)
    const hideTimer = window.setTimeout(() => {
      onDismissRef.current?.()
    }, NOTICE_VISIBLE_MS + NOTICE_FADE_MS)

    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(hideTimer)
    }
  }, [text])

  if (!text) {
    return null
  }

  const isSuccess = variant === 'success'

  return (
    <div
      className={`alert ${isSuccess ? 'alert-success border-success' : 'alert-dark border-dark'} fade ${
        isShowing ? 'show' : ''
      }`}
      role="status"
    >
      {text}
    </div>
  )
}

function createChatMessage(role, text) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    text,
  }
}

function getYouTubeEmbedUrl(url) {
  try {
    const parsedUrl = new URL(url)
    const shortId = parsedUrl.pathname.split('/').filter(Boolean).at(-1)
    const videoId = parsedUrl.searchParams.get('v') || shortId

    return `https://www.youtube.com/embed/${videoId}`
  } catch {
    return ''
  }
}

function KofiButton() {
  const widgetRef = useRef(null)

  useEffect(() => {
    function renderWidget() {
      if (!widgetRef.current || !window.kofiwidget2) {
        return
      }

      window.kofiwidget2.init('Support me on Ko-fi', '#72a4f2', 'J3J41DE2OT')
      widgetRef.current.innerHTML = window.kofiwidget2.getHTML()
    }

    if (window.kofiwidget2) {
      renderWidget()
      return
    }

    const existingScript = document.getElementById('kofi-widget-script')

    if (existingScript) {
      existingScript.addEventListener('load', renderWidget)

      return () => existingScript.removeEventListener('load', renderWidget)
    }

    const script = document.createElement('script')
    script.id = 'kofi-widget-script'
    script.src = 'https://storage.ko-fi.com/cdn/widget/Widget_2.js'
    script.async = true
    script.addEventListener('load', renderWidget)
    document.body.appendChild(script)

    return () => script.removeEventListener('load', renderWidget)
  }, [])

  return <div ref={widgetRef} aria-label="Support me on Ko-fi"></div>
}

function ChatbotWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([
    {
      id: 'chat-welcome',
      role: 'assistant',
      text: "Hey, I'm the virtual assistant for TheSinCheck. You can ask me questions about whether something is sinful. I'll use TheSinCheck Q&A first, then answer from a biblical Christian point of view.",
    },
  ])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [remaining, setRemaining] = useState(null)
  const [limit, setLimit] = useState(null)
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ block: 'end' })
    }
  }, [isOpen, messages, isSending])

  async function handleSubmit(event) {
    event.preventDefault()

    const messageText = draft.trim()

    if (!messageText || isSending || remaining === 0) {
      return
    }

    const userMessage = createChatMessage('user', messageText)
    const history = messages
      .filter((message) => message.id !== 'chat-welcome')
      .slice(-CHAT_HISTORY_LIMIT)
      .map((message) => ({
        role: message.role,
        text: message.text,
      }))

    setMessages((currentMessages) => [...currentMessages, userMessage])
    setDraft('')
    setError('')
    setIsSending(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageText,
          history,
        }),
      })
      const data = await parseChatApiResponse(response)

      setMessages((currentMessages) => [
        ...currentMessages,
        createChatMessage('assistant', data.reply),
      ])
      setRemaining(data.remaining)
      setLimit(data.limit)
    } catch (error) {
      setError(error.message)

      if (Number.isInteger(error.remaining)) {
        setRemaining(error.remaining)
      }

      if (Number.isInteger(error.limit)) {
        setLimit(error.limit)
      }
    } finally {
      setIsSending(false)
    }
  }

  function handleDraftKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  const isLimitReached = remaining === 0

  return (
    <div className="chatbot-widget">
      {isOpen && (
        <section className="chatbot-panel bg-white border border-success shadow" aria-label="Chatbot">
          <div className="chatbot-header px-3 py-3">
            <img src={logo} className="chatbot-logo" alt="TheSinCheck" />
            <h2 className="h6 m-0">TSC Virtual Assistant</h2>
            <button
              type="button"
              className="btn btn-success d-inline-flex align-items-center justify-content-center chatbot-close"
              aria-label="Close chatbot"
              title="Close chatbot"
              onClick={() => setIsOpen(false)}
            >
              <i className="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </div>

          <div className="chatbot-messages">
            {messages.map((message) => (
              <div className={`chatbot-message chatbot-message-${message.role}`} key={message.id}>
                <p>{message.text}</p>
              </div>
            ))}
            {isSending && (
              <div className="chatbot-message chatbot-message-assistant d-inline-flex align-items-center gap-2">
                <span className="spinner-border spinner-border-sm" aria-hidden="true"></span>
                <span>Thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef}></div>
          </div>

          {error && <div className="chatbot-error alert alert-dark border-dark">{error}</div>}

          <form className="chatbot-form" onSubmit={handleSubmit}>
            <label htmlFor="chatbot-message" className="visually-hidden">
              Chat message
            </label>
            <textarea
              id="chatbot-message"
              className="form-control border-success shadow-none chatbot-input"
              rows="1"
              maxLength="800"
              placeholder={isLimitReached ? 'Daily limit reached' : 'Ask a question...'}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleDraftKeyDown}
              disabled={isSending || isLimitReached}
            ></textarea>
            <button
              type="submit"
              className="btn btn-success d-inline-flex align-items-center justify-content-center chatbot-send"
              disabled={!draft.trim() || isSending || isLimitReached}
              aria-label="Send message"
              title="Send message"
            >
              <i className="bi bi-send-fill" aria-hidden="true"></i>
            </button>
          </form>

          {Number.isInteger(remaining) && Number.isInteger(limit) && (
            <div className="chatbot-meta">
              {remaining} of {limit} messages left today
            </div>
          )}
        </section>
      )}

      <button
        type="button"
        className="btn btn-success chatbot-toggle d-inline-flex align-items-center justify-content-center"
        aria-label={isOpen ? 'Close chatbot' : 'Open chatbot'}
        aria-expanded={isOpen}
        title={isOpen ? 'Close chatbot' : 'Open chatbot'}
        onClick={() => setIsOpen((currentValue) => !currentValue)}
      >
        <i className={`bi ${isOpen ? 'bi-x-lg' : 'bi-chat-dots-fill'}`} aria-hidden="true"></i>
      </button>
    </div>
  )
}

function SiteNavbar() {
  return (
    <nav className="navbar bg-success">
      <div className="container-fluid">
        <div className="row align-items-center g-1 g-md-3 w-100">
          <div className="col-4 col-md-3"></div>
          <div className="col-4 col-md-6 text-center">
            <a href="/" className="navbar-brand m-0">
              <img
                src={logo}
                width="170"
                height="80"
                className="img-fluid"
                alt="TheSinCheck"
              />
            </a>
          </div>
          <div className="d-none d-md-flex col-md-3 justify-content-md-end">
            <KofiButton />
          </div>
        </div>
      </div>
    </nav>
  )
}

function QuestionPanel({ item, accordionId }) {
  const collapseId = `question-${item.id}`
  const headingId = `question-heading-${item.id}`
  const embedUrl = item.videoUrl ? getYouTubeEmbedUrl(item.videoUrl) : ''

  return (
    <section className="border-bottom border-success">
      <h2 className="m-0" id={headingId}>
        <button
          className="btn w-100 text-start rounded-0 d-flex justify-content-between align-items-center gap-3 py-3 px-0 text-black fs-4 fw-semibold border-0 shadow-none"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target={`#${collapseId}`}
          aria-expanded="false"
          aria-controls={collapseId}
        >
          <span>
            {item.id}. {item.question}
          </span>
          <i className="bi bi-chevron-down" aria-hidden="true"></i>
        </button>
      </h2>
      <div
        id={collapseId}
        className="collapse"
        aria-labelledby={headingId}
        data-bs-parent={`#${accordionId}`}
      >
        <div className="pb-4">
          <p className="question-answer mb-3 text-black fs-5">{item.answer}</p>
          {embedUrl && (
            <div className="ratio ratio-16x9 border border-success">
              <iframe
                src={embedUrl}
                title={`YouTube short for question ${item.id}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              ></iframe>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function Pagination({ currentPage, pageCount, onPageChange }) {
  const [pageButtonLimit, setPageButtonLimit] = useState(() =>
    window.innerWidth >= 992 ? 10 : 5,
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 992px)')
    const handleChange = () => setPageButtonLimit(mediaQuery.matches ? 10 : 5)

    handleChange()
    mediaQuery.addEventListener('change', handleChange)

    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  if (pageCount <= 1) {
    return null
  }

  function handlePageChange(page) {
    if (page === currentPage) {
      return
    }

    onPageChange(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const visibleCount = Math.min(pageButtonLimit, pageCount)
  const pagesBeforeCurrent = Math.floor((visibleCount - 1) / 2)
  const firstVisiblePage = Math.min(
    Math.max(1, currentPage - pagesBeforeCurrent),
    pageCount - visibleCount + 1,
  )
  const visiblePages = Array.from(
    { length: visibleCount },
    (_, index) => firstVisiblePage + index,
  )

  return (
    <nav aria-label="Questions pagination" className="mt-4">
      <ul className="pagination justify-content-center flex-wrap">
        <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
          <button
            type="button"
            className="page-link"
            tabIndex={currentPage === 1 ? -1 : undefined}
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            Previous
          </button>
        </li>
        {visiblePages.map((page) => {
          const isCurrentPage = page === currentPage

          return (
            <li className={`page-item ${isCurrentPage ? 'active' : ''}`} key={page}>
              <button
                type="button"
                className="page-link"
                aria-current={isCurrentPage ? 'page' : undefined}
                onClick={() => handlePageChange(page)}
              >
                {page}
                {isCurrentPage && <span className="visually-hidden"> (current)</span>}
              </button>
            </li>
          )
        })}
        <li className={`page-item ${currentPage === pageCount ? 'disabled' : ''}`}>
          <button
            type="button"
            className="page-link"
            tabIndex={currentPage === pageCount ? -1 : undefined}
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === pageCount}
          >
            Next
          </button>
        </li>
      </ul>
    </nav>
  )
}

function HomePage({ questions }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const filteredQuestions = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    if (!normalizedSearch) {
      return questions
    }

    return questions.filter((item) => {
      const searchableText = `${item.id} ${item.question} ${item.answer}`.toLowerCase()

      return searchableText.includes(normalizedSearch)
    })
  }, [questions, searchTerm])

  const pageCount = Math.max(1, Math.ceil(filteredQuestions.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, pageCount)
  const startIndex = (safePage - 1) * PAGE_SIZE
  const visibleQuestions = filteredQuestions.slice(startIndex, startIndex + PAGE_SIZE)
  const accordionId = `questions-page-${safePage}`

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount))
  }, [pageCount])

  return (
    <>
      <SiteNavbar />
      <main className="flex-grow-1">
        <section className="container py-4 py-md-5">
          <div className="row justify-content-center">
            <div className="col-12 col-lg-10 col-xl-8">
              <label htmlFor="question-search" className="visually-hidden">
                Search questions
              </label>
              <input
                id="question-search"
                type="search"
                className="form-control form-control-lg border-0 border-bottom border-success rounded-0 shadow-none fs-4"
                placeholder="Search questions..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="container pb-5">
          <div className="row justify-content-center">
            <div className="col-12 col-lg-10">
              {visibleQuestions.length > 0 ? (
                <div id={accordionId}>
                  {visibleQuestions.map((item) => (
                    <QuestionPanel key={item.id} item={item} accordionId={accordionId} />
                  ))}
                </div>
              ) : (
                <div className="border border-success rounded p-4 text-center">
                  <p className="mb-0">No questions found.</p>
                </div>
              )}

              <Pagination
                currentPage={safePage}
                pageCount={pageCount}
                onPageChange={setCurrentPage}
              />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}

function AdminLogin({ onLogin }) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setIsSubmitting(true)
    setError('')

    try {
      await onLogin(password)
    } catch (error) {
      setError(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex-grow-1 d-flex align-items-center">
      <section className="container py-5">
        <div className="row justify-content-center">
          <div className="col-12 col-md-7 col-lg-5">
            <div className="border border-success rounded p-4 bg-white">
              <h1 className="h3 mb-4 text-center">Admin</h1>
              {error && <div className="alert alert-dark border-dark">{error}</div>}
              <form onSubmit={handleSubmit}>
                <div className="mb-3">
	                  <label htmlFor="admin-password" className="form-label">
	                    Password
	                  </label>
	                  <div className="input-group">
	                    <input
	                      id="admin-password"
	                      type={showPassword ? 'text' : 'password'}
	                      className="form-control border-success"
	                      value={password}
	                      onChange={(event) => setPassword(event.target.value)}
	                      autoComplete="current-password"
	                      required
	                    />
	                    <button
	                      type="button"
	                      className="btn btn-success"
	                      aria-label={showPassword ? 'Hide password' : 'Show password'}
	                      onClick={() => setShowPassword((isVisible) => !isVisible)}
	                    >
	                      <i
	                        className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`}
	                        aria-hidden="true"
	                      ></i>
	                    </button>
	                  </div>
	                </div>
                <button type="submit" className="btn btn-success w-100" disabled={isSubmitting}>
                  {isSubmitting ? 'Entering...' : 'Enter'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

function emptyQuestionDraft(nextId) {
  return {
    id: nextId,
    question: '',
    answer: '',
    videoUrl: '',
    isEnabled: true,
  }
}

function AdminPage({ questions, nextId, setCatalog }) {
  const [adminToken, setAdminToken] = useState(
    () => window.sessionStorage.getItem(ADMIN_TOKEN_KEY) || '',
  )
  const [draft, setDraft] = useState(() => emptyQuestionDraft(nextId))
  const [editingId, setEditingId] = useState(null)
  const [adminSearchTerm, setAdminSearchTerm] = useState('')
  const [adminPage, setAdminPage] = useState(1)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (editingId === null) {
      setDraft((currentDraft) => ({ ...currentDraft, id: nextId }))
    }
  }, [editingId, nextId])

  const filteredAdminQuestions = useMemo(() => {
    const normalizedSearch = adminSearchTerm.trim().toLowerCase()

    if (!normalizedSearch) {
      return questions
    }

    return questions.filter((item) => {
      const searchableText =
        `${item.id} ${item.question} ${item.answer} ${item.videoUrl} ${
          item.isEnabled ? 'enabled' : 'disabled'
        }`.toLowerCase()

      return searchableText.includes(normalizedSearch)
    })
  }, [adminSearchTerm, questions])
  const adminPageCount = Math.max(1, Math.ceil(filteredAdminQuestions.length / PAGE_SIZE))
  const safeAdminPage = Math.min(adminPage, adminPageCount)
  const adminStartIndex = (safeAdminPage - 1) * PAGE_SIZE
  const visibleAdminQuestions = filteredAdminQuestions.slice(
    adminStartIndex,
    adminStartIndex + PAGE_SIZE,
  )

  useEffect(() => {
    setAdminPage(1)
  }, [adminSearchTerm])

  useEffect(() => {
    setAdminPage((page) => Math.min(page, adminPageCount))
  }, [adminPageCount])

  async function login(password) {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    })
    const data = await parseApiResponse(response)

    window.sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token)
    setAdminToken(data.token)
  }

  const adminRequest = useCallback(async (path, options = {}) => {
    const response = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        ...(options.headers || {}),
      },
    })

    if (response.status === 401) {
      window.sessionStorage.removeItem(ADMIN_TOKEN_KEY)
      setAdminToken('')
    }

    return parseApiResponse(response)
  }, [adminToken])

  useEffect(() => {
    if (!adminToken) {
      return
    }

    let isCurrentRequest = true

    async function loadAdminCatalog() {
      setError('')

      try {
        const data = await adminRequest('/api/questions?includeDisabled=true')

        if (isCurrentRequest) {
          setCatalog(data)
        }
      } catch (error) {
        if (isCurrentRequest) {
          setError(error.message)
        }
      }
    }

    loadAdminCatalog()

    return () => {
      isCurrentRequest = false
    }
  }, [adminRequest, adminToken, setCatalog])

  function handleDraftChange(field, value) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }))
  }

  async function handleCreateOrUpdate(event) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    setMessage('')

    const payload = {
      question: draft.question,
      answer: draft.answer,
      videoUrl: draft.videoUrl,
      isEnabled: draft.isEnabled !== false,
    }

    try {
      if (editingId === null) {
        const data = await adminRequest('/api/questions', {
          method: 'POST',
          body: JSON.stringify(payload),
        })

        setCatalog(data)
        setDraft(emptyQuestionDraft(data.nextId))
        setMessage(`Question ${data.created.id} was created.`)
        return
      }

      const data = await adminRequest(`/api/questions/${editingId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })

      setCatalog(data)
      setEditingId(null)
      setDraft(emptyQuestionDraft(data.nextId))
      setMessage(`Question ${data.updated.id} was updated.`)
    } catch (error) {
      setError(error.message)
    } finally {
      setIsSaving(false)
    }
  }

  function handleEdit(item) {
    setEditingId(item.id)
    setDraft({ ...item })
    setMessage('')
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(id) {
    if (!window.confirm(`Delete question ${id}?`)) {
      return
    }

    setIsSaving(true)
    setError('')
    setMessage('')

    try {
      const data = await adminRequest(`/api/questions/${id}`, {
        method: 'DELETE',
      })

      setCatalog(data)

      if (editingId === id) {
        setEditingId(null)
        setDraft(emptyQuestionDraft(data.nextId))
      }

      setMessage(`Question ${id} was deleted.`)
    } catch (error) {
      setError(error.message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleEnabled(item) {
    const nextEnabledValue = !item.isEnabled

    setIsSaving(true)
    setError('')
    setMessage('')

    try {
      const data = await adminRequest(`/api/questions/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isEnabled: nextEnabledValue }),
      })

      setCatalog(data)

      if (editingId === item.id) {
        setDraft((currentDraft) => ({
          ...currentDraft,
          isEnabled: data.updated.isEnabled,
        }))
      }

      setMessage(
        `Question ${item.id} was ${nextEnabledValue ? 'enabled' : 'disabled'}.`,
      )
    } catch (error) {
      setError(error.message)
    } finally {
      setIsSaving(false)
    }
  }

  function handleCancel() {
    setEditingId(null)
    setDraft(emptyQuestionDraft(nextId))
    setMessage('')
    setError('')
  }

  async function handleLogout() {
    if (adminToken) {
      await adminRequest('/api/admin/logout', { method: 'POST' }).catch(() => {})
    }

    window.sessionStorage.removeItem(ADMIN_TOKEN_KEY)
    setAdminToken('')
  }

  if (!adminToken) {
    return (
      <>
        <SiteNavbar />
        <AdminLogin onLogin={login} />
        <SiteFooter />
      </>
    )
  }

  return (
    <>
      <SiteNavbar />
      <main className="flex-grow-1">
        <section className="container py-4 py-md-5">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
            <div>
              <h1 className="h2 mb-1">Admin</h1>
              <p className="mb-0">Question numbers are fixed IDs and cannot be edited.</p>
            </div>
            <button type="button" className="btn btn-success" onClick={handleLogout}>
              Logout
            </button>
          </div>

          <AutoDismissAlert
            text={message}
            variant="success"
            onDismiss={() => setMessage('')}
          />
          <AutoDismissAlert text={error} variant="dark" onDismiss={() => setError('')} />

          <div className="border border-success rounded p-3 p-md-4 mb-4 bg-white">
            <h2 className="h4 mb-3">{editingId === null ? 'Create Question' : 'Edit Question'}</h2>
            <form onSubmit={handleCreateOrUpdate}>
              <div className="row g-3">
                <div className="col-12 col-md-3">
                  <label htmlFor="question-id" className="form-label">
                    Question Number
                  </label>
                  <input
                    id="question-id"
                    className="form-control border-success"
                    value={draft.id}
                    readOnly
                  />
                </div>
                <div className="col-12 col-md-9">
                  <label htmlFor="question-text" className="form-label">
                    Question
                  </label>
                  <input
                    id="question-text"
                    className="form-control border-success"
                    value={draft.question}
                    onChange={(event) => handleDraftChange('question', event.target.value)}
                    required
                  />
                </div>
                <div className="col-12">
                  <label htmlFor="question-answer" className="form-label">
                    Answer
                  </label>
                  <textarea
                    id="question-answer"
                    className="form-control border-success"
                    rows="4"
                    value={draft.answer}
                    onChange={(event) => handleDraftChange('answer', event.target.value)}
                    required
                  ></textarea>
                </div>
                <div className="col-12">
                  <label htmlFor="question-video" className="form-label">
                    YouTube Short (Optional)
                  </label>
                  <input
                    id="question-video"
                    type="url"
                    className="form-control border-success"
                    value={draft.videoUrl}
                    onChange={(event) => handleDraftChange('videoUrl', event.target.value)}
                  />
                </div>
              </div>
              <div className="d-flex flex-column flex-sm-row gap-2 mt-3">
                <button type="submit" className="btn btn-success" disabled={isSaving}>
                  {editingId === null ? 'Create' : 'Save'}
                </button>
                {editingId !== null && (
                  <button type="button" className="btn btn-outline-dark" onClick={handleCancel}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="mb-3">
            <label htmlFor="admin-question-search" className="visually-hidden">
              Search questions
            </label>
            <input
              id="admin-question-search"
              type="search"
              className="form-control border-success"
              placeholder="Search questions..."
              value={adminSearchTerm}
              onChange={(event) => setAdminSearchTerm(event.target.value)}
            />
          </div>

          <div className="table-responsive">
            <table className="table table-bordered border-success align-middle">
              <thead>
                <tr>
                  <th scope="col" className="text-center align-middle">
                    #
                  </th>
                  <th scope="col" className="text-center align-middle">
                    Question
                  </th>
                  <th scope="col" className="text-center align-middle">
                    Answer
                  </th>
                  <th scope="col" className="text-center align-middle">
                    YouTube Short
                  </th>
                  <th scope="col" className="text-center align-middle">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleAdminQuestions.map((item) => (
                  <tr key={item.id}>
                    <th scope="row" className="text-center align-middle">
                      {item.id}
                    </th>
                    <td className="text-center align-middle">{item.question}</td>
                    <td className="text-center align-middle">{item.answer}</td>
                    <td className="text-center align-middle">
                      {item.videoUrl ? (
                        <a
                          href={item.videoUrl}
                          className="link-success"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                        </a>
                      ) : (
                        <span className="text-secondary">None</span>
                      )}
                    </td>
                    <td className="text-center align-middle">
                      <div className="d-flex justify-content-center gap-2">
                        <button
                          type="button"
                          className={`btn btn-sm d-inline-flex align-items-center justify-content-center ${
                            item.isEnabled ? 'btn-outline-dark' : 'btn-success'
                          }`}
                          onClick={() => handleToggleEnabled(item)}
                          disabled={isSaving}
                          aria-label={`${item.isEnabled ? 'Disable' : 'Enable'} question ${
                            item.id
                          }`}
                          title={`${item.isEnabled ? 'Disable' : 'Enable'} question ${item.id}`}
                        >
                          <i
                            className={`bi ${
                              item.isEnabled ? 'bi-x-lg' : 'bi-check-lg'
                            } fs-5 lh-1`}
                            aria-hidden="true"
                          ></i>
                        </button>
                        <button
                          type="button"
                          className="btn btn-success btn-sm d-inline-flex align-items-center justify-content-center"
                          onClick={() => handleEdit(item)}
                          disabled={isSaving}
                          aria-label={`Edit question ${item.id}`}
                          title={`Edit question ${item.id}`}
                        >
                          <i className="bi bi-pencil-square fs-5 lh-1" aria-hidden="true"></i>
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-dark btn-sm d-inline-flex align-items-center justify-content-center"
                          onClick={() => handleDelete(item.id)}
                          disabled={isSaving}
                          aria-label={`Delete question ${item.id}`}
                          title={`Delete question ${item.id}`}
                        >
                          <i className="bi bi-trash fs-5 lh-1" aria-hidden="true"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredAdminQuestions.length === 0 && (
                  <tr>
                    <td colSpan="5" className="text-center align-middle">
                      No questions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={safeAdminPage}
            pageCount={adminPageCount}
            onPageChange={setAdminPage}
          />
        </section>
      </main>
      <SiteFooter />
    </>
  )
}

function PageStatus({ title, actionLabel, onAction }) {
  return (
    <>
      <SiteNavbar />
      <main className="flex-grow-1">
        <section className="container py-5">
          <div className="row justify-content-center">
            <div className="col-12 col-md-8 col-lg-6">
              <div className="border border-success rounded p-4 text-center">
                <p className="h4 mb-0">{title}</p>
                {onAction && (
                  <button type="button" className="btn btn-success mt-3" onClick={onAction}>
                    {actionLabel}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}

function SiteFooter() {
  return (
    <footer className="bg-success py-4 mt-auto">
      <div className="container">
        <div className="d-flex d-md-none justify-content-center mb-3">
          <KofiButton />
        </div>
        <ul className="nav justify-content-center gap-3">
          {socialLinks.map((item) => (
            <li className="nav-item" key={item.name}>
              <a
                className="nav-link p-1 d-inline-flex align-items-center justify-content-center"
                href={item.href}
                target="_blank"
                rel="noreferrer"
                aria-label={item.name}
              >
                <svg
                  width="30"
                  height="30"
                  viewBox="0 0 24 24"
                  role="img"
                  aria-hidden="true"
                >
                  <path fill="#fff" d={item.icon.path}></path>
                </svg>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  )
}

function App() {
  const [catalog, setCatalogState] = useState({ questions: [], nextId: 1 })
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const isAdminPage = window.location.pathname === '/admin'

  const setCatalog = useCallback((data) => {
    setCatalogState(normalizeCatalog(data))
  }, [])

  const loadQuestions = useCallback(async () => {
    setIsLoading(true)
    setLoadError('')

    try {
      const response = await fetch('/api/questions')
      const data = await parseApiResponse(response)

      setCatalog(data)
    } catch (error) {
      setLoadError(error.message)
    } finally {
      setIsLoading(false)
    }
  }, [setCatalog])

  useEffect(() => {
    loadQuestions()
  }, [loadQuestions])

  useEffect(() => {
    const allowedPaths = new Set(['/', '/admin'])

    if (!allowedPaths.has(window.location.pathname)) {
      window.history.replaceState(null, '', '/')
    }
  }, [])

  if (isLoading) {
    return (
      <div className="min-vh-100 d-flex flex-column bg-white text-black">
        <PageStatus title="Loading questions..." />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-vh-100 d-flex flex-column bg-white text-black">
        <PageStatus title={loadError} actionLabel="Try again" onAction={loadQuestions} />
      </div>
    )
  }

  return (
    <div className="min-vh-100 d-flex flex-column bg-white text-black">
      {isAdminPage ? (
        <AdminPage
          questions={catalog.questions}
          nextId={catalog.nextId}
          setCatalog={setCatalog}
        />
      ) : (
        <>
          <HomePage questions={catalog.questions} />
          <ChatbotWidget />
        </>
      )}
    </div>
  )
}

export default App
