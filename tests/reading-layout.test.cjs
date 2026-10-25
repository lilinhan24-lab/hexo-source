const test = require('node:test')
const assert = require('node:assert/strict')
const { enhanceReadingLayout } = require('../lib/reading-layout.cjs')

test('首页固定专业定位、精选项目和真实测试边界，不重复插入', () => {
  const source = '<body><header class="full_page"><h1 id="site-title">小小林的个人博客</h1></header><div id="recent-posts" class="recent-posts"></div></body>'
  const html = enhanceReadingLayout(source)
  assert.match(html, /硬件小小林 · 电源设计与实测/)
  assert.match(html, /id="han-featured-project"/)
  assert.match(html, /两路分别约 0.8 A/)
  assert.equal(enhanceReadingLayout(html), html)
})
test('菜单在构建期变为原生按钮，保留主题事件绑定 ID，文章标题不变', () => {
  const source = '<header class="post-bg"><h1 id="site-title">文章</h1><div id="toggle-menu"><span><i></i></span></div></header>'
  const html = enhanceReadingLayout(source)
  assert.match(html, /<button id="toggle-menu" type="button"/)
  assert.match(html, /aria-controls="sidebar-menus" aria-expanded="false"/)
  assert.match(html, /<h1 id="site-title">文章<\/h1>/)
  assert.doesNotMatch(html, /han-featured-project/)
})
