import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicRoot = path.join(projectRoot, 'public')
const sourceRoot = path.join(projectRoot, 'source')
const welcomePostPath = '/posts/welcome-and-roadmap/'
const welcomePostTitle = '开篇寄语｜本站介绍与未来内容规划'
const powerPostPath = '/posts/lm2596-ams1117-design/'
const powerPostTitle = 'LM2596＋AMS1117 两级降压电源设计（待实验版）'
const problems = []

const requiredOutputs = [
  'index.html',
  '404.html',
  'about/index.html',
  'talks/index.html',
  'archives/index.html',
  'posts/welcome-and-roadmap/index.html',
  'posts/lm2596-ams1117-design/index.html',
  'images/posts/lm2596-ams1117-design/schematic.png',
  'images/posts/lm2596-ams1117-design/pcb-layout.png',
  'images/posts/lm2596-ams1117-design/pcb-3d.png',
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

const requiredOriginalArticleFragments = [
  '大家好，欢迎来到我的个人技术博客。',
  '本站依托 OpenAI Agent + Codex 技术辅助从零搭建完成，是我个人专属的技术沉淀、项目复盘、成长记录与经验输出阵地。搭建这个博客的初衷很简单：把零散的学习过程系统化，把踩过的坑记录下来，把积累的技术沉淀输出出去。',
  '未来本站将长期聚焦嵌入式硬件开发核心赛道，持续输出高质量、可落地、真实项目向的技术内容。',
  '## 本站主要内容方向',
  '### 1. 嵌入式硬件开发实战',
  'STM32、外设驱动、RTOS 实时系统、多任务架构、控制算法、底层逻辑调试等嵌入式核心技术复盘，全部基于真实项目与工程场景。',
  '### 2. PCB设计、硬件调试与排坑经验',
  '原理图绘制、Layout布线规范、阻抗匹配、电源设计、硬件故障排查、焊接调试、量产思维，记录硬件工程师最真实的踩坑与复盘。',
  '### 3. 学科竞赛完整复盘',
  '电赛、智能车、嵌赛、西门子杯等工科主流竞赛的备赛思路、架构设计、代码逻辑、控参优化、避坑指南、获奖经验总结。',
  '### 4. 项目实战与技术积累',
  '从零基础入门到进阶工程思维，记录完整的学习路径、项目迭代过程、技术难点拆解、底层逻辑理解，拒绝碎片化水文，只输出可复用、可借鉴的干货内容。',
  '### 5. 工科学习、成长与就业思考',
  '记录自己在工科学习、技术深耕、竞赛内卷、求职认知、行业趋势中的真实感悟，沉淀属于自己的工程思维与职业认知体系。',
  '## 建站初衷与未来展望',
  '技术的成长，从来不是靠看过多少视频、刷过多少知识点，而是复盘、沉淀、输出、迭代。',
  '过去的学习大多停留在“输入”，知识零散、容易遗忘、不成体系。搭建这个博客，就是为了倒逼自己：每一次学习、每一次调板、每一次竞赛备赛、每一次踩坑，都要有沉淀、有记录、有输出。',
  '未来我会保持长期更新，坚持真实、落地、硬核、原创的内容风格。',
  '不堆砌理论，不写空话套话，所有内容全部来源于真实项目、真实调试、真实竞赛经历。',
  '希望通过持续输出，构建属于自己的技术知识库与成长体系，让每一步学习都有痕迹，每一次努力都能复利。',
  '慢慢积累、稳步向上，为未来的技术深耕、项目进阶、学业提升、就业发展铺好每一级台阶。',
  '也希望我的分享，能够帮到正在嵌入式路上努力的同行者，互相成长、共同进步。'
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
for (const fragment of requiredOriginalArticleFragments) {
  const fragmentIndex = welcomePostSource.indexOf(fragment, fragmentCursor)
  if (fragmentIndex === -1) {
    problems.push(`首篇文章原文缺失或顺序改变: ${JSON.stringify(fragment)}`)
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
  ['新版自定义样式', '/css/custom.css?v=20260915-3']
]

for (const [label, marker] of requiredHomeMarkers) {
  if (!homeHtml.includes(marker)) problems.push(`首页缺少${label}: ${marker}`)
}

const glacierPreloads = homeHtml.match(/<link\b[^>]*\brel=["']preload["'][^>]*banner-glacier\.jpg[^>]*>/gi) || []
if (glacierPreloads.length !== 1) problems.push(`首页冰川背景预加载数量应为 1，实际为 ${glacierPreloads.length}`)

for (const route of ['/tags/', '/categories/']) {
  if (homeHtml.includes(`href="${route}"`) || homeHtml.includes(`href='${route}'`)) problems.push(`首页仍包含暂未启用入口: ${route}`)
}

const homePostCards = homeHtml.match(/class="recent-post-item"/g) || []
if (homePostCards.length !== expectedPostSources.length) problems.push(`首页应显示 ${expectedPostSources.length} 张文章卡片，实际为 ${homePostCards.length}`)

const searchXml = await readFile(path.join(publicRoot, 'search.xml'), 'utf8')
const atomXml = await readFile(path.join(publicRoot, 'atom.xml'), 'utf8')
const sitemapXml = await readFile(path.join(publicRoot, 'sitemap.xml'), 'utf8')
for (const [label, content] of [['search.xml', searchXml], ['atom.xml', atomXml], ['sitemap.xml', sitemapXml]]) {
  if (!content.includes(welcomePostPath)) problems.push(`${label} 缺少首篇文章地址: ${welcomePostPath}`)
  if (!content.includes(powerPostPath)) problems.push(`${label} 缺少电源文章地址: ${powerPostPath}`)
}
if (!searchXml.includes('<entry>') || !atomXml.includes('<entry>')) problems.push('Search 或 Atom 没有生成首篇文章条目')

const archiveHtml = await readFile(path.join(publicRoot, 'archives', 'index.html'), 'utf8')
if (!archiveHtml.includes(welcomePostTitle) || !archiveHtml.includes(welcomePostPath)) problems.push('归档页缺少首篇文章')
if (!archiveHtml.includes(powerPostTitle) || !archiveHtml.includes(powerPostPath)) problems.push('归档页缺少电源文章')

const powerHtml = await readFile(path.join(publicRoot, 'posts/lm2596-ams1117-design/index.html'), 'utf8')
if (!powerHtml.includes(powerPostTitle)) problems.push('电源文章缺少待实验版标题')
if (!powerHtml.includes('id="前言"')) problems.push('电源文章缺少“前言”锚点')
if ((powerHtml.match(/<h2\b/g) || []).length !== 7) problems.push('电源文章二级标题数量不正确')
if (!powerHtml.includes('id="post-comment"')) problems.push('电源文章没有开启评论')
for (const name of ['schematic.png', 'pcb-layout.png', 'pcb-3d.png']) {
  if (!powerHtml.includes(`/images/posts/lm2596-ams1117-design/${name}`)) problems.push(`电源文章缺少图片 ${name}`)
}
if (/src=["']lm2596-ams1117-design\//.test(powerHtml)) problems.push('电源文章仍使用草稿相对图片路径')
if (!powerHtml.includes('name="description"') || !powerHtml.includes('name="keywords"')) problems.push('电源文章缺少 SEO 元数据')

const articleHtml = await readFile(path.join(publicRoot, 'posts', 'welcome-and-roadmap', 'index.html'), 'utf8')
if (!articleHtml.includes('id="本站主要内容方向"') || !articleHtml.includes('id="建站初衷与未来展望"')) problems.push('文章页缺少两个二级标题锚点')
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

console.log(`站点检查通过：${htmlFiles.length} 个 HTML 页面，${requiredOutputs.length} 个必需产物；首篇原文、座右铭、归档、Search、Atom 与旧内容清理规则均已验证。`)
