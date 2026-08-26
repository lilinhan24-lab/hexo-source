(() => {
  const container = document.getElementById('qexot')
  if (!container) return

  const endpoint = container.dataset.endpoint
  const cacheKey = 'han-tax-talks-v1'
  const cacheMaxAge = 10 * 60 * 1000
  const allowedTags = new Set([
    'A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DEL', 'DIV', 'EM', 'H1', 'H2', 'H3',
    'H4', 'H5', 'H6', 'I', 'IMG', 'LI', 'OL', 'P', 'PRE', 'S', 'SPAN', 'STRONG',
    'U', 'UL'
  ])

  const renderEmpty = () => {
    const status = document.createElement('p')
    status.className = 'han-talks-status'
    status.textContent = '这里暂时还没有说说，过一阵再来看看吧。'
    container.replaceChildren(status)
    container.dataset.state = 'empty'
  }

  const safeUrl = value => {
    if (!value) return null
    try {
      const url = new URL(value, window.location.href)
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null
    } catch {
      return null
    }
  }

  const sanitizeContent = rawContent => {
    const wrapper = document.createElement('div')
    wrapper.className = 'han-talk-content'

    if (!rawContent || !rawContent.includes('<')) {
      wrapper.textContent = rawContent || ''
      return wrapper
    }

    const template = document.createElement('template')
    template.innerHTML = rawContent

    for (const element of [...template.content.querySelectorAll('*')]) {
      if (!allowedTags.has(element.tagName)) {
        element.replaceWith(document.createTextNode(element.textContent || ''))
        continue
      }

      const href = element.tagName === 'A' ? safeUrl(element.getAttribute('href')) : null
      const src = element.tagName === 'IMG' ? safeUrl(element.getAttribute('src')) : null
      const alt = element.tagName === 'IMG' ? element.getAttribute('alt') || '' : ''
      const title = element.getAttribute('title') || ''

      for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name)

      if (element.tagName === 'A' && href) {
        element.href = href
        element.target = '_blank'
        element.rel = 'noopener noreferrer'
      }

      if (element.tagName === 'IMG' && src) {
        element.src = src
        element.alt = alt
        element.loading = 'lazy'
        element.decoding = 'async'
      }

      if (title) element.title = title
    }

    wrapper.append(template.content)
    return wrapper
  }

  const formatTime = value => {
    const numericValue = Number(value)
    const timestamp = Number.isFinite(numericValue) && String(Math.trunc(numericValue)).length === 10
      ? numericValue * 1000
      : numericValue
    const date = new Date(Number.isFinite(timestamp) ? timestamp : value)
    if (Number.isNaN(date.getTime())) return ''
    return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  }

  const renderTalks = talks => {
    if (!Array.isArray(talks) || talks.length === 0) {
      renderEmpty()
      return
    }

    const list = document.createElement('section')
    list.className = 'han-talk-list'

    for (const talk of talks) {
      const article = document.createElement('article')
      article.className = 'han-talk-item'

      const meta = document.createElement('div')
      meta.className = 'han-talk-meta'
      const time = document.createElement('time')
      const formattedTime = formatTime(talk.time)
      time.textContent = formattedTime
      if (formattedTime) time.dateTime = formattedTime
      meta.append(time)

      for (const tag of Array.isArray(talk.tags) ? talk.tags : []) {
        const tagItem = document.createElement('span')
        tagItem.className = 'han-talk-tag'
        tagItem.textContent = `#${tag}`
        meta.append(tagItem)
      }

      article.append(meta, sanitizeContent(String(talk.content || '')))

      if (Number.isFinite(Number(talk.like))) {
        const footer = document.createElement('div')
        footer.className = 'han-talk-footer'
        footer.textContent = `喜欢 ${Number(talk.like)}`
        article.append(footer)
      }

      list.append(article)
    }

    container.replaceChildren(list)
    container.dataset.state = 'ready'
  }

  const readCache = () => {
    try {
      const cached = JSON.parse(window.localStorage.getItem(cacheKey))
      if (!cached || !Array.isArray(cached.data) || Date.now() - cached.savedAt > cacheMaxAge) return null
      return cached.data
    } catch {
      return null
    }
  }

  const cachedTalks = readCache()
  if (cachedTalks) renderTalks(cachedTalks)
  else renderEmpty()

  if (!endpoint) return

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8_000)
  container.setAttribute('aria-busy', 'true')

  fetch(endpoint, { signal: controller.signal })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    })
    .then(result => {
      if (!result.status || !Array.isArray(result.data)) throw new Error('Invalid talks response')
      try {
        window.localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data: result.data }))
      } catch {}
      renderTalks(result.data)
    })
    .catch(() => {
      if (!cachedTalks) renderEmpty()
    })
    .finally(() => {
      window.clearTimeout(timeout)
      container.removeAttribute('aria-busy')
    })
})()
