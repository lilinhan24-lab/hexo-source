'use strict'

const fs = require('node:fs')
const path = require('node:path')
const katex = require('katex')
const dist = path.join(path.dirname(require.resolve('katex/package.json')), 'dist')
const assetRoot = `vendor/katex/${katex.version}`

// Render during the build: no client-side script or external font CDN needed.
hexo.extend.tag.register('math', (_args, content) => {
  const formula = katex.renderToString(content.trim(), {
    displayMode: true,
    output: 'htmlAndMathml',
    throwOnError: true,
    trust: false,
    strict: errorCode => errorCode === 'unicodeTextInMathMode' ? 'ignore' : 'error'
  })
  return `<div class="han-equation" tabindex="0" role="group" aria-label="数学公式">${formula}</div>`
}, { ends: true })

hexo.extend.generator.register('local-math-assets', () => {
  const files = ['katex.min.css', ...fs.readdirSync(path.join(dist, 'fonts')).map(name => `fonts/${name}`)]
  return [{ path: `${assetRoot}/LICENSE`, data: fs.readFileSync(path.join(dist, '..', 'LICENSE')) }, ...files.map(name => ({
    path: `${assetRoot}/${name}`,
    data: fs.readFileSync(path.join(dist, name))
  }))]
})

hexo.extend.filter.register('after_render:html', html => {
  if (!html.includes('</head>') || !html.includes('class="han-equation"')) return html
  return html.replace('</head>', `<link rel="stylesheet" href="/${assetRoot}/katex.min.css"></head>`)
})
