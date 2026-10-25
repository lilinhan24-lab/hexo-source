'use strict'
const fs = require('node:fs/promises')
const path = require('node:path')
const { Readable } = require('node:stream')
const { photoVariants, enhanceArticle, setShareImage } = require(path.join(hexo.base_dir, 'lib/site-media.cjs'))
let variants = new Map()

hexo.extend.generator.register('responsive-photos', async () => {
  variants = new Map()
  const routes = []
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) { await walk(file); continue }
      if (!entry.isFile() || !/\.jpe?g$/i.test(entry.name)) continue
      const url = '/' + path.relative(hexo.source_dir, file).split(path.sep).join('/')
      const choices = await photoVariants(await fs.readFile(file), url)
      variants.set(url, choices)
      routes.push(...choices.map(v => ({ path: v.url.slice(1), data: () => Readable.from(v.data) })))
    }
  }
  const directory = path.join(hexo.source_dir, 'images/posts')
  try { await walk(directory) } catch (error) { if (error.code !== 'ENOENT') throw error }
  return routes
})

hexo.extend.filter.register('after_render:html', html => {
  if (html.includes('id="post"')) html = enhanceArticle(html, variants)
  if (/<link[^>]+rel="canonical"[^>]+href="https:\/\/www\.han\.tax\/posts\/lm2596-ams1117-design\/"/.test(html)) {
    html = setShareImage(html, 'https://www.han.tax/images/posts/lm2596-ams1117-design/assembled-board.jpg')
  }
  return html
}, 30)
