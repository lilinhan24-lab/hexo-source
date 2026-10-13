'use strict'

const path = require('node:path')
// tools/ can be a Windows junction; resolve application modules from the workspace.
const { execute } = require(path.join(process.cwd(), 'lib/email-runner.cjs'))

execute({ args: process.argv.slice(2) }).then(result => {
  console.log(JSON.stringify(result, null, 2))
}).catch(error => {
  console.error(`邮件通知停止：${error.message}`)
  process.exitCode = 1
})
