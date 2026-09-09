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
    ['/atom.xml', '<feed '],
    ['/search.xml', '<search>'],
    ['/sitemap.xml', '<urlset'],
    ['/robots.txt', 'Sitemap: https://www.han.tax/sitemap.xml']
  ]

  for (const [endpoint, marker] of checks) {
    const response = await fetch(new URL(endpoint, siteUrl))
    assert(response.ok, `${endpoint} 返回 HTTP ${response.status}`)
    const body = await response.text()
    assert(body.includes(marker), `${endpoint} 缺少预期内容：${marker}`)
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
    assert(await page.locator('.han-skip-link').count() === 1, '首页缺少跳转到主要内容链接')
    assert(await page.locator('#recent-posts .recent-post-item').count() === 0, '零文章首页仍显示文章卡片')
    assert((await page.locator('#recent-posts .recent-post-items').innerText()).trim() === '', '零文章首页正文不为空')
    assert(await page.locator('a[href*="github.com/lilinhan24-lab"]').count() === 0, '首页仍显示个人 GitHub 入口')
    assert(await page.locator('#aside-content .card-info .site-data').count() === 0, '作者卡片仍显示零计数')
    assert(await page.locator('.card-recent-post, .card-categories, .card-tags, .card-archives, .card-webinfo').count() === 0, '首页仍显示空的侧栏卡片')

    const navItems = page.locator('#menus .menus_items > .menus_item > a.site-page')
    assert(await navItems.count() === 3, `桌面导航数量不是 3，实际为 ${await navItems.count()}`)
    const navText = (await navItems.allInnerTexts()).map(text => text.trim())
    assert(JSON.stringify(navText) === JSON.stringify(['首页', '关于', '说说']), `桌面导航不正确：${navText.join(' / ')}`)

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
      await page.screenshot({ path: path.join(screenshotDirectory, 'han-tax-desktop.png'), fullPage: true })
    }

    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K')
    await page.locator('#local-search .local-search-input input').waitFor({ state: 'visible' })
    const searchInput = page.locator('#local-search .local-search-input input')
    const emptyQuery = '不存在的硬件文章-20260909'
    await searchInput.fill(emptyQuery)
    await page.waitForFunction(query => document.querySelector('#local-search-stats')?.textContent?.includes(query), emptyQuery)
    assert(await page.locator('.local-search-hit-item').count() === 0, '零文章搜索意外返回了结果')
    assert((await page.locator('#local-search-stats').innerText()).includes(emptyQuery), '搜索没有正确显示无结果状态')
    await page.keyboard.press('Escape')
    await page.locator('#local-search .search-dialog').waitFor({ state: 'hidden' })

    const originalTheme = await page.locator('html').getAttribute('data-theme')
    await page.evaluate(() => document.getElementById('darkmode').click())
    await page.waitForFunction(theme => document.documentElement.getAttribute('data-theme') !== theme, originalTheme)

    await page.goto(new URL('/about/', siteUrl).href, { waitUntil: 'domcontentloaded' })
    const aboutText = await page.locator('#article-container').innerText()
    assert(aboutText.includes('你好，我是硬件小小林'), '关于页缺少新身份介绍')
    assert(aboutText.includes('竞赛与完整项目复盘'), '关于页缺少内容方向')
    assert(!aboutText.includes('函的极客笔记') && !aboutText.includes('PT100') && !aboutText.includes('LM2596'), '关于页仍包含旧品牌或旧文章')
    assert(await page.locator('a[href*="github.com/lilinhan24-lab"]').count() === 0, '关于页仍显示个人 GitHub 入口')

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
    assert(mobileState.scrollWidth <= mobileState.innerWidth + 1, `移动端存在横向溢出：${mobileState.scrollWidth}px > ${mobileState.innerWidth}px`)
    assert(mobileState.backgroundImage.includes('banner-glacier.jpg'), '移动端没有使用冰川背景')
    assert(['center center', '50% 50%'].includes(mobileState.backgroundPosition), `移动端冰川背景没有居中：${mobileState.backgroundPosition}`)
    assert(mobileState.headerHeight >= 480, `移动端首屏高度不足 480px：${mobileState.headerHeight}px`)
    assert(await mobilePage.locator('link[rel="preload"][href="/img/banner-glacier.jpg"]').count() === 1, '移动端冰川预加载数量不是 1')
    if (screenshotDirectory) {
      await mobilePage.screenshot({ path: path.join(screenshotDirectory, 'han-tax-mobile.png'), fullPage: true })
    }
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

try {
  await startServerIfNeeded()
  await checkGeneratedEndpoints()
  await runBrowserChecks()
  console.log('浏览器功能检查通过：零文章首页、新品牌、冰川背景、精简导航、无结果搜索、深色模式、移动端、404 与说说后台更新均正常。')
} finally {
  if (serverProcess && !serverProcess.killed) serverProcess.kill()
}
