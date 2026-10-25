'use strict'
const path = require('node:path')
const { enhanceReadingLayout } = require(path.join(hexo.base_dir, 'lib/reading-layout.cjs'))
hexo.extend.filter.register('after_render:html', enhanceReadingLayout, 20)
