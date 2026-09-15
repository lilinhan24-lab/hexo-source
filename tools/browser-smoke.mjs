import { spawn } from 'node:child_process'
import { access, mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const managedSiteUrl = 'http://127.0.0.1:4101'
const siteUrl = process.env.HAN_SITE_URL || managedSiteUrl
const screenshotDirectory = process.env.HAN_SCREENSHOT_DIR
const welcomePostPath = '/posts/welcome-and-roadmap/'
const welcomePostTitle = '开篇寄语｜本站介绍与未来内容规划'
const powerPostPath = '/posts/lm2596-ams1117-design/'
const powerPostTitle = 'LM2596 与 AMS1117 两级降压电源设计：5V/3.3V 输出、器件选型与 PCB 布局（待实验版）'
let serverProcess

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function findBrowser() {
  const candidates = [
    process.env.HAN_BROWSER_PATH,
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/microsoft-edge',
    '/usr/bin/chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {}
  }

  throw new Error('未找到可用的 Edge/Chrome；可通过 HAN_BROWSER_PATH 指定浏览器路径。')
}

async function waitForSite(url) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`本地站点未在 30 秒内启动：${url}`)
}

async function startServerIfNeeded() {
  if (process.env.HAN_SITE_URL) return

  const hexoBin = path.join(projectRoot, 'node_modules', 'hexo', 'bin', 'hexo')
  serverProcess = spawn(process.execPath, [hexoBin, 'server', '--port', '4101', '--ip', '127.0.0.1', '--silent'], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })

  let serverError = ''
  serverProcess.stderr.on('data', chunk => { serverError += chunk.toString() })
  serverProcess.once('exit', code => {
    if (code && serverError) process.stderr.write(serverError)
  })
  await waitForSite(siteUrl)
}

async function checkGeneratedEndpoints() {
  const checks = [
    ['/archives/', welcomePostTitle],
    ['/atom.xml', welcomePostPath],
    ['/search.xml', welcomePostPath],
    ['/sitemap.xml', welcomePostPath],
    ['/archives/', powerPostTitle],
    ['/atom.xml', powerPostPath],
    ['/search.xml', powerPostPath],
    ['/sitemap.xml', powerPostPath],
    ['/robots.txt', 'Sitemap: https://www.han.tax/sitemap.xml']
  ]

  for (const [endpoint, marker] of checks) {
    const response = await fetch(new URL(endpoint, siteUrl))
    assert(response.ok, `${endpoint} 返回 HTTP ${response.status}`)
    const body = await response.text()
    assert(body.includes(marker), `${endpoint} 缺少预期内容：${marker}`)
  }

  for (const endpoint of ['/posts/lm2596-ams1117/', '/posts/pt100-transmitter/']) {
    const response = await fetch(new URL(endpoint, siteUrl))
    const body = await response.text()
    assert(response.status === 404, `${endpoint} 应返回 404，实际为 ${response.status}`)
    if (process.env.HAN_SITE_URL) assert(body.includes('页面不存在'), `${endpoint} 没有显示自定义 404`)
  }
}

async function runBrowserChecks() {
  const executablePath = await findBrowser()
  const browser = await chromium.launch({ executablePath, headless: true })
  const pageErrors = []

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    page.on('pageerror', error => pageErrors.push(error.message))

    await page.goto(siteUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('load')
    await page.locator('#search-button > .search').waitFor({ state: 'visible' })

    assert(await page.title() === '小小林的个人博客 - 嵌入式硬件学习与工程实践', `首页标题不正确：${await page.title()}`)
    assert(await page.locator('#site-title').innerText() === '小小林的个人博客', '首页主标题不正确')
    assert(await page.locator('.author-info-name').innerText() === '硬件小小林', '侧栏作者名不正确')
    assert(await page.locator('.han-motto').innerText() === '逆水行舟，不进则退', '侧栏座右铭不正确')
    assert(await page.locator('.han-motto').isVisible(), '侧栏座右铭不可见')
    assert(await page.locator('.han-skip-link').count() === 1, '首页缺少跳转到主要内容链接')
    assert(await page.locator('#recent-posts .recent-post-item').count() === 2, '首页应有两张文章卡片')
    assert(await page.locator('#recent-posts .article-title').first().innerText() === powerPostTitle, '最新文章卡片标题不正确')
    assert((await page.locator('#recent-posts').innerText()).includes(welcomePostTitle), '首页缺少开篇文章')
    assert((await page.locator('#recent-posts .content').first().innerText()).includes('面向 STM32 最小系统板及外设实验'), '电源文章摘要不正确')
    assert(await page.locator('.card-recent-post').count() === 1, '最近文章侧栏卡片没有恢复')
    assert((await page.locator('.card-recent-post').innerText()).includes(welcomePostTitle), '最近文章卡片缺少首篇文章')
    assert(await page.locator('a[href*="github.com/lilinhan24-lab"]').count() === 0, '首页仍显示个人 GitHub 入口')
    assert(await page.locator('#aside-content .card-info .site-data').count() === 0, '作者卡片仍包含文章、标签或分类数字')
    assert(await page.locator('.card-categories, .card-tags, .card-archives, .card-webinfo').count() === 0, '首页仍显示暂未启用的侧栏卡片')

    const navItems = page.locator('#menus .menus_items > .menus_item > a.site-page')
    assert(await navItems.count() === 4, `桌面导航数量不是 4，实际为 ${await navItems.count()}`)
    const navText = (await navItems.allInnerTexts()).map(text => text.trim())
    assert(JSON.stringify(navText) === JSON.stringify(['首页', '文章', '关于', '说说']), `桌面导航不正确：${navText.join(' / ')}`)
    assert(await page.locator('#menus a[href="/tags/"], #menus a[href="/categories/"]').count() === 0, '桌面导航出现分类或标签入口')

    assert(await page.locator('link[rel="preload"][href="/img/banner-glacier.jpg"]').count() === 1, '首页冰川背景预加载数量不是 1')
    assert(await page.locator('link[rel="preload"][href*="banner-desktop"], link[rel="preload"][href*="banner-mobile"]').count() === 0, '首页仍预加载旧背景')
    assert(await page.locator('link[rel~="icon"][href="/img/avatar-256.jpg"]').count() === 1, '头像没有作为 favicon')

    const visualStyles = await page.evaluate(() => {
      const headerStyle = getComputedStyle(document.getElementById('page-header'))
      const footerStyle = getComputedStyle(document.getElementById('footer'))
      return {
        backgroundImage: headerStyle.backgroundImage,
        backgroundPosition: headerStyle.backgroundPosition,
        backgroundColor: headerStyle.backgroundColor,
        footerBackground: footerStyle.backgroundColor
      }
    })
    assert(visualStyles.backgroundImage.includes('banner-glacier.jpg'), `首页没有使用冰川背景：${visualStyles.backgroundImage}`)
    assert(['center center', '50% 50%'].includes(visualStyles.backgroundPosition), `冰川背景没有居中：${visualStyles.backgroundPosition}`)
    assert(visualStyles.backgroundColor === 'rgb(11, 79, 135)', `背景占位色不正确：${visualStyles.backgroundColor}`)
    assert(visualStyles.footerBackground === 'rgb(8, 63, 107)', `页脚背景色不正确：${visualStyles.footerBackground}`)

    if (screenshotDirectory) {
      await mkdir(screenshotDirectory, { recursive: true })
      await page.screenshot({ path: path.join(screenshotDirectory, 'han-tax-home-desktop.png'), fullPage: true })
    }

    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K')
    await page.locator('#local-search .local-search-input input').waitFor({ state: 'visible' })
    const searchInput = page.locator('#local-search .local-search-input input')
    await searchInput.fill('开篇寄语')
    await page.waitForFunction(() => document.querySelectorAll('.local-search-hit-item').length === 1)
    assert((await page.locator('#local-search-results').innerText()).includes(welcomePostTitle), '搜索“开篇寄语”没有返回首篇文章')
    await searchInput.fill('LM2596')
    await page.waitForFunction(() => document.querySelector('#local-search-results')?.textContent?.includes('待实验版'))
    assert(await page.locator('.local-search-hit-item').count() === 1, '电源文章搜索结果数量不正确')

    const emptyQuery = '不存在的硬件文章-20260909'
    await searchInput.fill(emptyQuery)
    await page.waitForFunction(query => document.querySelector('#local-search-stats')?.textContent?.includes(query), emptyQuery)
    assert(await page.locator('.local-search-hit-item').count() === 0, '无结果搜索意外返回了文章')
    assert((await page.locator('#local-search-stats').innerText()).includes(emptyQuery), '搜索没有正确显示无结果状态')
    await page.keyboard.press('Escape')
    await page.locator('#local-search .search-dialog').waitFor({ state: 'hidden' })

    const originalTheme = await page.locator('html').getAttribute('data-theme')
    await page.evaluate(() => document.getElementById('darkmode').click())
    await page.waitForFunction(theme => document.documentElement.getAttribute('data-theme') !== theme, originalTheme)
    await page.evaluate(() => document.getElementById('darkmode').click())
    await page.waitForFunction(theme => document.documentElement.getAttribute('data-theme') === theme, originalTheme)

    await page.goto(new URL(welcomePostPath, siteUrl).href, { waitUntil: 'domcontentloaded' })
    assert((await page.locator('.post-title').innerText()) === welcomePostTitle, '文章页标题不正确')
    assert(await page.locator('.post-meta-wordcount .word-count').count() === 1, '文章页没有显示字数统计')
    assert((await page.locator('.post-meta-wordcount').innerText()).includes('阅读时长'), '文章页没有显示预计阅读时间')
    assert(await page.locator('#article-container h2').count() === 2, '文章页二级标题数量不正确')
    assert(await page.locator('#article-container h3').count() === 5, '文章页三级标题数量不正确')
    assert(await page.locator('#article-container .headerlink').count() === 7, '文章标题锚点数量不正确')
    assert(await page.locator('#card-toc .toc-content').count() === 1, '文章页没有生成目录')
    assert(await page.locator('#post-comment').count() === 1, '文章页没有评论容器')
    assert((await page.locator('#article-container').innerText()).includes('所有内容全部来源于真实项目、真实调试、真实竞赛经历。'), '文章正文缺少原文关键句')
    if (screenshotDirectory) await page.screenshot({ path: path.join(screenshotDirectory, 'han-tax-article-desktop.png'), fullPage: true })

    await checkPowerArticle(page, 'desktop')

    await page.goto(new URL('/about/', siteUrl).href, { waitUntil: 'domcontentloaded' })
    const aboutText = await page.locator('#article-container').innerText()
    assert(aboutText.includes('你好，我是硬件小小林'), '关于页缺少新身份介绍')
    assert(aboutText.includes('座右铭： 逆水行舟，不进则退。'), `关于页座右铭不正确：${aboutText}`)
    assert(!aboutText.includes('函的极客笔记') && !aboutText.includes('PT100') && !aboutText.includes('LM2596'), '关于页仍包含旧品牌或旧文章')
    assert(await page.locator('a[href*="github.com/lilinhan24-lab"]').count() === 0, '关于页仍显示个人 GitHub 入口')
    if (screenshotDirectory) await page.screenshot({ path: path.join(screenshotDirectory, 'han-tax-about.png'), fullPage: true })

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
    const mobilePage = await mobileContext.newPage()
    mobilePage.on('pageerror', error => pageErrors.push(`移动端：${error.message}`))
    await mobilePage.goto(siteUrl, { waitUntil: 'domcontentloaded' })
    const mobileState = await mobilePage.evaluate(() => {
      const headerStyle = getComputedStyle(document.getElementById('page-header'))
      return {
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        backgroundImage: headerStyle.backgroundImage,
        backgroundPosition: headerStyle.backgroundPosition,
        headerHeight: document.getElementById('page-header').getBoundingClientRect().height
      }
    })
    assert(mobileState.scrollWidth <= mobileState.innerWidth + 1, `移动端首页存在横向溢出：${mobileState.scrollWidth}px > ${mobileState.innerWidth}px`)
    assert(mobileState.backgroundImage.includes('banner-glacier.jpg'), '移动端没有使用冰川背景')
    assert(['center center', '50% 50%'].includes(mobileState.backgroundPosition), `移动端冰川背景没有居中：${mobileState.backgroundPosition}`)
    assert(mobileState.headerHeight >= 480, `移动端首屏高度不足 480px：${mobileState.headerHeight}px`)
    assert(await mobilePage.locator('#sidebar-menus .site-data').count() === 0, '手机菜单仍包含文章、标签或分类数字')
    const mobileNavText = (await mobilePage.locator('#sidebar-menus .menus_item > a.site-page').allInnerTexts()).map(text => text.trim())
    assert(JSON.stringify(mobileNavText) === JSON.stringify(['首页', '文章', '关于', '说说']), `手机导航不正确：${mobileNavText.join(' / ')}`)
    assert(await mobilePage.locator('#sidebar-menus a[href="/tags/"], #sidebar-menus a[href="/categories/"]').count() === 0, '手机菜单出现分类或标签入口')
    if (screenshotDirectory) await mobilePage.screenshot({ path: path.join(screenshotDirectory, 'han-tax-home-mobile.png'), fullPage: true })

    await mobilePage.goto(new URL(welcomePostPath, siteUrl).href, { waitUntil: 'domcontentloaded' })
    const mobileArticleState = await mobilePage.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      headingRights: [...document.querySelectorAll('#article-container h3')].map(heading => heading.getBoundingClientRect().right)
    }))
    assert(mobileArticleState.scrollWidth <= mobileArticleState.innerWidth + 1, `移动端文章存在横向溢出：${mobileArticleState.scrollWidth}px > ${mobileArticleState.innerWidth}px`)
    assert(mobileArticleState.headingRights.every(right => right <= mobileArticleState.innerWidth + 1), '移动端三级标题超出屏幕')
    if (screenshotDirectory) await mobilePage.screenshot({ path: path.join(screenshotDirectory, 'han-tax-article-mobile.png'), fullPage: true })
    await checkPowerArticle(mobilePage, 'mobile')
    await mobileContext.close()

    await page.goto(new URL('/404.html', siteUrl).href, { waitUntil: 'domcontentloaded' })
    assert(await page.locator('#article-container a').count() >= 3, '404 页面缺少恢复导航入口')

    await page.route('https://api.han.tax/pub/talks/**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: true,
        count: 1,
        data: [{ id: 'smoke', content: 'Browser smoke test', time: Date.now(), tags: ['test'], like: 0 }]
      })
    }))
    await page.goto(new URL('/talks/', siteUrl).href, { waitUntil: 'domcontentloaded' })
    assert(await page.locator('.qexo_loading').count() === 0, '说说页面仍显示外部转圈动画')
    await page.locator('.han-talk-item').waitFor({ state: 'visible' })
    const talksText = await page.locator('#qexot').innerText()
    assert(talksText.includes('Browser smoke test'), `说说后台更新未正确显示，实际内容：${talksText}`)

    assert(pageErrors.length === 0, `页面 JavaScript 错误：${pageErrors.join(' | ')}`)
    await context.close()
  } finally {
    await browser.close()
  }
}

async function checkPowerArticle(page, viewportName) {
  await page.goto(new URL(powerPostPath, siteUrl).href, { waitUntil: 'load' })
  assert(await page.locator('.post-title').innerText() === powerPostTitle, '电源文章标题不正确')
  const titleState = await page.locator('.post-title').evaluate(el => ({
    clamp: getComputedStyle(el).webkitLineClamp,
    clipped: el.scrollHeight > el.clientHeight + 1,
    top: el.getBoundingClientRect().top,
    bottom: el.getBoundingClientRect().bottom,
    headerBottom: document.querySelector('#page-header').getBoundingClientRect().bottom
  }))
  assert(titleState.clamp === 'none' && !titleState.clipped && titleState.top >= 60 && titleState.bottom <= titleState.headerBottom, `文章标题被截断或超出标题区：${JSON.stringify(titleState)}`)
  assert(await page.locator('#article-container h1').count() === 0, '电源文章正文重复了主标题')
  assert(await page.locator('#article-container h2').first().innerText() === '前言', '前言标题不是两个字')
  assert(await page.locator('#article-container h2').count() === 6, '电源文章章节数量不正确')
  assert(await page.locator('#card-toc .toc-content').count() === 1, '电源文章没有目录')
  assert(await page.locator('#post-comment').count() === 1, '电源文章没有评论区')
  assert((await page.locator('meta[name="description"]').getAttribute('content')).includes('面向 STM32'), '电源文章描述不正确')
  assert((await page.locator('meta[name="keywords"]').getAttribute('content')).includes('LM2596'), '电源文章缺少关键词')
  const images = page.locator('#article-container img')
  assert(await images.count() === 3, '电源文章图片数量不正确')
  for (const img of await images.all()) {
    await img.scrollIntoViewIfNeeded()
    await img.evaluate(el => el.decode())
    assert(Boolean(await img.getAttribute('alt')), '电源文章图片缺少 alt')
  }
  const state = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    h2Size: parseFloat(getComputedStyle(document.querySelector('#article-container h2')).fontSize),
    h3Size: parseFloat(getComputedStyle(document.querySelector('#article-container h3')).fontSize),
    broken: [...document.querySelectorAll('#article-container img')].some(img => !img.complete || !img.naturalWidth),
    anchorsValid: [...document.querySelectorAll('#card-toc a')].filter(a => a.hash).every(a => document.getElementById(decodeURIComponent(a.hash.slice(1))))
  }))
  assert(!state.overflow && !state.broken, `电源文章溢出或图片加载失败：${JSON.stringify(state)}`)
  assert(state.h2Size - state.h3Size >= 7, `电源文章标题层级不足：${JSON.stringify(state)}`)
  assert(state.anchorsValid, '电源文章目录存在失效锚点')
  if (screenshotDirectory) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await page.screenshot({ path: path.join(screenshotDirectory, `han-tax-power-${viewportName}-opening.png`) })
    await page.screenshot({ path: path.join(screenshotDirectory, `han-tax-power-${viewportName}.png`), fullPage: true })
  }
}

try {
  await startServerIfNeeded()
  await checkGeneratedEndpoints()
  await runBrowserChecks()
  console.log('浏览器功能检查通过：首篇文章、原文排版、座右铭、文章导航、归档、搜索、阅读信息、移动端、404 与说说均正常。')
} finally {
  if (serverProcess && !serverProcess.killed) serverProcess.kill()
}
