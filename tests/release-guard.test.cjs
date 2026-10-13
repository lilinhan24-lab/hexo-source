const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const file = path.resolve('lib/release-guard.cjs')
const guard = fs.existsSync(file) ? require(file) : {}
const good = '<title>小小林的个人博客 - 开关电源设计、调试与实测</title><a href="/subscribe/">邮件订阅</a>'
test('暂停发布要求状态标记，且禁止残留订阅表单和外部表单入口', () => {
  const options = { home: good, about: '开关电源', emailPaused: true, subscribe: '<section data-han-subscription-paused>邮件订阅暂时暂停</section>' }
  assert.deepEqual(guard.validateRelease(options), [])
  for (const extra of ['<iframe></iframe>', '<form></form>', '<a href="https://example.sibforms.com/serve/x">订阅</a>']) {
    assert.ok(guard.validateRelease({ ...options, subscribe: options.subscribe + extra }).length)
  }
  assert.ok(guard.validateRelease({ ...options, subscribe: '' }).length)
})
test('发布前阻止旧定位、预览 noindex、订阅入口回退', () => {
  assert.equal(typeof guard.validateRelease, 'function')
  assert.deepEqual(guard.validateRelease({ home: good, about: '专注开关电源', subscribe: '<iframe title="邮箱订阅表单"></iframe>', pages: [good] }), [])
  for (const change of [{home:'嵌入式硬件学习与工程实践'}, {home:good.replace('href="/subscribe/"','href="/atom.xml"')}, {pages:[good+'<meta name="robots" content="noindex,nofollow">']}, {subscribe:''}]) {
    assert.ok(guard.validateRelease({home:good,about:'开关电源',subscribe:'<iframe title="邮箱订阅表单"></iframe>',pages:[good],...change}).length)
  }
})
test('构建产物中出现发信密钥或预览文件时拒绝发布', () => {
  assert.equal(typeof guard.validateRelease, 'function')
  for (const bad of ['xkeysib-'+ 'a'.repeat(64)+'-fakeSecret','<link href="/css/optimization-preview.css">']) {
    const problems = guard.validateRelease({home:good,about:'开关电源',subscribe:'<iframe title="邮箱订阅表单"></iframe>',pages:[bad]})
    assert.ok(problems.length)
    assert.ok(!problems.join('').includes('fakeSecret'))
  }
})
