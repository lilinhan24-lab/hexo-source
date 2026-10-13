const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const mod = fs.existsSync('lib/maintenance-alert.cjs') ? require('../lib/maintenance-alert.cjs') : {}
const repo = { owner: 'lilinhan24-lab', repo: 'hexo-source' }
const run = { id: 42, name: 'Article email notifications', head_branch: 'main', event: 'schedule', conclusion: 'failure', head_repository: { full_name: 'lilinhan24-lab/hexo-source' } }

test('只处理本站 main 的可信任务失败，不从外部运行数据拼入正文', () => {
  assert.equal(typeof mod.buildAlert, 'function')
  const alert = mod.buildAlert({ ...run, html_url: 'https://evil.test/secret', display_title: 'private-mail@example.test' }, repo)
  assert.equal(alert.title, '[运行异常] 文章邮件通知')
  assert.ok(alert.body.includes('https://github.com/lilinhan24-lab/hexo-source/actions/runs/42'))
  assert.ok(!alert.body.includes('evil.test') && !alert.body.includes('private-mail'))
  for (const change of [{conclusion:'success'}, {conclusion:'cancelled'}, {event:'pull_request'}, {head_branch:'other'}, {head_repository:{full_name:'stranger/fork'}}, {name:'untrusted'}, {id:'42/inject'}]) {
    assert.equal(mod.buildAlert({...run,...change}, repo), null)
  }
})
test('首次失败创建提醒；重复执行不重复写入，同类新失败更新原提醒', async () => {
  assert.equal(typeof mod.reportFailure, 'function')
  const writes = []; let existing = []
  const github = { paginate: async () => existing, rest: { issues: {
    listForRepo() {}, create: async payload => { writes.push(['create',payload]); return {data:{number:7}} },
    update: async payload => { writes.push(['update',payload]); return {data:{number:7}} }
  } } }
  assert.deepEqual(await mod.reportFailure(github, run, repo), { action:'created', issue:7 })
  const payload = writes[0][1]
  assert.equal(payload.owner, 'lilinhan24-lab'); assert.equal(payload.repo, 'hexo-source')
  existing = [{number:7,title:payload.title,body:payload.body,user:{login:'github-actions[bot]'}}]
  assert.deepEqual(await mod.reportFailure(github, run, repo), {action:'unchanged',issue:7})
  assert.equal(writes.length,1)
  assert.deepEqual(await mod.reportFailure(github, {...run,id:43}, repo), {action:'updated',issue:7})
  assert.equal(writes[1][1].issue_number,7)
  assert.ok(writes[1][1].body.includes('/runs/43'))
})
test('不覆盖人工同名问题，也不因正常运行联系 GitHub', async () => {
  assert.equal(typeof mod.reportFailure, 'function')
  let created = false
  const github = {paginate:async()=>[{number:9,title:'[运行异常] 文章邮件通知',body:'人工记录',user:{login:'owner'}}],rest:{issues:{listForRepo(){},create:async()=>{created=true;return{data:{number:10}}}}}}
  await mod.reportFailure(github,run,repo); assert.equal(created,true)
  assert.deepEqual(await mod.reportFailure({}, {...run,conclusion:'success'},repo),{action:'ignored'})
})
