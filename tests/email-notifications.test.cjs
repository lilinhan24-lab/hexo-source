const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const modulePath = path.resolve('lib/email-notifications.cjs')
const sut = fs.existsSync(modulePath) ? require(modulePath) : {}
const config = { origin: 'https://www.han.tax', sender: { name: '硬件小小林', email: 'news@han.tax' }, replyTo: 'lilinhan24@gmail.com', listId: 8 }
const article = { path: 'posts/power/', title: '电源设计', description: '电路与测试', content: '正文', date: '2026-09-01', published: true }
const now = new Date('2026-10-11T12:00:00Z')
function manifest(posts = [article]) { return sut.createManifest(posts, config.origin, now) }

test('订阅模块提供可运行的变更检测和发送入口', () => {
  assert.equal(typeof sut.createManifest, 'function')
  assert.equal(typeof sut.runNotifications, 'function')
})

test('不把草稿、未来文章和明确关闭通知的文章加入发送清单', () => {
  assert.equal(typeof sut.createManifest, 'function')
  const result = manifest([article, { ...article, path: 'posts/draft/', published: false }, { ...article, path: 'posts/future/', date: '2027-01-01' }, { ...article, path: 'posts/private/', notify: false }])
  assert.deepEqual(result.posts.map(p => p.url), ['https://www.han.tax/posts/power/'])
})

test('接受 Hexo 自定义 permalink 返回的根相对路径，仍拒绝协议相对路径', () => {
  const result = manifest([{ ...article, path: '/posts/power/' }])
  assert.equal(result.posts[0].url, 'https://www.han.tax/posts/power/')
  assert.throws(() => manifest([{ ...article, path: '//evil.test/posts/power/' }]))
})

test('相同正文不因构建时间、updated 字段或换行符不同而重复通知', () => {
  assert.equal(typeof sut.createManifest, 'function')
  const first = manifest([{ ...article, content: 'A\r\nB', updated: '2026-10-01' }])
  const second = manifest([{ ...article, content: 'A\nB', updated: '2026-10-11' }])
  assert.equal(first.posts[0].revision, second.posts[0].revision)
})

test('正文、标题或人工更新标记改变时形成新的通知版本', () => {
  assert.equal(typeof sut.createManifest, 'function')
  const original = manifest().posts[0].revision
  for (const change of [{ content: '新测试结果' }, { title: '修正后的设计' }, { notify_revision: '图片实测补充' }]) {
    assert.notEqual(manifest([{ ...article, ...change }]).posts[0].revision, original)
  }
})

test('首次接入使用基线，不把历史文章重新群发', () => {
  assert.equal(typeof sut.planNotifications, 'function')
  assert.deepEqual(sut.planNotifications(manifest(), manifest(), []), [])
})

test('区分新文章和已有文章更新，只为变化项创建计划', () => {
  assert.equal(typeof sut.planNotifications, 'function')
  const current = manifest([{ ...article, content: '补充测试' }, { ...article, path: 'posts/new/' }])
  assert.deepEqual(sut.planNotifications(current, manifest(), []).map(p => p.kind), ['updated', 'new'])
})

test('发送记录可跨运行去重，已有草稿也不会被自动重发', () => {
  assert.equal(typeof sut.planNotifications, 'function')
  const current = manifest([{ ...article, content: '补充测试' }])
  const plan = sut.planNotifications(current, manifest(), [])[0]
  assert.equal(sut.planNotifications(current, manifest(), [{ name: plan.name, status: 'sent' }]).length, 0)
  assert.equal(sut.planNotifications(current, manifest(), [{ name: plan.name, status: 'draft' }])[0].blocked, true)
})

test('邮件正文转义文章信息，包含正确文章链接和服务商退订占位符', () => {
  assert.equal(typeof sut.campaignPayload, 'function')
  const current = manifest([{ ...article, title: '<script>alert(1)</script>', description: '<img src=x onerror=x>' }])
  const plan = sut.planNotifications(current, { version: 1, posts: [] }, [])[0]
  const payload = sut.campaignPayload(plan, config)
  assert.equal(payload.replyTo, 'lilinhan24@gmail.com')
  assert.deepEqual(payload.sender, { name: '硬件小小林', email: 'news@han.tax' })
  assert.deepEqual(payload.recipients, { listIds: [8] })
  assert.match(payload.htmlContent, /https:\/\/www\.han\.tax\/posts\/power\//)
  assert.match(payload.htmlContent, /\{\{ unsubscribe \}\}/)
  assert.doesNotMatch(payload.htmlContent, /<script>|<img/)
})

test('拒绝站外链接和异常清单，不能靠伪造清单发任意内容', () => {
  assert.equal(typeof sut.validateManifest, 'function')
  assert.throws(() => sut.validateManifest({ version: 1, posts: [{ ...manifest().posts[0], url: 'https://evil.test/' }] }, config.origin))
  assert.throws(() => sut.validateManifest({ version: 1, posts: [{ ...manifest().posts[0], revision: 'bad' }] }, config.origin))
  assert.throws(() => sut.createManifest([{ ...article, path: '//evil.test/x' }], config.origin, now))
})

function provider() {
  const calls = []
  return { calls, hasSubscribers: async () => true, listCampaigns: async () => [], createCampaign: async payload => { calls.push(['create', payload]); return { id: 12 } }, sendCampaign: async id => { calls.push(['send', id]) }, sendTest: async (id, email) => { calls.push(['test', id, email]) } }
}

test('默认 dry-run 不请求邮件服务，也不创建或发送邮件', async () => {
  assert.equal(typeof sut.runNotifications, 'function')
  const api = provider()
  api.listCampaigns = async () => { throw new Error('dry-run must be offline') }
  const result = await sut.runNotifications({ manifest: manifest(), baseline: { version: 1, posts: [] }, config, api })
  assert.equal(result.mode, 'dry-run')
  assert.deepEqual(api.calls, [])
})

test('群发开关未打开时拒绝发送', async () => {
  assert.equal(typeof sut.runNotifications, 'function')
  const api = provider()
  await assert.rejects(sut.runNotifications({ manifest: manifest(), baseline: { version: 1, posts: [] }, config, api, mode: 'send', enabled: false }), /未启用/)
  assert.deepEqual(api.calls, [])
})

test('只使用专用已确认订阅名单，不导入或复活已退订联系人', async () => {
  assert.equal(typeof sut.runNotifications, 'function')
  const api = provider()
  await sut.runNotifications({ manifest: manifest(), baseline: { version: 1, posts: [] }, config, api, mode: 'send', enabled: true })
  assert.deepEqual(api.calls.map(c => c[0]), ['create', 'send'])
  assert.deepEqual(api.calls[0][1].recipients, { listIds: [8] })
  assert.equal(api.calls[1][1], 12)
})

test('缺少订阅名单时拒绝发送，不能退回账户全体联系人', async () => {
  assert.equal(typeof sut.runNotifications, 'function')
  const api = provider()
  await assert.rejects(sut.runNotifications({ manifest: manifest(), baseline: { version: 1, posts: [] }, config: { ...config, listId: null }, api, mode: 'send', enabled: true }), /名单/)
  assert.deepEqual(api.calls, [])
})

test('名单为空或全员退订时不创建邮件草稿，不消耗发送额度', async () => {
  const api = provider()
  api.hasSubscribers = async id => { assert.equal(id, 8); return false }
  const result = await sut.runNotifications({ manifest: manifest(), baseline: { version: 1, posts: [] }, config, api, mode: 'send', enabled: true })
  assert.deepEqual(api.calls, [])
  assert.equal(result.skipped, 'no-subscribers')
})

test('发送结果不明确时不自动重试，留下草稿编号供检查', async () => {
  assert.equal(typeof sut.runNotifications, 'function')
  const api = provider()
  api.sendCampaign = async id => { api.calls.push(['send', id]); throw new Error('timeout') }
  await assert.rejects(sut.runNotifications({ manifest: manifest(), baseline: { version: 1, posts: [] }, config, api, mode: 'send', enabled: true }), /12.*检查/)
  assert.equal(api.calls.filter(c => c[0] === 'send').length, 1)
})

test('历史记录读取失败时关闭发送，不把故障当作空历史', async () => {
  assert.equal(typeof sut.runNotifications, 'function')
  const api = provider()
  api.listCampaigns = async () => { throw new Error('503') }
  await assert.rejects(sut.runNotifications({ manifest: manifest(), baseline: { version: 1, posts: [] }, config, api, mode: 'send', enabled: true }), /503/)
  assert.deepEqual(api.calls, [])
})

test('测试只发到指定邮箱，使用独立名称，不调用正式群发接口', async () => {
  assert.equal(typeof sut.runNotifications, 'function')
  const api = provider()
  await sut.runNotifications({ manifest: manifest(), baseline: manifest(), config, api, mode: 'test', testEmail: 'lilinhan24@gmail.com' })
  assert.deepEqual(api.calls.map(c => c[0]), ['create', 'test'])
  assert.equal(api.calls[1][2], 'lilinhan24@gmail.com')
  assert.match(api.calls[0][1].name, /^han-test-/)
  assert.equal(api.calls[0][1].tag, undefined)
  assert.equal(api.calls[0][1].recipients, undefined)
})

test('未知运行模式或非指定测试邮箱不能触发发送', async () => {
  assert.equal(typeof sut.runNotifications, 'function')
  const api = provider()
  for (const options of [{ mode: 'typo' }, { mode: 'test', testEmail: 'someone@example.com' }]) {
    await assert.rejects(sut.runNotifications({ manifest: manifest(), baseline: manifest(), config, api, ...options }))
  }
  assert.deepEqual(api.calls, [])
})

test('一次出现超过五篇变更时暂停发送', async () => {
  const api = provider()
  const current = manifest(Array.from({ length: 6 }, (_, i) => ({ ...article, path: `posts/p${i}/` })))
  await assert.rejects(sut.runNotifications({ manifest: current, baseline: manifest(), config, api, mode: 'send', enabled: true }), /超过 5 篇/)
  assert.deepEqual(api.calls, [])
})

test('测试草稿编号异常时停止，不向不明邮件任务发测试请求', async () => {
  const api = provider()
  api.createCampaign = async () => ({ id: undefined })
  await assert.rejects(sut.runNotifications({ manifest: manifest(), baseline: manifest(), config, api, mode: 'test', testEmail: 'lilinhan24@gmail.com' }), /草稿/)
  assert.deepEqual(api.calls, [])
})

test('Brevo 请求禁止重定向，不把 API 密钥带到其他域名', async () => {
  const api = sut.createBrevoClient('test-secret', async (url, options) => {
    assert.equal(url, 'https://api.brevo.com/v3/emailCampaigns/12/sendNow')
    assert.equal(options.redirect, 'error')
    assert.equal(options.headers['api-key'], 'test-secret')
    return new Response(null, { status: 204 })
  })
  await api.sendCampaign(12)
})

test('无需付费标签，按严格名称格式读取本站历史并排除测试活动', async () => {
  const requests = []
  const api = sut.createBrevoClient('test-secret', async url => {
    requests.push(url)
    const offset = Number(new URL(url).searchParams.get('offset'))
    return new Response(JSON.stringify(offset === 0
      ? { count: 101, campaigns: Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `unrelated-${i}`, status: 'sent', tag: 'han-blog-test' })) }
      : { count: 101, campaigns: [{ id: 101, name: 'han-v1-' + 'a'.repeat(24) + '-' + 'b'.repeat(64), status: 'sent' }] }))
  })
  assert.deepEqual((await api.listCampaigns()).map(c => c.id), [101])
  assert.equal(new URL(requests[1]).searchParams.get('offset'), '100')
  assert.equal(requests.length, 2)
})

test('免费账户创建通知不使用被服务商禁止的 campaign tag', () => {
  const post = sut.planNotifications(manifest(), { version: 1, posts: [] }, [])[0]
  assert.equal(sut.campaignPayload(post, config).tag, undefined)
})

test('服务商失败不重试，也不把响应正文中的敏感内容带到日志', async () => {
  let count = 0
  const api = sut.createBrevoClient('test-secret', async () => { count++; return new Response('test-secret provider details', { status: 429 }) })
  await assert.rejects(api.sendCampaign(12), error => /HTTP 429/.test(error.message) && !/test-secret/.test(error.message))
  assert.equal(count, 1)
})

test('从专用名单分页识别未退订联系人，未知状态不能视为允许发送', async () => {
  const api = sut.createBrevoClient('test-secret', async url => {
    assert.match(url, /^https:\/\/api\.brevo\.com\/v3\/contacts\/lists\/8\/contacts\?/)
    const offset = Number(new URL(url).searchParams.get('offset'))
    return new Response(JSON.stringify(offset === 0
      ? { count: 101, contacts: Array.from({ length: 100 }, () => ({ emailBlacklisted: true })) }
      : { count: 101, contacts: [{ emailBlacklisted: false }] }))
  })
  assert.equal(await api.hasSubscribers(8), true)
  for (const contacts of [[], [{ emailBlacklisted: true }], [{}]]) {
    const none = sut.createBrevoClient('test-secret', async () => new Response(JSON.stringify({ count: contacts.length, contacts })))
    assert.equal(await none.hasSubscribers(8), false)
  }
})
