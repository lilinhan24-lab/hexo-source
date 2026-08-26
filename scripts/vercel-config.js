const fs = require('node:fs')
const path = require('node:path')

hexo.extend.generator.register('vercel-config', () => ({
  path: 'vercel.json',
  data: fs.readFileSync(path.join(hexo.base_dir, 'vercel.json'))
}))
