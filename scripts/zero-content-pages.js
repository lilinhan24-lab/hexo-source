'use strict'

const pagination = require('hexo-pagination')

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

hexo.extend.generator.register('zero-content-pages', function zeroContentPages(locals) {
  if (locals.posts.length > 0) return []

  const home = pagination('', locals.posts, {
    perPage: false,
    layout: ['index', 'archive'],
    data: { __index: true }
  })

  const siteUrl = this.config.url.replace(/\/$/, '')
  const feedPath = this.config.feed?.path || 'atom.xml'
  const updated = new Date().toISOString()
  const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${escapeXml(this.config.language)}">
  <title>${escapeXml(this.config.title)}</title>
  <id>${escapeXml(`${siteUrl}/`)}</id>
  <updated>${updated}</updated>
  <link href="${escapeXml(`${siteUrl}/`)}" rel="alternate" />
  <link href="${escapeXml(`${siteUrl}/${feedPath}`)}" rel="self" type="application/atom+xml" />
  <subtitle>${escapeXml(this.config.subtitle || this.config.description)}</subtitle>
  <generator uri="https://hexo.io/">Hexo</generator>
  <author><name>${escapeXml(this.config.author)}</name></author>
</feed>
`

  return [
    ...home,
    { path: feedPath, data: feed }
  ]
})

hexo.extend.filter.register('after_render:html', function removeEmptyTaxonomyCounters(html) {
  if (hexo.locals.get('posts').length > 0) return html

  return html.replace(
    /<div class="site-data(?: text-center)?">.*?<\/a><\/div>/gs,
    ''
  )
})
