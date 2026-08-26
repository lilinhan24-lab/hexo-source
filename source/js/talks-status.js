(() => {
  const container = document.getElementById('qexot')
  if (!container) return

  const renderStatus = (message, retry = false) => {
    const status = document.createElement('p')
    status.className = 'han-talks-status'
    status.textContent = message

    if (retry) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = '重新加载'
      button.addEventListener('click', () => window.location.reload())
      status.append(' ', button)
    }

    container.replaceChildren(status)
  }

  if (typeof window.showQexoTalks !== 'function') {
    renderStatus('说说组件加载失败，请稍后重试。', true)
    return
  }

  const observer = new MutationObserver(() => {
    const list = container.querySelector('.qexot-list')
    if (list && !list.querySelector('.qexot-item')) {
      observer.disconnect()
      renderStatus('这里暂时还没有说说，过一阵再来看看吧。')
    }
  })
  observer.observe(container, { childList: true, subtree: true })

  window.showQexoTalks('qexot', 'https://api.han.tax', 5)

  window.setTimeout(() => {
    if (container.querySelector('.qexo_loading')) {
      observer.disconnect()
      renderStatus('说说加载超时，请检查网络后重试。', true)
    }
  }, 12_000)
})()
