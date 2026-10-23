import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/server.js';
import {Store} from '../src/store.js';
import {config,TIME,signedData} from './helpers.js';

test('HTTP: authentication, private recipient, atomic concurrent claims, reload and static secret protection',async()=>{
  const app=createApp(config,{store:new Store(':memory:'),now:()=>TIME});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
  const headers={'x-telegram-init-data':signedData(),'content-type':'application/json'};
  try{
    assert.equal((await fetch(base+'/api/state')).status,401);
    assert.equal((await fetch(base+'/api/state',{headers:{'x-telegram-init-data':signedData(99)}})).status,403);
    const state=await (await fetch(base+'/api/state',{headers})).json();assert(state.canOpen);assert(!('plan' in state));assert.equal(state.total,0);
    const results=await Promise.all(Array.from({length:12},()=>fetch(base+'/api/claim',{method:'POST',headers,body:JSON.stringify({requestId:randomUUID(),cube:1,amount:999999})})));
    assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.status===409).length,11);
    const refreshed=await (await fetch(base+'/api/state',{headers})).json();assert.equal(refreshed.cursor,1);assert(!refreshed.canOpen);assert(refreshed.total<=5000);
    const evil=await fetch(base+'/api/claim',{method:'POST',headers:{...headers,origin:'https://attacker.example'},body:'{}'});assert.equal(evil.status,403);
    for(const path of ['/.env','/src/server.js','/data/gifts.sqlite','/package.json'])assert.equal((await fetch(base+path)).status,404);
    const html=await (await fetch(base+'/')).text();assert(!html.includes('Проверка'));assert(!html.includes(config.token));assert(!html.includes('testOverlay'));assert(html.includes('Выбирай'));
    const js=await (await fetch(base+'/app.js')).text();assert(!js.includes('makePlan'));assert(!js.includes('newGameState'));assert(!js.includes(config.token));
    const style=await fetch(base+'/style.css');assert.equal(style.status,200);assert(style.headers.get('content-security-policy').includes('https://telegram.org'));
  }finally{await app.stop();}
});
test('HTTP: retrying one request after an uncertain response yields the same gift',async()=>{
  const app=createApp(config,{store:new Store(':memory:'),now:()=>TIME});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${app.server.address().port}`,headers={'x-telegram-init-data':signedData(),'content-type':'application/json'},body=JSON.stringify({requestId:randomUUID(),cube:2});
  try{const replies=await Promise.all(Array.from({length:5},()=>fetch(base+'/api/claim',{method:'POST',headers,body}).then(r=>r.json())));assert(replies.every(x=>x.state.cursor===1));assert.equal(new Set(replies.map(x=>x.prize.amount)).size,1);assert.equal(app.store.db.prepare('SELECT count(*) n FROM claims').get().n,1);}finally{await app.stop();}
});
