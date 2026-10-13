const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const file = path.resolve('lib/site-media.cjs')
const media = fs.existsSync(file) ? require(file) : {}

test('照片按实际宽度生成 WebP，不放大原图或修改原始字节', async () => {
  assert.equal(typeof media.photoVariants, 'function')
  const sharp = require('sharp')
  const original = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#0878b5' } }).jpeg().toBuffer()
  const copy = Buffer.from(original)
  const variants = await media.photoVariants(original, '/images/posts/test/photo.jpg')
  assert.deepEqual(variants.map(x => x.width), [480, 800])
  assert.deepEqual(original, copy)
  for (const v of variants) {
    assert.match(v.url, /^\/images\/posts\/test\/photo-[a-f0-9]{12}-\d+\.webp$/)
    assert.equal((await sharp(v.data).metadata()).format, 'webp')
  }
})

test('正文照片添加响应式源且原图可打开，已有链接不嵌套', () => {
  assert.equal(typeof media.enhanceArticle, 'function')
  const variants = new Map([['/images/posts/a.jpg', [{ url: '/images/posts/a-480.webp', width: 480 }]]])
  const input = '<img src="/images/posts/a.jpg" alt="实物" width="800" height="600"><a href="/original/"><img src="/images/posts/a.jpg"></a><img src="https://example.com/remote.jpg">'
  const output = media.enhanceArticle(input, variants)
  assert.equal((output.match(/srcset=/g) || []).length, 2)
  assert.equal((output.match(/<a /g) || []).length, 2)
  assert.match(output, /href="\/images\/posts\/a.jpg"/)
  assert.match(output, /width="800" height="600"/)
  assert.match(output, /loading="lazy"/)
  assert.equal(media.enhanceArticle(output, variants), output)
  assert.match(output, /<img src="https:\/\/example.com\/remote.jpg">/)
})

test('分享图只替换目标文章元数据，不改正文和首页封面', () => {
  assert.equal(typeof media.setShareImage, 'function')
  const input = '<meta property="og:image" content="/avatar.jpg"><meta name="twitter:image" content="/avatar.jpg"><script type="application/ld+json">{"@type":"BlogPosting","image":"/avatar.jpg"}</script><img src="/avatar.jpg">'
  const output = media.setShareImage(input, 'https://www.han.tax/images/photo.jpg')
  assert.equal((output.match(/https:\/\/www.han.tax\/images\/photo.jpg/g) || []).length, 3)
  assert.match(output, /<img src="\/avatar.jpg">/)
})
