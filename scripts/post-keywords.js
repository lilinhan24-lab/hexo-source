'use strict'

const { escapeHTML } = require('hexo-util')

// Butterfly renders descriptions, but does not emit front-matter keywords.
hexo.extend.filter.register('after_render:html', function addPostKeywords(html) {
  if (!html.includes('</head>') || /<meta\b[^>]*\bname=["']keywords["']/i.test(html)) return html
  const canonical = html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["']/i)?.[1]
  if (!canonical) return html
  const post = this.locals.get('posts').toArray().find(item => item.permalink === canonical)
  if (!post?.keywords) return html
  const keywords = Array.isArray(post.keywords) ? post.keywords.join(', ') : String(post.keywords)
  return html.replace('</head>', `<meta name="keywords" content="${escapeHTML(keywords)}"></head>`)
})
