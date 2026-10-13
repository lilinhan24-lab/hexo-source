'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { validateRelease } = require('../lib/release-guard.cjs')
const root = path.resolve('public')
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8') }
const pages = fs.readdirSync(root, { recursive: true }).filter(name => /\.(?:html|js|json|xml|css)$/i.test(name)).map(read)
const problems = validateRelease({ home: read('index.html'), about: read('about/index.html'), subscribe: read('subscribe/index.html'), pages })
if (problems.length) {
  console.error(problems.join('\n'))
  process.exitCode = 1
} else console.log(`发布保护检查通过：${pages.length} 个文本产物；定位、订阅、预览标记及发信密钥检查通过。`)
