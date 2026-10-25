'use strict'

const projectPath = '/posts/lm2596-ams1117-design/'
const hero = '<h1 id="site-title">硬件小小林 · 电源设计与实测</h1><p class="han-hero-description">记录从参数计算、原理图与 PCB，到调试和测试的完整过程。</p><nav class="han-hero-actions" aria-label="首页快捷入口"><a href="#han-featured-project">查看项目</a><a href="/archives/">阅读文章</a></nav>'
const featured = `<section class="han-featured-project" id="han-featured-project" aria-labelledby="han-featured-title"><a class="han-featured-image" href="${projectPath}" tabindex="-1" aria-hidden="true"><img src="/images/posts/lm2596-ams1117-design/assembled-board.jpg" width="1572" height="1056" alt="焊接完成的 LM2596 与 AMS1117 双路电源板" decoding="async" loading="lazy"></a><div class="han-featured-copy"><h2 id="han-featured-title"><a href="${projectPath}">从电路计算到实板测试：一块双路电源板</a></h2><p>LM2596 降压至约 5 V，再由 AMS1117 得到约 3.3 V。记录参数计算、原理图、PCB、焊接与测试过程。</p><p class="han-project-evidence">已完成空载与分别带载测试：约 12 V 输入、两路分别约 0.8 A 时，负载端读数为 4.916 V 和 3.253 V。</p><a class="han-project-link" href="${projectPath}">查看设计与实测记录 <i class="fas fa-arrow-right" aria-hidden="true"></i></a></div></section>`

function enhanceReadingLayout(html) {
  // Transform before scripts bind events; never replace the live menu node.
  html = html.replace(/<div id="toggle-menu">([\s\S]*?)<\/div>/, '<button id="toggle-menu" type="button" aria-label="打开主导航" aria-controls="sidebar-menus" aria-expanded="false">$1</button>')
  if (/<header[^>]*class="[^"]*\bfull_page\b/.test(html) && !html.includes('id="han-featured-project"')) {
    html = html.replace(/<h1 id="site-title">[\s\S]*?<\/h1>/, hero)
    html = html.replace(/(<div[^>]*id="recent-posts"[^>]*>)/, `$1${featured}`)
    html = html.replace('<body', '<body data-han-home')
  }
  return html
}
module.exports = { enhanceReadingLayout }
