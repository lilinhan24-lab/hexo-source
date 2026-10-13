'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { createManifest } = require(path.join(hexo.base_dir, 'lib/email-notifications.cjs'))
const { subscriptionRoutes, addSubscriptionLinks } = require(path.join(hexo.base_dir, 'lib/email-site.cjs'))
const readConfig = () => JSON.parse(fs.readFileSync(path.join(hexo.base_dir, 'email/config.json'), 'utf8'))

hexo.extend.generator.register('email-subscription', locals => {
  const config = readConfig()
  const posts = locals.posts.toArray().map(post => ({
    path: post.path, title: post.title, description: post.description,
    content: post._content, date: post.date, published: post.published,
    notify: post.notify, notify_revision: post.notify_revision
  }))
  return [
    { path: 'email-notifications.json', data: JSON.stringify(createManifest(posts, config.origin), null, 2) + '\n' },
    ...subscriptionRoutes(config)
  ]
})

hexo.extend.filter.register('after_render:html', html => addSubscriptionLinks(html, readConfig()))
