'use strict'
const names = new Map([
  ['Build and validate', '网站构建'],
  ['Article email notifications', '文章邮件通知'],
  ['Backup and restore verification', '网站备份']
])
const marker = '<!-- han-maintenance-alert-v1 -->'

function buildAlert(run, repo) {
  if (!run || !names.has(run.name) || run.head_branch !== 'main' ||
      !['failure', 'timed_out', 'action_required'].includes(run.conclusion) ||
      !['push', 'schedule', 'workflow_dispatch'].includes(run.event) ||
      run.head_repository?.full_name !== `${repo.owner}/${repo.repo}` ||
      !Number.isSafeInteger(run.id) || run.id < 1) return null
  return {
    title: `[运行异常] ${names.get(run.name)}`,
    body: `${marker}\n\n${names.get(run.name)}未成功完成，需要检查。\n\n[查看运行记录](https://github.com/${repo.owner}/${repo.repo}/actions/runs/${run.id})\n\n此提醒不包含日志正文、邮箱或密钥。修复并验证成功后可关闭此问题。`
  }
}

async function reportFailure(github, run, repo) {
  const alert = buildAlert(run, repo)
  if (!alert) return { action: 'ignored' }
  const issues = await github.paginate(github.rest.issues.listForRepo, { ...repo, state: 'open', per_page: 100 })
  const existing = issues.find(issue => !issue.pull_request && issue.title === alert.title &&
    issue.user?.login === 'github-actions[bot]' && issue.body?.includes(marker))
  if (existing?.body === alert.body) return { action: 'unchanged', issue: existing.number }
  if (existing) {
    await github.rest.issues.update({ ...repo, issue_number: existing.number, body: alert.body })
    return { action: 'updated', issue: existing.number }
  }
  const created = await github.rest.issues.create({ ...repo, ...alert })
  return { action: 'created', issue: created.data.number }
}
module.exports = { buildAlert, reportFailure }
