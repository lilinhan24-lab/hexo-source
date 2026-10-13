'use strict'

const { createHash } = require('node:crypto')
const hash = value => createHash('sha256').update(value).digest('hex')
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const normalize = value => String(value ?? '').replace(/\r\n?/g, '\n').trim()
const CAMPAIGN_NAME = /^han-v1-[a-f0-9]{24}-[a-f0-9]{64}$/

function createManifest(posts, origin, now = new Date()) {
  const result = { version: 1, posts: [] }
  for (const post of posts) {
    const date = new Date(Number.isFinite(Number(post.date)) ? Number(post.date) : post.date)
    if (post.published === false || post.notify === false || date > now) continue
    if (!Number.isFinite(date.getTime())) throw new Error('文章发布日期无效')
    if (!/^\/?posts\/[^?#\\]+\/$/.test(post.path)) throw new Error('文章路径必须在 posts/ 下')
    const url = new URL(post.path, `${origin}/`).href
    const title = normalize(post.title)
    const description = normalize(post.description)
    result.posts.push({ url, title, description, published: date.toISOString(), revision: hash(JSON.stringify([url, title, description, normalize(post.content), normalize(post.notify_revision)])) })
  }
  validateManifest(result, origin)
  return result
}

function validateManifest(manifest, origin) {
  if (manifest?.version !== 1 || !Array.isArray(manifest.posts) || manifest.posts.length > 10000) throw new Error('文章清单格式无效')
  const seen = new Set()
  for (const post of manifest.posts) {
    const url = new URL(post.url)
    if (url.origin !== origin || !url.pathname.startsWith('/posts/') || url.username || url.password || url.search || url.hash) throw new Error('文章链接必须属于本站')
    if (typeof post.title !== 'string' || !post.title || post.title.length > 500 || /[\r\n]/.test(post.title)) throw new Error('文章标题无效')
    if (typeof post.description !== 'string' || post.description.length > 5000 || !/^[a-f0-9]{64}$/.test(post.revision)) throw new Error('文章版本无效')
    if (!Number.isFinite(Date.parse(post.published)) || seen.has(post.url)) throw new Error('文章日期或重复链接无效')
    seen.add(post.url)
  }
  return manifest
}

function campaignPrefix(post) { return `han-v1-${hash(post.url).slice(0, 24)}-` }
function campaignName(post) { return campaignPrefix(post) + post.revision }

function planNotifications(current, baseline, campaigns) {
  const initial = new Map(baseline.posts.map(post => [post.url, post.revision]))
  const existing = new Map(campaigns.map(campaign => [campaign.name, campaign]))
  const plan = []
  for (const post of current.posts) {
    if (initial.get(post.url) === post.revision) continue
    const name = campaignName(post)
    const prior = existing.get(name)
    if (prior?.status === 'sent' || prior?.status === 'queued') continue
    const kind = initial.has(post.url) || campaigns.some(c => c.name?.startsWith(campaignPrefix(post))) ? 'updated' : 'new'
    plan.push({ ...post, name, kind, blocked: Boolean(prior), campaignId: prior?.id })
  }
  return plan
}

function campaignPayload(post, config) {
  const action = post.kind === 'updated' ? '文章更新' : '新文章'
  return {
    name: post.name, type: 'classic',
    sender: config.sender, replyTo: config.replyTo,
    recipients: { listIds: [config.listId] },
    subject: `${action}｜${post.title}`, previewText: post.description.slice(0, 150),
    htmlContent: `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body style="margin:0;background:#f5f7fa;color:#23313d;font-family:Arial,'Microsoft YaHei',sans-serif"><main style="max-width:600px;margin:24px auto;padding:28px;background:#fff"><p style="color:#526575">硬件小小林 · ${action}</p><h1 style="font-size:24px;line-height:1.5">${escapeHtml(post.title)}</h1><p style="line-height:1.8">${escapeHtml(post.description)}</p><p style="margin:28px 0"><a style="background:#0878b5;color:#fff;padding:12px 22px;text-decoration:none;border-radius:4px" href="${escapeHtml(post.url)}">阅读文章</a></p><p style="font-size:14px;line-height:1.8">有问题或建议，可以直接回复这封邮件。</p><hr style="border:0;border-top:1px solid #e2e8ee"><p style="font-size:12px;color:#526575;line-height:1.8">你收到这封邮件，是因为确认订阅了硬件小小林的博客更新。<br><a href="{{ unsubscribe }}" style="color:#526575">取消订阅</a></p></main></body></html>`
  }
}

async function runNotifications({ manifest, baseline, config, api, mode = 'dry-run', enabled = false, testEmail }) {
  validateManifest(manifest, config.origin)
  validateManifest(baseline, config.origin)
  if (!['dry-run', 'test', 'send'].includes(mode)) throw new Error('未知通知模式')
  if (mode === 'send' && !enabled) throw new Error('正式通知未启用')
  if (mode === 'dry-run') return { mode, plan: planNotifications(manifest, baseline, []), sent: [] }
  if (mode === 'test') {
    if (testEmail !== 'lilinhan24@gmail.com') throw new Error('测试只允许发送到已指定邮箱')
    const post = manifest.posts[0]
    if (!post) throw new Error('没有可测试的文章')
    const payload = campaignPayload({ ...post, kind: 'updated', name: `han-test-${Date.now()}` }, config)
    delete payload.recipients
    const created = await api.createCampaign(payload)
    if (!Number.isInteger(created?.id) || created.id < 1) throw new Error('邮件草稿返回异常，停止测试')
    await api.sendTest(created.id, testEmail)
    return { mode, campaignId: created.id, sent: [testEmail] }
  }
  if (!Number.isInteger(config.listId) || config.listId < 1) throw new Error('未配置专用已确认订阅名单')
  const campaigns = await api.listCampaigns()
  const plan = planNotifications(manifest, baseline, campaigns)
  const blocked = plan.filter(post => post.blocked)
  if (blocked.length) throw new Error(`已有未完成通知 ${blocked.map(p => p.campaignId).join(',')}，请在 Brevo 检查后处理；不会自动重发`)
  if (plan.length > 5) throw new Error('一次出现超过 5 篇变更，暂停发送并等待检查')
  if (plan.length && !await api.hasSubscribers(config.listId)) return { mode, sent: [], skipped: 'no-subscribers' }
  const sent = []
  for (const post of plan) {
    const created = await api.createCampaign(campaignPayload(post, config))
    if (!Number.isInteger(created?.id) || created.id < 1) throw new Error('邮件草稿返回异常，暂停发送')
    // Do not retry ambiguous POSTs: the provider may have accepted the first one.
    try { await api.sendCampaign(created.id) }
    catch { throw new Error(`通知 ${created.id} 发送结果不明确，请在 Brevo 检查；不会自动重试`) }
    sent.push({ url: post.url, campaignId: created.id })
  }
  return { mode, sent }
}

function createBrevoClient(apiKey, fetchImpl = fetch) {
  if (!apiKey) throw new Error('未配置 BREVO_API_KEY')
  async function request(route, method = 'GET', body) {
    const response = await fetchImpl(`https://api.brevo.com/v3${route}`, {
      method, redirect: 'error', headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000)
    })
    if (!response.ok) throw new Error(`Brevo ${method} ${route.split('?')[0]} 返回 HTTP ${response.status}`)
    return response.status === 204 ? undefined : response.json()
  }
  return {
    async hasSubscribers(listId) {
      if (!Number.isInteger(listId) || listId < 1) throw new Error('订阅名单无效')
      for (let offset = 0; offset < 100000; offset += 100) {
        const page = await request(`/contacts/lists/${listId}/contacts?limit=100&offset=${offset}`)
        if (!Array.isArray(page.contacts) || !Number.isInteger(page.count)) throw new Error('订阅名单格式异常')
        if (page.contacts.some(contact => contact.emailBlacklisted === false)) return true
        if (offset + page.contacts.length >= page.count) return false
        if (!page.contacts.length) throw new Error('订阅名单分页异常')
      }
      throw new Error('订阅名单超过安全读取上限')
    },
    async listCampaigns() {
      const all = []
      for (let offset = 0; offset < 100000; offset += 100) {
        const page = await request(`/emailCampaigns?limit=100&offset=${offset}&excludeHtmlContent=true`)
        if (!Array.isArray(page.campaigns) || !Number.isInteger(page.count)) throw new Error('邮件历史格式异常')
        all.push(...page.campaigns.filter(c => CAMPAIGN_NAME.test(c.name)))
        if (offset + page.campaigns.length >= page.count) return all
        if (!page.campaigns.length) throw new Error('邮件历史分页异常')
      }
      throw new Error('邮件历史超过安全读取上限')
    },
    createCampaign: payload => request('/emailCampaigns', 'POST', payload),
    sendCampaign: id => request(`/emailCampaigns/${id}/sendNow`, 'POST'),
    sendTest: (id, email) => request(`/emailCampaigns/${id}/sendTest`, 'POST', { emailTo: [email] })
  }
}

module.exports = { createManifest, validateManifest, planNotifications, campaignPayload, runNotifications, createBrevoClient }
