(() => {
  const interactiveSelector = 'input, textarea, select, button, [contenteditable="true"]'

  const enhancePage = () => {
    const main = document.getElementById('content-inner') || document.querySelector('main')
    if (main) {
      if (!main.id) main.id = 'main-content'
      main.setAttribute('tabindex', '-1')

      if (!document.querySelector('.han-skip-link')) {
        const skipLink = document.createElement('a')
        skipLink.className = 'han-skip-link'
        skipLink.href = `#${main.id}`
        skipLink.textContent = '跳转到主要内容'
        document.body.prepend(skipLink)
      }
    }

    const searchTrigger = document.querySelector('#search-button > .search')
    if (searchTrigger) {
      searchTrigger.setAttribute('role', 'button')
      searchTrigger.setAttribute('tabindex', '0')
      searchTrigger.setAttribute('aria-label', '打开站内搜索（Ctrl+K）')
      if (!searchTrigger.dataset.keyboardReady) {
        searchTrigger.dataset.keyboardReady = 'true'
        searchTrigger.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            searchTrigger.click()
          }
        })
      }
    }

    document.querySelectorAll('a[target="_blank"]').forEach(link => {
      const rel = new Set((link.getAttribute('rel') || '').split(/\s+/).filter(Boolean))
      rel.add('noopener')
      rel.add('noreferrer')
      link.setAttribute('rel', [...rel].join(' '))
    })
  }

  document.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'k') return
    if (event.target.closest(interactiveSelector)) return

    const searchTrigger = document.querySelector('#search-button > .search')
    if (searchTrigger) {
      event.preventDefault()
      searchTrigger.click()
    }
  })

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhancePage, { once: true })
  } else {
    enhancePage()
  }

  window.addEventListener('pjax:complete', enhancePage)
})()
