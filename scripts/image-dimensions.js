'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { imageSize } = require('image-size')

// Read only local article images. Remote URLs are never fetched during a build.
hexo.extend.filter.register('after_post_render', function reserveImageSpace(data) {
  const root = path.resolve(this.source_dir)
  data.content = data.content.replace(/<img\b[^>]*>/gi, tag => {
    if (/\bwidth\s*=/.test(tag) || /\bheight\s*=/.test(tag)) return tag
    const src = tag.match(/\bsrc=["']([^"']+)["']/)?.[1]
    if (!src?.startsWith('/images/')) return tag
    const file = path.resolve(root, '.' + decodeURIComponent(src.split(/[?#]/)[0]))
    if (!file.startsWith(root + path.sep)) return tag
    try {
      const { width, height, orientation } = imageSize(fs.readFileSync(file))
      const rotated = orientation >= 5 && orientation <= 8
      return tag.replace(/\s*\/?>$/, ` width="${rotated ? height : width}" height="${rotated ? width : height}">`)
    } catch (error) {
      throw new Error(`无法读取文章图片尺寸 ${src}: ${error.message}`)
    }
  })
  return data
}, 20)
