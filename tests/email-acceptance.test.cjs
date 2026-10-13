const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const sut = fs.existsSync('lib/email-acceptance.cjs') ? require('../lib/email-acceptance.cjs') : {}
const config = {origin:'https://www.han.tax',listId:3,sender:{email:'news@han.tax'},replyTo:'owner@example.test'}
const post = {url:'https://www.han.tax/posts/power/',title:'电源',description:'说明',published:'2026-09-01',revision:'a'.repeat(64)}
function fixture({blacklisted=false,outsider=false,history=[]}={}) {
  const calls=[]
  const email='approved@example.test'
  const contact={email,emailBlacklisted:blacklisted,listIds:[3]}
  const request=async(route,method='GET',body)=>{
    calls.push({route,method,body})
    if(route.startsWith('/contacts/')&&!route.startsWith('/contacts/lists')) return contact
    if(route==='/contacts/lists?limit=50&offset=0') return {lists:[{id:9,name:'han-acceptance-20261014'}],count:1}
    if(route==='/contacts/lists/9/contacts?limit=50&offset=0') return {count:1,contacts:[outsider?{...contact,email:'other@example.test'}:contact]}
    if(route.startsWith('/emailCampaigns?')) return {campaigns:history,count:history.length}
    if(route==='/emailCampaigns'&&method==='POST') return {id:123}
    if(route==='/emailCampaigns/123/sendNow') return undefined
    throw new Error('Unexpected request')
  }
  return {calls,request,email}
}
test('验收邮箱已退订时不重新订阅、不创建活动也不发送',async()=>{
  assert.equal(typeof sut.acceptance,'function')
  const f=fixture({blacklisted:true})
  const result=await sut.acceptance({...f,phase:'new',config,post})
  assert.equal(result.state,'unsubscribed')
  assert.equal(f.calls.some(c=>c.method!=='GET'),false)
})
test('验收名单混入其他邮箱时停止，不向正式名单或陌生人发送',async()=>{
  assert.equal(typeof sut.acceptance,'function')
  const f=fixture({outsider:true})
  await assert.rejects(sut.acceptance({...f,phase:'new',config,post}),/名单/)
  assert.equal(f.calls.some(c=>c.route==='/emailCampaigns'&&c.method==='POST'),false)
})
test('验收活动只用隔离名单，重复执行不再次发送',async()=>{
  assert.equal(typeof sut.acceptance,'function')
  const f=fixture()
  await sut.acceptance({...f,phase:'updated',config,post})
  assert.deepEqual(f.calls.find(c=>c.route==='/emailCampaigns'&&c.method==='POST').body.recipients,{listIds:[9]})
  assert.equal(f.calls.filter(c=>c.route.endsWith('/sendNow')).length,1)
  const repeated=fixture({history:[{id:123,name:'han-acceptance-20261014-updated',status:'sent'}]})
  assert.equal((await sut.acceptance({...repeated,phase:'updated',config,post})).state,'already-created')
  assert.equal(repeated.calls.some(c=>c.route.endsWith('/sendNow')),false)
})
