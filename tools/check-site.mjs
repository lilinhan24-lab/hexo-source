import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicRoot = path.join(projectRoot, 'public')
const sourceRoot = path.join(projectRoot, 'source')
const problems = []

const requiredOutputs = [
  'index.html',
  '404.html',
  'about/index.html',
  'talks/index.html',
  'atom.xml',
  'search.xml',
  'sitemap.xml',
  'robots.txt',
  'CNAME',
  'vercel.json',
  'css/custom.css',
  'js/site-enhancements.js',
  'js/talks-status.js',
  'img/avatar-256.jpg',
  'img/banner-glacier.jpg'
]

const forbiddenOutputs = [
  'posts/lm2596-ams1117/index.html',
  'posts/pt100-transmitter/index.html',
  'images/posts/lm2596-ams1117/schematic.png',
  'images/posts/lm2596-ams1117/pcb-layout.png',
  'images/posts/lm2596-ams1117/pcb-3d-preview.png',
  'images/posts/pt100-transmitter/schematic.png',
  'images/posts/pt100-transmitter/pcb-layout.png',
  'images/posts/pt100-transmitter/pcb-3d-preview.png',
  'img/banner-desktop.jpg',
  'img/banner-mobile.jpg',
  'archives/index.html',
  'tags/index.html',
  'categories/index.html'
]

const forbiddenGeneratedMarkers = [
  'Shout',
  '函的极客笔记',
  'github.com/lilinhan24-lab',
  '/posts/lm2596-ams1117/',
  '/posts/pt100-transmitter/',
  'banner-desktop.jpg',
  'banner-mobile.jpg',
  '#476b40',
  'embedded-hardware-project-template'
]

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function walk(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(fullPath))
    else files.push(fullPath)
  }
  return files
}

for (const output of requiredOutputs) {
  if (!await exists(path.join(publicRoot, output))) {
    problems.push(`缺少构建产物: public/${output}`)
  }
}

for (const output of forbiddenOutputs) {
  if (await exists(path.join(publicRoot, output))) {
    problems.push(`零文章站点不应生成: public/${output}`)
  }
}

const draftTemplate = path.join(sourceRoot, '_drafts', 'embedded-hardware-project-template.md')
if (!await exists(draftTemplate)) problems.push('草稿模板已丢失: source/_drafts/embedded-hardware-project-template.md')

const postFiles = (await walk(path.join(sourceRoot, '_posts'))).filter(file => /\.md$/i.test(file))
if (postFiles.length > 0) {
  problems.push(`零文章阶段仍存在正式文章: ${postFiles.map(file => path.relative(projectRoot, file)).join(', ')}`)
}

const sourceFiles = await walk(sourceRoot)
for (const file of sourceFiles) {
  if (/\.md\.md$/i.test(file)) {
    problems.push(`文章文件存在双重扩展名: ${path.relative(projectRoot, file)}`)
  }

  if (/\.(?:md|ya?ml|html)$/i.test(file)) {
    const content = await readFile(file, 'utf8')
    if (content.includes('http://example.com')) {
      problems.push(`仍包含示例域名: ${path.relative(projectRoot, file)}`)
    }
    if (content.includes('cdn.jsdelivr.net/gh/lilinhan24-lab/hexo-source')) {
      problems.push(`文章图片仍依赖源码仓库 CDN: ${path.relative(projectRoot, file)}`)
    }
    if (content.includes('qexo-static')) {
      problems.push(`说说页面仍依赖外部转圈组件: ${path.relative(projectRoot, file)}`)
    }
  }
}

const publicFiles = await walk(publicRoot)
const htmlFiles = publicFiles.filter(file => file.endsWith('.html'))
const generatedTextFiles = publicFiles.filter(file => /\.(?:html|xml|css|js|json|txt)$/i.test(file))
const attributePattern = /\b(?:href|src)=(?:"([^"]+)"|'([^']+)')/gi

for (const file of generatedTextFiles) {
  const content = await readFile(file, 'utf8')
  const relativeFile = path.relative(publicRoot, file)
  for (const marker of forbiddenGeneratedMarkers) {
    if (content.includes(marker)) {
      problems.push(`生成内容仍包含禁用标记 ${JSON.stringify(marker)}: public/${relativeFile}`)
    }
  }
}

const homeHtml = await readFile(path.join(publicRoot, 'index.html'), 'utf8')
const requiredHomeMarkers = [
  ['网站名称', '小小林的个人博客'],
  ['作者名称', '硬件小小林'],
  ['英文礼貌语', 'Welcome to my blog'],
  ['日文礼貌语', '毎日が楽しい日でありますように !'],
  ['冰川背景', '/img/banner-glacier.jpg'],
  ['站内搜索入口', 'id="search-button"'],
  ['本地搜索配置', 'localSearch'],
  ['RSS 订阅入口', '/atom.xml'],
  ['键盘与无障碍增强脚本', '/js/site-enhancements.js'],
  ['新版自定义样式', '/css/custom.css?v=20260909-1']
]

for (const [label, marker] of requiredHomeMarkers) {
  if (!homeHtml.includes(marker)) {
    problems.push(`首页缺少${label}: ${marker}`)
  }
}

const glacierPreloads = homeHtml.match(/<link\b[^>]*\brel=["']preload["'][^>]*banner-glacier\.jpg[^>]*>/gi) || []
if (glacierPreloads.length !== 1) {
  problems.push(`首页冰川背景预加载数量应为 1，实际为 ${glacierPreloads.length}`)
}

for (const route of ['/archives/', '/tags/', '/categories/']) {
  if (homeHtml.includes(`href="${route}"`) || homeHtml.includes(`href='${route}'`)) {
    problems.push(`首页仍包含零文章阶段禁用入口: ${route}`)
  }
}

if (homeHtml.includes('class="recent-post-item"')) {
  problems.push('零文章首页仍包含文章卡片')
}

const searchXml = await readFile(path.join(publicRoot, 'search.xml'), 'utf8')
if (searchXml.includes('<entry>')) problems.push('零文章阶段 search.xml 仍包含文章条目')

const atomXml = await readFile(path.join(publicRoot, 'atom.xml'), 'utf8')
if (!atomXml.includes('<feed ') || atomXml.includes('<entry>')) {
  problems.push('零文章阶段 atom.xml 应为有效的空 Atom 订阅源')
}

for (const htmlFile of htmlFiles) {
  const html = await readFile(htmlFile, 'utf8')
  const relativeHtml = path.relative(publicRoot, htmlFile)

  if (html.includes('http://example.com')) {
    problems.push(`生成页面仍包含示例域名: public/${relativeHtml}`)
  }

  if (html.includes('[object Object]')) {
    problems.push(`生成页面包含无效的配置注入结果: public/${relativeHtml}`)
  }

  for (const match of html.matchAll(attributePattern)) {
    const rawUrl = match[1] ?? match[2]
    if (!rawUrl || /^(?:[a-z]+:|\/\/|#)/i.test(rawUrl)) continue

    let cleanUrl = rawUrl.split(/[?#]/, 1)[0]
    if (!cleanUrl) continue

    try {
      cleanUrl = decodeURIComponent(cleanUrl)
    } catch {
      problems.push(`URL 编码无效: public/${relativeHtml} -> ${rawUrl}`)
      continue
    }

    const htmlUrlDirectory = path.dirname(`/${relativeHtml.replaceAll('\\', '/')}`)
    const sitePath = cleanUrl.startsWith('/')
      ? cleanUrl
      : path.posix.resolve(htmlUrlDirectory, cleanUrl)
    const relativeTarget = sitePath.replace(/^\/+/, '')
    const directTarget = path.join(publicRoot, relativeTarget)
    const indexTarget = path.join(directTarget, 'index.html')

    if (!await exists(directTarget) && !await exists(indexTarget)) {
      problems.push(`内部资源不存在: public/${relativeHtml} -> ${rawUrl}`)
    }
  }
}

if (problems.length > 0) {
  console.error(`站点检查失败，共 ${problems.length} 个问题：`)
  for (const problem of problems) console.error(`- ${problem}`)
  process.exit(1)
}

console.log(`站点检查通过：${htmlFiles.length} 个 HTML 页面，${requiredOutputs.length} 个必需产物；零文章、旧内容清理和冰川品牌规则均已验证。`)
