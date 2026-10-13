const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const load = name => fs.existsSync(path.resolve(name)) ? require(path.resolve(name)) : {}
const site = load('lib/email-site.cjs')
const runner = load('lib/email-runner.cjs')
const core = load('lib/email-notifications.cjs')
const config = { origin: 'https://www.han.tax', enabled: false, sender: { name: '硬件小小林', email: 'news@han.tax' }, replyTo: 'lilinhan24@gmail.com', listId: 8, formUrl: 'https://example.sibforms.com/serve/fixture' }
const manifest = { version: 1, posts: [{ url: 'https://www.han.tax/posts/demo/', title: '电源设计', description: '测试记录', published: '2026-09-01T00:00:00Z', revision: 'a'.repeat(64) }] }

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'han-email-test-'))
  for (const dir of ['email', 'public']) fs.mkdirSync(path.join(root, dir))
  fs.writeFileSync(path.join(root, 'email/config.json'), JSON.stringify(config))
  fs.writeFileSync(path.join(root, 'email/baseline.json'), JSON.stringify(manifest))
  fs.writeFileSync(path.join(root, 'public/email-notifications.json'), JSON.stringify(manifest))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

test('订阅未启用时不生成页面，不向文章与页脚插入入口', () => {
  assert.equal(typeof site.subscriptionRoutes, 'function')
  assert.deepEqual(site.subscriptionRoutes(config), [])
  const html = '<head></head><div class="post-copyright"></div><footer id="footer"></footer>'
  assert.equal(site.addSubscriptionLinks(html, config), html)
})

test('启用后页面明确确认和退订方式，入口不重复，不泄露技术文件', () => {
  assert.equal(typeof site.subscriptionRoutes, 'function')
  const enabled = { ...config, enabled: true }
  const routes = site.subscriptionRoutes(enabled)
  const page = routes.find(route => route.path === 'subscribe/index.html')
  assert.equal(page.layout, 'page')
  assert.equal(page.data.layout, 'page', '主题应识别为独立页面，不能把订阅页当首页')
  assert.equal(page.data.comments, false)
  assert.match(page.data.content, /确认邮件/)
  assert.match(page.data.content, /取消订阅/)
  assert.match(page.data.content, /title="邮箱订阅表单"/)
  assert.match(page.data.content, /src="https:\/\/example\.sibforms\.com\/v2\/serve\/fixture"/)
  assert.match(page.data.content, /https:\/\/example\.sibforms\.com\/serve\/fixture/)
  assert.doesNotMatch(page.data.content, /RSS|Atom|XML|api-key/)
  const original = '<head></head><div class="post-copyright"></div><footer id="footer"></footer>'
  const once = site.addSubscriptionLinks(original, enabled)
  assert.equal((once.match(/href="\/subscribe\/"/g) || []).length, 2)
  assert.equal(site.addSubscriptionLinks(once, enabled), once)
})

test('名单或表单缺失、伪造表单域名时构建失败，不放出无效订阅入口', () => {
  assert.equal(typeof site.subscriptionRoutes, 'function')
  for (const change of [{ listId: null }, { formUrl: null }, { formUrl: 'https://sibforms.com.evil.test/serve/x' }, { formUrl: 'http://a.sibforms.com/serve/x' }]) {
    assert.throws(() => site.subscriptionRoutes({ ...config, enabled: true, ...change }))
  }
})

test('表单嵌入失败时仍有可直接打开的订阅入口', () => {
  const page = site.subscriptionRoutes({ ...config, enabled: true })[0]
  assert.match(page.data.content, /<a[^>]+href="https:\/\/example\.sibforms\.com\/serve\/fixture"[^>]*>直接打开订阅表单<\/a>/)
})

test('命令行默认本地预演，无网络和发信副作用', async t => {
  assert.equal(typeof runner.execute, 'function')
  const result = await runner.execute({ root: fixture(t), args: [], env: {}, fetchImpl: () => { throw new Error('must not fetch') } })
  assert.equal(result.mode, 'dry-run')
  assert.deepEqual(result.plan, [])
})

test('缺少初始化基线时停止，不将已有文章当成新增文章', async t => {
  assert.equal(typeof runner.execute, 'function')
  const root = fixture(t)
  fs.unlinkSync(path.join(root, 'email/baseline.json'))
  await assert.rejects(runner.execute({ root, args: [], env: {} }), /基线/)
})

test('正式模式必须同时打开工程和运行环境两个开关，失败不访问网络', async t => {
  assert.equal(typeof runner.execute, 'function')
  const root = fixture(t)
  const fetchImpl = () => { throw new Error('must not fetch') }
  await assert.rejects(runner.execute({ root, args: ['send'], env: { HAN_EMAIL_SEND_ENABLED: 'true' }, fetchImpl }), /未启用/)
  fs.writeFileSync(path.join(root, 'email/config.json'), JSON.stringify({ ...config, enabled: true }))
  await assert.rejects(runner.execute({ root, args: ['send'], env: {}, fetchImpl }), /未启用/)
})

test('正式发送只读线上清单而非本地修改，重定向禁止，密钥不发送给网站', async t => {
  assert.equal(typeof runner.execute, 'function')
  const root = fixture(t)
  fs.writeFileSync(path.join(root, 'email/config.json'), JSON.stringify({ ...config, enabled: true }))
  fs.writeFileSync(path.join(root, 'public/email-notifications.json'), JSON.stringify({ version: 1, posts: [] }))
  const requests = []
  const result = await runner.execute({ root, args: ['send'], env: { HAN_EMAIL_SEND_ENABLED: 'true', BREVO_API_KEY: 'test-only' }, fetchImpl: async (url, options) => {
    requests.push({ url, options })
    if (url === 'https://www.han.tax/email-notifications.json') return new Response(JSON.stringify(manifest))
    if (url.startsWith('https://api.brevo.com/v3/emailCampaigns?')) return new Response(JSON.stringify({ campaigns: [], count: 0 }))
    throw new Error('Unexpected network request')
  } })
  assert.deepEqual(result.sent, [])
  assert.equal(requests[0].options.redirect, 'error')
  assert.equal(requests[0].options.headers?.['api-key'], undefined)
  assert.equal(requests.length, 2)
})

test('线上清单请求失败或格式异常时不访问发信 API', async t => {
  assert.equal(typeof runner.execute, 'function')
  const root = fixture(t)
  fs.writeFileSync(path.join(root, 'email/config.json'), JSON.stringify({ ...config, enabled: true }))
  for (const response of [new Response('bad', { status: 503 }), new Response('{}')]) {
    let count = 0
    await assert.rejects(runner.execute({ root, args: ['send'], env: { HAN_EMAIL_SEND_ENABLED: 'true', BREVO_API_KEY: 'test-only' }, fetchImpl: async () => { count++; return response } }))
    assert.equal(count, 1)
  }
})

test('真实 CLI 遇到拼错模式非零退出，不泄露环境密钥', t => {
  const cli = path.resolve('tools/email-notifications.cjs')
  assert.ok(fs.existsSync(cli), '通知 CLI 尚未实现')
  const root = fixture(t)
  fs.mkdirSync(path.join(root, 'lib'))
  for (const name of ['email-runner.cjs', 'email-notifications.cjs']) {
    fs.copyFileSync(path.resolve('lib', name), path.join(root, 'lib', name))
  }
  const childEnv = { ...process.env, BREVO_API_KEY: 'secret-must-not-appear' }
  delete childEnv.NODE_TEST_CONTEXT
  const run = spawnSync(process.execPath, [cli, 'sned'], { cwd: root, encoding: 'utf8', env: childEnv })
  assert.equal(run.status, 1)
  assert.match(run.stderr, /模式/)
  assert.doesNotMatch(run.stderr + run.stdout, /secret-must-not-appear/)
})

test('生成器输出使用原始正文，排除草稿，清单不带正文和邮箱', () => {
  const file = path.resolve('scripts/email-subscription.js')
  assert.ok(fs.existsSync(file), 'Hexo 接入尚未实现')
  const registrations = new Map()
  const callbacks = new Map()
  const vm = require('node:vm')
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { require, hexo: { base_dir: process.cwd(), config: { url: config.origin }, extend: { generator: { register: (name, fn) => registrations.set(name, fn) }, filter: { register: (name, fn) => callbacks.set(name, fn) } } } })
  const post = { path: 'posts/demo/', title: '设计', description: '', date: new Date('2026-09-01'), _content: '原始正文', content: '渲染后正文', published: true }
  const generate = registrations.get('email-subscription')
  const routes = generate({ posts: { toArray: () => [post, { ...post, published: false }] } })
  const output = JSON.parse(routes.find(r => r.path === 'email-notifications.json').data)
  assert.equal(output.posts.length, 1)
  assert.equal(output.posts[0].revision, core.createManifest([{ ...post, content: '原始正文' }], config.origin).posts[0].revision)
  assert.doesNotMatch(JSON.stringify(output), /原始正文|渲染后正文|gmail|news@/)
})

test('邮件样式预览明确未发送，不生成可操作的退订链接，不访问外网', async t => {
  assert.equal(typeof runner.writePreviews, 'function')
  const root = fixture(t)
  const files = await runner.writePreviews(root)
  assert.equal(files.length, 2)
  const newArticle = fs.readFileSync(path.join(root, 'artifacts/email-preview/new.html'), 'utf8')
  const update = fs.readFileSync(path.join(root, 'artifacts/email-preview/updated.html'), 'utf8')
  assert.match(newArticle, /新文章/)
  assert.match(update, /文章更新/)
  for (const html of [newArticle, update]) {
    assert.match(html, /未发送/)
    assert.match(html, /href="https:\/\/www\.han\.tax\/posts\/demo\/"/)
    assert.doesNotMatch(html, /\{\{ unsubscribe \}\}|href="[^"]*unsubscribe|<script|<form/)
  }
})
