import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import katex from 'katex'

// npm runs at the project root; tools/ may be a Windows junction on another drive.
const projectRoot = path.resolve(process.env.INIT_CWD || process.cwd())
const publicRoot = path.join(projectRoot, 'public')
const sourceRoot = path.join(projectRoot, 'source')
const welcomePostPath = '/posts/welcome-and-roadmap/'
const welcomePostTitle = '开篇寄语｜本站介绍与未来内容规划'
const powerPostPath = '/posts/lm2596-ams1117-design/'
const powerPostTitle = 'LM2596＋AMS1117 两级降压电源设计'
const problems = []

const requiredOutputs = [
  'index.html',
  '404.html',
  'about/index.html',
  'talks/index.html',
  'archives/index.html',
  'categories/index.html',
  'posts/welcome-and-roadmap/index.html',
  'posts/lm2596-ams1117-design/index.html',
  'images/posts/lm2596-ams1117-design/schematic.png',
  'images/posts/lm2596-ams1117-design/pcb-layout.png',
  'images/posts/lm2596-ams1117-design/pcb-3d.png',
  'images/posts/lm2596-ams1117-design/assembled-board.jpg',
  'images/posts/lm2596-ams1117-design/5v-load-800ma.jpg',
  'images/posts/lm2596-ams1117-design/3v3-load-800ma.jpg',
  'atom.xml',
  'search.xml',
  'sitemap.xml',
  'robots.txt',
  'CNAME',
  'vercel.json',
  'css/custom.css',
  `vendor/katex/${katex.version}/katex.min.css`,
  `vendor/katex/${katex.version}/fonts/KaTeX_Main-Regular.woff2`,
  'js/site-enhancements.js',
  'js/talks-status.js',
  'img/avatar-256.jpg',
  'img/banner-glacier.jpg'
]

const forbiddenOutputs = [
  'posts/stm32-mecanum-vision-arm/index.html',
  'images/stm32-mecanum-vision-arm',
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
  'tags/index.html'
]

const forbiddenGeneratedMarkers = [
  '/posts/stm32-mecanum-vision-arm/',
  '/images/stm32-mecanum-vision-arm/',
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

const requiredWelcomeArticleFragments = [
  "大家好，欢迎来到我的个人技术博客。",
  "这个博客将专注于开关电源的设计、调试与测试。",
  "## 本站主要内容方向",
  "### 1. 设计指标与参数计算",
  "### 2. 磁性元件与功率器件",
  "### 3. 反馈控制与动态响应",
  "### 4. 原理图与 PCB 设计",
  "### 5. 调试过程与实测验证",
  "## 写作原则与后续更新",
  "后续文章以完成实测的项目为基础",
  "计算、仿真与实测会分别说明"
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
    problems.push(`首篇文章阶段不应生成: public/${output}`)
  }
}

const draftTemplate = path.join(sourceRoot, '_drafts', 'embedded-hardware-project-template.md')
if (!await exists(draftTemplate)) problems.push('草稿模板已丢失: source/_drafts/embedded-hardware-project-template.md')

const postFiles = (await walk(path.join(sourceRoot, '_posts'))).filter(file => /\.md$/i.test(file))
const expectedPostSource = path.join(sourceRoot, '_posts', 'welcome-and-roadmap.md')
const expectedPostSources = [expectedPostSource, path.join(sourceRoot, '_posts', 'lm2596-ams1117-design.md')]
if (postFiles.length !== expectedPostSources.length || expectedPostSources.some(file => !postFiles.includes(file))) {
  problems.push(`正式文章清单不符，实际为: ${postFiles.map(file => path.relative(projectRoot, file)).join(', ') || '无'}`)
}

const welcomePostSource = await readFile(expectedPostSource, 'utf8')
let fragmentCursor = 0
for (const fragment of requiredWelcomeArticleFragments) {
  const fragmentIndex = welcomePostSource.indexOf(fragment, fragmentCursor)
  if (fragmentIndex === -1) {
    problems.push(`首篇文章定位或章节缺失: ${JSON.stringify(fragment)}`)
  } else {
    fragmentCursor = fragmentIndex + fragment.length
  }
}
if (/^(?:categories|tags):/m.test(welcomePostSource)) {
  problems.push('第一篇文章不应设置分类或标签')
}

const sourceFiles = await walk(sourceRoot)
for (const file of sourceFiles) {
  if (/\.md\.md$/i.test(file)) problems.push(`文章文件存在双重扩展名: ${path.relative(projectRoot, file)}`)

  if (/\.(?:md|ya?ml|html)$/i.test(file)) {
    const content = await readFile(file, 'utf8')
    if (content.includes('http://example.com')) problems.push(`仍包含示例域名: ${path.relative(projectRoot, file)}`)
    if (content.includes('cdn.jsdelivr.net/gh/lilinhan24-lab/hexo-source')) problems.push(`文章图片仍依赖源码仓库 CDN: ${path.relative(projectRoot, file)}`)
    if (content.includes('qexo-static')) problems.push(`说说页面仍依赖外部转圈组件: ${path.relative(projectRoot, file)}`)
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
    if (content.includes(marker)) problems.push(`生成内容仍包含禁用标记 ${JSON.stringify(marker)}: public/${relativeFile}`)
  }
}

const homeHtml = await readFile(path.join(publicRoot, 'index.html'), 'utf8')
const requiredHomeMarkers = [
  ['网站名称', '小小林的个人博客'],
  ['作者名称', '硬件小小林'],
  ['座右铭', '逆水行舟，不进则退'],
  ['英文礼貌语', 'Welcome to my blog'],
  ['日文礼貌语', '毎日が楽しい日でありますように !'],
  ['冰川背景', '/img/banner-glacier.jpg'],
  ['文章导航', 'href="/archives/"'],
  ['首篇文章标题', welcomePostTitle],
  ['首篇文章地址', welcomePostPath],
  ['站内搜索入口', 'id="search-button"'],
  ['本地搜索配置', 'localSearch'],
  ['RSS 订阅入口', '/atom.xml'],
  ['键盘与无障碍增强脚本', '/js/site-enhancements.js'],
  ['电源文章标题', powerPostTitle],
  ['电源文章地址', powerPostPath],
  ['新版自定义样式', '/css/custom.css?v=20261011-1']
]

for (const [label, marker] of requiredHomeMarkers) {
  if (!homeHtml.includes(marker)) problems.push(`首页缺少${label}: ${marker}`)
}

const glacierPreloads = homeHtml.match(/<link\b[^>]*\brel=["']preload["'][^>]*banner-glacier\.jpg[^>]*>/gi) || []
if (glacierPreloads.length !== 1) problems.push(`首页冰川背景预加载数量应为 1，实际为 ${glacierPreloads.length}`)

for (const route of ['/tags/']) {
  if (homeHtml.includes(`href="${route}"`) || homeHtml.includes(`href='${route}'`)) problems.push(`首页仍包含暂未启用入口: ${route}`)
}

const homePostCards = homeHtml.match(/class="recent-post-item"/g) || []
if (!homeHtml.includes('href="/categories/"') || !homeHtml.includes('文章分类')) problems.push('首页缺少文章分类入口')
const categoriesHtml = await readFile(path.join(publicRoot, 'categories/index.html'), 'utf8')
if (!categoriesHtml.includes('category-list-link') || !categoriesHtml.includes('硬件设计')) problems.push('分类汇总页缺少已有分类')
if (homePostCards.length !== expectedPostSources.length) problems.push(`首页应显示 ${expectedPostSources.length} 张文章卡片，实际为 ${homePostCards.length}`)

const searchXml = await readFile(path.join(publicRoot, 'search.xml'), 'utf8')
const atomXml = await readFile(path.join(publicRoot, 'atom.xml'), 'utf8')
const sitemapXml = await readFile(path.join(publicRoot, 'sitemap.xml'), 'utf8')
if (/<loc>[^<]*\/404(?:\.html)?\/?<\/loc>/.test(sitemapXml)) problems.push('404 错误页不应进入 sitemap')
for (const [label, content] of [['search.xml', searchXml], ['atom.xml', atomXml], ['sitemap.xml', sitemapXml]]) {
  if (!content.includes(welcomePostPath)) problems.push(`${label} 缺少首篇文章地址: ${welcomePostPath}`)
  if (!content.includes(powerPostPath)) problems.push(`${label} 缺少电源文章地址: ${powerPostPath}`)
}
if (!searchXml.includes('<entry>') || !atomXml.includes('<entry>')) problems.push('Search 或 Atom 没有生成首篇文章条目')

const archiveHtml = await readFile(path.join(publicRoot, 'archives', 'index.html'), 'utf8')
if (!archiveHtml.includes(welcomePostTitle) || !archiveHtml.includes(welcomePostPath)) problems.push('归档页缺少首篇文章')
if (!archiveHtml.includes(powerPostTitle) || !archiveHtml.includes(powerPostPath)) problems.push('归档页缺少电源文章')

const powerHtml = await readFile(path.join(publicRoot, 'posts/lm2596-ams1117-design/index.html'), 'utf8')
for (const tag of powerHtml.match(/<img\b[^>]*\bsrc=["']\/images\/posts\/[^>]*>/g) || []) {
  if (!/\bwidth=["']\d+["']/.test(tag) || !/\bheight=["']\d+["']/.test(tag)) problems.push('正文图片缺少预留尺寸：' + tag.slice(0, 180))
}
if (!powerHtml.includes(powerPostTitle)) problems.push('电源文章标题不正确')
if (!powerHtml.includes('id="前言"')) problems.push('电源文章缺少“前言”锚点')
if ((powerHtml.match(/<h2\b/g) || []).length !== 11) problems.push('电源文章二级标题数量不正确')
if (!powerHtml.includes('id="post-comment"')) problems.push('电源文章没有开启评论')
if ((powerHtml.match(/class="han-equation"/g) || []).length !== 12) problems.push('电源文章公式没有完整渲染')
if (!powerHtml.includes(`/vendor/katex/${katex.version}/katex.min.css`)) problems.push('公式缺少本地样式')
if (powerHtml.includes('class="highlight text"') || powerHtml.includes('katex-error') || powerHtml.includes('{% math %}')) problems.push('公式仍是代码块或渲染失败')
for (const name of ['schematic.png', 'pcb-layout.png', 'pcb-3d.png', 'assembled-board.jpg', '5v-load-800ma.jpg', '3v3-load-800ma.jpg']) {
  if (!powerHtml.includes(`/images/posts/lm2596-ams1117-design/${name}`)) problems.push(`电源文章缺少图片 ${name}`)
}
if (/src=["']lm2596-ams1117-design\//.test(powerHtml)) problems.push('电源文章仍使用草稿相对图片路径')
if (!powerHtml.includes('name="description"') || !powerHtml.includes('name="keywords"')) problems.push('电源文章缺少 SEO 元数据')

const articleHtml = await readFile(path.join(publicRoot, 'posts', 'welcome-and-roadmap', 'index.html'), 'utf8')
if (!articleHtml.includes('id="本站主要内容方向"') || !articleHtml.includes('id="写作原则与后续更新"')) problems.push('文章页缺少两个二级标题锚点')
const levelThreeHeadings = articleHtml.match(/<h3\b/g) || []
if (levelThreeHeadings.length !== 5) problems.push(`文章页应包含 5 个三级标题，实际为 ${levelThreeHeadings.length}`)

const aboutHtml = await readFile(path.join(publicRoot, 'about', 'index.html'), 'utf8')
if (!aboutHtml.includes('座右铭：') || !aboutHtml.includes('逆水行舟，不进则退')) problems.push('关于页缺少座右铭')

for (const htmlFile of htmlFiles) {
  const html = await readFile(htmlFile, 'utf8')
  const relativeHtml = path.relative(publicRoot, htmlFile)

  if (html.includes('http://example.com')) problems.push(`生成页面仍包含示例域名: public/${relativeHtml}`)
  if (html.includes('[object Object]')) problems.push(`生成页面包含无效的配置注入结果: public/${relativeHtml}`)

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
    const sitePath = cleanUrl.startsWith('/') ? cleanUrl : path.posix.resolve(htmlUrlDirectory, cleanUrl)
    const relativeTarget = sitePath.replace(/^\/+/, '')
    const directTarget = path.join(publicRoot, relativeTarget)
    const indexTarget = path.join(directTarget, 'index.html')

    if (!await exists(directTarget) && !await exists(indexTarget)) problems.push(`内部资源不存在: public/${relativeHtml} -> ${rawUrl}`)
  }
}

if (problems.length > 0) {
  console.error(`站点检查失败，共 ${problems.length} 个问题：`)
  for (const problem of problems) console.error(`- ${problem}`)
  process.exit(1)
}

console.log(`站点检查通过：${htmlFiles.length} 个 HTML 页面，${requiredOutputs.length} 个必需产物；首篇定位、座右铭、归档、Search、Atom 与旧内容清理规则均已验证。`)
