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
    const searchDialog = document.querySelector('#local-search .search-dialog')
    const searchInput = searchDialog?.querySelector('input')
    const searchClose = searchDialog?.querySelector('.search-close-button')
    searchInput?.setAttribute('aria-label', '搜索文章')
    searchClose?.setAttribute('aria-label', '关闭搜索')
    if (searchDialog && !searchDialog.dataset.focusReady) {
      searchDialog.dataset.focusReady = 'true'
      // Theme owns the animation. Restore focus only after the dialog is hidden.
      let wasOpen = getComputedStyle(searchDialog).display !== 'none'
      new MutationObserver(() => {
        const isOpen = getComputedStyle(searchDialog).display !== 'none'
        if (wasOpen && !isOpen && searchDialog.contains(document.activeElement)) {
          document.querySelector('#search-button > .search')?.focus({ preventScroll: true })
        }
        wasOpen = isOpen
      }).observe(searchDialog, { attributes: true, attributeFilter: ['style'] })
    }
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

  window.addEventListener('search:loaded', () => {
    // The theme reveals the input in its event listener. Wait until all listeners
    // have run; a slow download can outlast its initial 300ms focus timer.
    queueMicrotask(() => {
      const dialog = document.querySelector('#local-search .search-dialog')
      const trigger = document.querySelector('#search-button > .search')
      if (dialog && getComputedStyle(dialog).display !== 'none' &&
          [document.body, trigger].includes(document.activeElement)) {
        dialog.querySelector('input')?.focus({ preventScroll: true })
      }
    })
  })

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhancePage, { once: true })
  } else {
    enhancePage()
  }

  window.addEventListener('pjax:complete', enhancePage)
})()
