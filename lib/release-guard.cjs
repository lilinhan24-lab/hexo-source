'use strict'

function validateRelease({ home = '', about = '', subscribe = '', pages = [] }) {
  const problems = []
  if (!home.includes('开关电源') || !about.includes('开关电源')) problems.push('网站定位缺少已确认的开关电源内容')
  if (!/href=["'](?:https:\/\/www\.han\.tax)?\/subscribe\/["']/.test(home)) problems.push('首页缺少邮件订阅入口')
  if (!/<iframe\b/i.test(subscribe)) problems.push('邮件订阅表单缺失')
  const documents = [home, about, subscribe, ...pages]
  if (documents.some(html => /<meta\b(?=[^>]*\bname=["']robots["'])(?=[^>]*\bcontent=["'][^"']*\bnoindex\b)[^>]*>/i.test(html))) problems.push('正式产物中混入 noindex 预览标记')
  if (documents.some(html => /optimization-preview\.css/i.test(html))) problems.push('正式产物中混入预览样式')
  if (documents.some(html => /xkeysib-[a-z0-9]{32,}-[a-z0-9]+/i.test(html))) problems.push('产物中检测到疑似发信密钥，请勿发布')
  return problems
}

module.exports = { validateRelease }
