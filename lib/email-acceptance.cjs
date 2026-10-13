'use strict'
const { campaignPayload } = require('./email-notifications.cjs')
const listName = 'han-acceptance-20261014'
async function acceptance({ request, email, phase, config, post }) {
  if (!['new', 'updated', 'status'].includes(phase)) throw new Error('验收阶段无效')
  const contact = await request(`/contacts/${encodeURIComponent(email)}`)
  if (contact.email?.toLowerCase() !== email.toLowerCase() || typeof contact.emailBlacklisted !== 'boolean') throw new Error('联系人状态无法核实')
  if (contact.emailBlacklisted) return { state: 'unsubscribed', writes: 0 }
  if (!contact.listIds?.includes(config.listId)) throw new Error('验收邮箱尚未确认订阅')
  if (phase === 'status') return { state: 'subscribed' }
  const lists = []
  for (let offset = 0; offset < 5000; offset += 50) {
    const page = await request(`/contacts/lists?limit=50&offset=${offset}`)
    if (!Array.isArray(page.lists) || !Number.isInteger(page.count)) throw new Error('名单返回异常')
    lists.push(...page.lists)
    if (offset + page.lists.length >= page.count) break
    if (!page.lists.length || offset === 4950) throw new Error('名单分页异常')
  }
  let list = lists.find(x => x.name === listName)
  if (!list) {
    const productionList = await request(`/contacts/lists/${config.listId}`)
    if (!Number.isInteger(productionList.folderId)) throw new Error('名单文件夹无效')
    list = await request('/contacts/lists', 'POST', { name: listName, folderId: productionList.folderId })
    if (!Number.isInteger(list.id) || list.id === config.listId) throw new Error('隔离名单无效')
    // Add an already-confirmed contact only. Never clear its unsubscribe flag.
    await request(`/contacts/lists/${list.id}/contacts/add`, 'POST', { emails: [email] })
  }
  if (!Number.isInteger(list.id) || list.id === config.listId) throw new Error('不得使用正式名单验收')
  const members = await request(`/contacts/lists/${list.id}/contacts?limit=50&offset=0`)
  if (members.count !== 1 || members.contacts?.length !== 1 || members.contacts[0].email?.toLowerCase() !== email.toLowerCase() || members.contacts[0].emailBlacklisted !== false) throw new Error('隔离名单不只包含已确认的验收邮箱，停止发送')
  const name = `${listName}-${phase}`
  for (let offset = 0; offset < 5000; offset += 100) {
    const page = await request(`/emailCampaigns?limit=100&offset=${offset}&excludeHtmlContent=true`)
    if (!Array.isArray(page.campaigns) || !Number.isInteger(page.count)) throw new Error('历史活动无效')
    const prior = page.campaigns.find(c => c.name === name)
    if (prior) return { state: 'already-created', campaignId: prior.id, status: prior.status }
    if (offset + page.campaigns.length >= page.count) break
    if (!page.campaigns.length || offset === 4900) throw new Error('历史活动分页异常')
  }
  const payload = campaignPayload({ ...post, name, kind: phase }, { ...config, listId: list.id })
  payload.subject = `【验收测试】${payload.subject}`
  payload.htmlContent = payload.htmlContent.replace('<main ', '<p style="text-align:center">这是站长本人邮箱的功能验收，不是网站发布了新内容。收到两封验收邮件后，可点击下方“取消订阅”测试退订。</p><main ')
  const created = await request('/emailCampaigns', 'POST', payload)
  if (!Number.isInteger(created.id) || created.id < 1) throw new Error('活动创建结果异常')
  await request(`/emailCampaigns/${created.id}/sendNow`, 'POST')
  return { state: 'send-request-accepted', campaignId: created.id, phase }
}
module.exports = { acceptance }
