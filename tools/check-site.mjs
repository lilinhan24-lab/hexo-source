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
  'atom.xml',
  'search.xml',
  'sitemap.xml',
  'robots.txt',
  'CNAME',
  'vercel.json',
  'css/custom.css',
  'js/site-enhancements.js',
  'js/talks-status.js',
  'img/favicon.ico',
  'posts/lm2596-ams1117/index.html',
  'posts/pt100-transmitter/index.html'
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

const htmlFiles = (await walk(publicRoot)).filter(file => file.endsWith('.html'))
const attributePattern = /\b(?:href|src)=(?:"([^"]+)"|'([^']+)')/gi

const homeHtml = await readFile(path.join(publicRoot, 'index.html'), 'utf8')
const requiredHomeMarkers = [
  ['站内搜索入口', 'id="search-button"'],
  ['本地搜索配置', 'localSearch'],
  ['RSS 订阅入口', '/atom.xml'],
  ['键盘与无障碍增强脚本', '/js/site-enhancements.js']
]

for (const [label, marker] of requiredHomeMarkers) {
  if (!homeHtml.includes(marker)) {
    problems.push(`首页缺少${label}: ${marker}`)
  }
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

console.log(`站点检查通过：${htmlFiles.length} 个 HTML 页面，${requiredOutputs.length} 个必需产物。`)
