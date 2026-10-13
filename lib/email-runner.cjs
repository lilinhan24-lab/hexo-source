'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { validateManifest, runNotifications, createBrevoClient, campaignPayload } = require('./email-notifications.cjs')

async function execute({ root = process.cwd(), args = [], env = process.env, fetchImpl = fetch } = {}) {
  const mode = args[0] || 'dry-run'
  if (args.length > 1 || !['dry-run', 'test', 'send'].includes(mode)) throw new Error('模式只支持 dry-run、test、send')
  const config = JSON.parse(await fs.readFile(path.join(root, 'email/config.json'), 'utf8'))
  if (config.origin !== 'https://www.han.tax') throw new Error('通知只能读取正式网站')
  const enabled = config.enabled === true && env.HAN_EMAIL_SEND_ENABLED === 'true'
  if (mode === 'send' && !enabled) throw new Error('正式通知未启用：工程配置和运行环境开关必须同时开启')
  let baseline
  try { baseline = JSON.parse(await fs.readFile(path.join(root, 'email/baseline.json'), 'utf8')) }
  catch { throw new Error('缺少或无法读取通知基线，请先按 email/README.md 初始化；不会自动补发历史文章') }
  validateManifest(baseline, config.origin)
  let manifest
  if (mode === 'dry-run') {
    manifest = JSON.parse(await fs.readFile(path.join(root, 'public/email-notifications.json'), 'utf8'))
  } else {
    if (!env.BREVO_API_KEY) throw new Error('未配置 BREVO_API_KEY')
    const response = await fetchImpl(`${config.origin}/email-notifications.json`, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error(`线上文章清单返回 HTTP ${response.status}，停止发送`)
    manifest = await response.json()
  }
  validateManifest(manifest, config.origin)
  const api = mode === 'dry-run' ? undefined : createBrevoClient(env.BREVO_API_KEY, fetchImpl)
  return runNotifications({ manifest, baseline, config, api, mode, enabled, testEmail: 'lilinhan24@gmail.com' })
}

async function writePreviews(root = process.cwd()) {
  const config = JSON.parse(await fs.readFile(path.join(root, 'email/config.json'), 'utf8'))
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'public/email-notifications.json'), 'utf8'))
  validateManifest(manifest, config.origin)
  if (!manifest.posts.length) throw new Error('没有可预览的文章')
  const directory = path.join(root, 'artifacts/email-preview')
  await fs.mkdir(directory, { recursive: true })
  const files = []
  for (const kind of ['new', 'updated']) {
    const { htmlContent } = campaignPayload({ ...manifest.posts[0], kind, name: 'local-preview' }, config)
    const html = htmlContent
      .replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>文章通知邮件预览</title>')
      .replace('<main ', '<p style="text-align:center;color:#526575;font:14px Arial,sans-serif">邮件样式预览 · 未发送</p><main ')
      .replace('<a href="{{ unsubscribe }}" style="color:#526575">取消订阅</a>', '<span>取消订阅（仅正式邮件提供退订链接）</span>')
    const file = path.join(directory, `${kind}.html`)
    await fs.writeFile(file, html)
    files.push(file)
  }
  return files
}

module.exports = { execute, writePreviews }
