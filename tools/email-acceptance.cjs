'use strict'
const { createHash } = require('node:crypto')
const { acceptance } = require('../lib/email-acceptance.cjs')
const { validateManifest } = require('../lib/email-notifications.cjs')
const config = require('../email/config.json')
async function main() {
  if (config.paused === true) throw new Error('博客邮件已暂停')
  const email = process.env.HAN_ACCEPTANCE_EMAIL || ''
  if (createHash('sha256').update(email).digest('hex') !== 'd695b85f6a91fb3c8ea2cddc10f3c1ed869d079e30d15dff92881ef7e16a549a') throw new Error('不是用户指定的验收邮箱')
  if (!process.env.BREVO_API_KEY) throw new Error('缺少发信密钥')
  const request = async (route, method = 'GET', body) => {
    const response = await fetch(`https://api.brevo.com/v3${route}`, { method, redirect:'error', signal:AbortSignal.timeout(30000), headers:{'api-key':process.env.BREVO_API_KEY,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body) })
    if (!response.ok) {
      const resource = route.startsWith('/contacts/lists') ? '名单' : route.startsWith('/contacts/') ? '联系人' : '邮件活动'
      console.error(JSON.stringify({ resource, httpStatus: response.status }))
      throw new Error(`验收服务返回 HTTP ${response.status}`)
    }
    return response.status===204?undefined:response.json()
  }
  const response = await fetch('https://www.han.tax/email-notifications.json',{redirect:'error',signal:AbortSignal.timeout(15000)})
  if (!response.ok) throw new Error('正式文章清单不可读')
  const manifest = validateManifest(await response.json(), config.origin)
  if (!manifest.posts.length) throw new Error('没有验收文章')
  console.log(JSON.stringify(await acceptance({request,email,phase:process.argv[2],config,post:manifest.posts[0]})))
}
main().catch(error => {
  const known = /^(验收服务返回 HTTP \d+|验收阶段无效|联系人状态无法核实|验收邮箱尚未确认订阅|名单返回异常|名单分页异常|名单文件夹无效|隔离名单无效|不得使用正式名单验收|隔离名单不只包含已确认的验收邮箱，停止发送|历史活动无效|历史活动分页异常|活动创建结果异常|不是用户指定的验收邮箱|缺少发信密钥|正式文章清单不可读|没有验收文章)$/
  console.error(`验收停止：${error.message === '博客邮件已暂停' || known.test(error.message) ? error.message : '无法完成本次请求'}；不自动重试发送。`)
  process.exitCode=1
})
