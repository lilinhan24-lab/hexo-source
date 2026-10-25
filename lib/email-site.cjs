'use strict'

function isSubscriptionReady(config) {
  if (config.enabled !== true) return false
  if (!Number.isInteger(config.listId) || config.listId < 1) throw new Error('订阅名单未配置')
  const url = new URL(config.formUrl)
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.sibforms\.com$/.test(url.hostname) || !url.pathname.startsWith('/serve/') || url.username || url.password || url.port || url.search || url.hash) throw new Error('订阅表单必须使用 Brevo 提供的 HTTPS 表单地址')
  return true
}

function subscriptionRoutes(config) {
  if (config.paused === true) return [{
    path: 'subscribe/index.html', layout: 'page',
    data: {
      layout: 'page', title: '邮件订阅暂时暂停', description: '邮件通知暂时暂停，文章仍会正常更新。',
      comments: false, aside: false, top_img: false,
      content: '<section class="han-subscription" data-han-subscription-paused><p>邮件通知暂时暂停，文章仍会正常更新。</p><p>已有订阅会保留，无需重新订阅。你仍可通过以前收到的邮件取消订阅。</p><p><a href="/archives/">查看全部文章</a></p></section>'
    }
  }]
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
  if (config.paused === true) {
    if (html.includes('data-han-subscribe')) return html
    return html.replace('</head>', '<link rel="stylesheet" href="/css/email-subscription.css"></head>').replace('</footer>', '<div class="han-subscribe-footer" data-han-subscribe><a href="/subscribe/">邮件订阅（暂停）</a></div></footer>')
  }
  if (!isSubscriptionReady(config) || html.includes('data-han-subscribe')) return html
  const css = '<link rel="stylesheet" href="/css/email-subscription.css">'
  const article = '<aside class="han-subscribe-link" data-han-subscribe><span>想收到后续文章与更新？</span> <a href="/subscribe/">订阅更新</a></aside>'
  const footer = '<div class="han-subscribe-footer" data-han-subscribe><a href="/subscribe/">邮件订阅</a></div>'
  return html.replace('</head>', css + '</head>').replace('<div class="post-copyright">', article + '<div class="post-copyright">').replace('</footer>', footer + '</footer>')
}

module.exports = { isSubscriptionReady, subscriptionRoutes, addSubscriptionLinks }
