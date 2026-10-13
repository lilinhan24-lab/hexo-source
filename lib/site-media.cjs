'use strict'
const { createHash } = require('node:crypto')

async function photoVariants(original, url) {
  const sharp = require('sharp')
  const normalized = await sharp(original).rotate().toBuffer()
  const { width } = await sharp(normalized).metadata()
  const digest = createHash('sha256').update(original).digest('hex').slice(0, 12)
  const widths = [...new Set([480, 960, 1440].map(w => Math.min(w, width)))]
  const result = []
  for (const size of widths) {
    const data = await sharp(normalized).resize({ width: size }).webp({ quality: 84 }).toBuffer()
    result.push({ url: url.replace(/\.jpe?g$/i, `-${digest}-${size}.webp`), width: size, data })
  }
  return result
}

function enhanceArticle(html, variants) {
  function image(tag, linked) {
    const src = tag.match(/\bsrc="([^"]+)"/)?.[1]
    if (!src?.startsWith('/images/posts/') || /["<>]/.test(src)) return tag
    const choices = variants.get(src)
    if (choices && !/\bsrcset=/.test(tag)) {
      tag = tag.replace(/\s*\/?>$/, ` srcset="${choices.map(v => `${v.url} ${v.width}w`).join(', ')}" sizes="(max-width: 768px) calc(100vw - 38px), (max-width: 1200px) calc(100vw - 340px), 825px">`)
    }
    if (!/\bloading=/.test(tag)) tag = tag.replace(/>$/, ' loading="lazy">')
    if (!/\bdecoding=/.test(tag)) tag = tag.replace(/>$/, ' decoding="async">')
    return linked ? tag : `<a class="han-original-image" href="${src}" target="_blank" rel="noopener noreferrer" title="打开原图">${tag}</a>`
  }
  return html.replace(/<a\b[^>]*>[\s\S]*?<\/a>|<img\b[^>]*>/gi, token => token.startsWith('<a')
    ? token.replace(/<img\b[^>]*>/gi, tag => image(tag, true)) : image(token, false))
}

function setShareImage(html, image) {
  html = html.replace(/(<meta\b[^>]*(?:property="og:image"|name="twitter:image")[^>]*content=")[^"]*(")/g, `$1${image}$2`)
  return html.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (all, start, json, end) => {
    const schema = JSON.parse(json)
    if (schema['@type'] !== 'BlogPosting') return all
    schema.image = image
    return start + JSON.stringify(schema).replace(/</g, '\\u003c') + end
  })
}
module.exports = { photoVariants, enhanceArticle, setShareImage }
