'use strict'

function isSubscriptionReady(config) {
  if (config.enabled !== true) return false
  if (!Number.isInteger(config.listId) || config.listId < 1) throw new Error('订阅名单未配置')
  const url = new URL(config.formUrl)
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.sibforms\.com$/.test(url.hostname) || !url.pathname.startsWith('/serve/') || url.username || url.password || url.port || url.search || url.hash) throw new Error('订阅表单必须使用 Brevo 提供的 HTTPS 表单地址')
  return true
}

function subscriptionRoutes(config) {
  if (!isSubscriptionReady(config)) return []
  const formUrl = config.formUrl.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  const embedUrl = formUrl.replace('/serve/', '/v2/serve/')
  return [{
    path: 'subscribe/index.html', layout: 'page',
    data: {
      layout: 'page',
      title: '订阅更新', description: '通过邮件接收新文章和文章更新，可随时取消订阅。',
      comments: false, aside: false, top_img: false,
      content: `<section class="han-subscription"><iframe class="han-subscription-form" src="${embedUrl}" title="邮箱订阅表单" referrerpolicy="strict-origin-when-cross-origin"></iframe><p class="han-subscription-note">填写后，请打开确认邮件完成订阅。每封通知都带有取消订阅链接。</p><p class="han-subscription-note">表单未显示？<a href="${formUrl}" target="_blank" rel="noopener noreferrer">直接打开订阅表单</a></p><p class="han-subscription-note">邮箱由 Brevo 用于订阅确认和文章通知，不会公开展示。<a href="https://www.brevo.com/legal/privacypolicy/" target="_blank" rel="noopener noreferrer">隐私说明</a></p></section>`
    }
  }]
}

function addSubscriptionLinks(html, config) {
  if (!isSubscriptionReady(config) || html.includes('data-han-subscribe')) return html
  const css = '<link rel="stylesheet" href="/css/email-subscription.css">'
  const article = '<aside class="han-subscribe-link" data-han-subscribe><span>想收到后续文章与更新？</span> <a href="/subscribe/">订阅更新</a></aside>'
  const footer = '<div class="han-subscribe-footer" data-han-subscribe><a href="/subscribe/">邮件订阅</a></div>'
  return html.replace('</head>', css + '</head>').replace('<div class="post-copyright">', article + '<div class="post-copyright">').replace('</footer>', footer + '</footer>')
}

module.exports = { isSubscriptionReady, subscriptionRoutes, addSubscriptionLinks }
