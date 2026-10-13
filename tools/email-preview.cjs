'use strict'
const path = require('node:path')
const { writePreviews } = require(path.join(process.cwd(), 'lib/email-runner.cjs'))
writePreviews().then(files => console.log(files.join('\n'))).catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
