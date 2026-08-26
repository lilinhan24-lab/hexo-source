import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const managedSiteUrl = 'http://127.0.0.1:4101'
const siteUrl = process.env.HAN_SITE_URL || managedSiteUrl
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
    ['/atom.xml', '<feed'],
    ['/search.xml', '<entry>'],
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
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))

  await page.goto(siteUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('load')
  await page.locator('#search-button > .search').waitFor({ state: 'visible' })
  assert(await page.locator('.han-skip-link').count() === 1, '首页缺少跳转到主要内容链接')
  assert(await page.locator('a[href="/atom.xml"]').count() > 0, '首页缺少 RSS 订阅入口')

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K')
  await page.locator('#local-search .local-search-input input').waitFor({ state: 'visible' })
  const searchInput = page.locator('#local-search .local-search-input input')
  await searchInput.fill('PT100')
  await page.waitForFunction(() => document.querySelectorAll('.local-search-hit-item').length > 0)
  const searchText = await page.locator('#local-search-results').innerText()
  assert(searchText.includes('PT100'), '站内搜索没有返回 PT100 文章')
  await page.keyboard.press('Escape')

  await page.goto(new URL('/posts/pt100-transmitter/', siteUrl).href, { waitUntil: 'domcontentloaded' })
  assert(await page.locator('.post-meta-wordcount .word-count').count() === 1, '文章页没有显示字数统计')
  assert(await page.locator('.post-meta-wordcount').innerText().then(text => text.includes('阅读时长')), '文章页没有显示阅读时长')
  assert(await page.locator('#article-container .headerlink').count() > 0, '文章标题缺少可复制锚点')

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
  const mobilePage = await mobileContext.newPage()
  await mobilePage.goto(new URL('/posts/pt100-transmitter/', siteUrl).href, { waitUntil: 'domcontentloaded' })
  const dimensions = await mobilePage.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth
  }))
  assert(dimensions.scrollWidth <= dimensions.innerWidth + 1, `移动端存在横向溢出：${dimensions.scrollWidth}px > ${dimensions.innerWidth}px`)
  await mobileContext.close()

  await page.goto(new URL('/404.html', siteUrl).href, { waitUntil: 'domcontentloaded' })
  assert(await page.locator('#article-container a').count() >= 4, '404 页面缺少恢复导航入口')

  await page.route('https://api.han.tax/pub/talks/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: true, count: 0, data: [] })
  }))
  await page.route('https://cdn.jsdelivr.net/npm/qexo-static@1.5.0/hexo/talks.min.js', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: "function showQexoTalks(id){document.getElementById(id).innerHTML='<section class=\"qexot\"><div class=\"qexot-list\"></div></section>'}"
  }))
  await page.goto(new URL('/talks/', siteUrl).href, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1_000)
  const talksText = await page.locator('#qexot').innerText()
  assert(talksText.includes('这里暂时还没有说说'), `说说空状态未正确显示，实际内容：${talksText}`)

  assert(pageErrors.length === 0, `页面 JavaScript 错误：${pageErrors.join(' | ')}`)
  await context.close()
  await browser.close()
}

try {
  await startServerIfNeeded()
  await checkGeneratedEndpoints()
  await runBrowserChecks()
  console.log('浏览器功能检查通过：搜索、RSS、文章阅读信息、移动端、404 与说说空状态均正常。')
} finally {
  if (serverProcess && !serverProcess.killed) serverProcess.kill()
}
