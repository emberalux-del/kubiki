import test from 'node:test';
import assert from 'node:assert/strict';
import {makePlan,validPlan,clockParts} from '../src/game.js';
import {validateInitData} from '../src/auth.js';
import {loadConfig} from '../src/config.js';
import {signedData,TOKEN,TIME} from './helpers.js';

test('150 random plans always contain exactly 20,000, 14 cash gifts and one zero',()=>{
  const variants=new Set();
  for(let i=0;i<150;i++){const p=makePlan();assert(validPlan(p));assert.equal(p.length,15);assert.equal(p.filter(x=>x===0).length,1);assert.equal(p.reduce((a,b)=>a+b),20000);variants.add(p.join(','));}
  assert(variants.size>100);
});
test('server calendar changes at Moscow midnight, independent of browser clock',()=>{
  assert.equal(clockParts(new Date('2026-10-22T20:59:59Z')).day,'2026-10-22');
  assert.equal(clockParts(new Date('2026-10-22T21:00:00Z')).day,'2026-10-23');
});
test('signed Telegram data is accepted; tampering, stale, future and duplicate keys rejected',()=>{
  const options={now:TIME.getTime()};const raw=signedData();
  assert.equal(validateInitData(raw,TOKEN,options).id,42);
  assert.throws(()=>validateInitData(raw.replace('test-query','other'),TOKEN,options));
  assert.throws(()=>validateInitData(raw+'&user=x',TOKEN,options));
  assert.throws(()=>validateInitData(signedData(42,new Date(TIME.getTime()-3601000)),TOKEN,options));
  assert.throws(()=>validateInitData(signedData(42,new Date(TIME.getTime()+31000)),TOKEN,options));
  assert.throws(()=>validateInitData(raw,'wrong-token',options));
  assert.throws(()=>validateInitData('',TOKEN,options));
  assert.equal(validateInitData(signedData(42,TIME,{signature:'telegram-public-signature'}),TOKEN,options).id,42);
});
test('production forbids demo mode and invalid configuration',()=>{
  assert.throws(()=>loadConfig({NODE_ENV:'production',DEMO_MODE:'true'}));
  assert.throws(()=>loadConfig({BOT_TOKEN:'invalid'}));
  assert.throws(()=>loadConfig({BOT_TOKEN:TOKEN,APP_URL:'http://example.test'}));
  assert.throws(()=>loadConfig({BOT_TOKEN:TOKEN,APP_URL:'https://example.test',REMINDER_HOUR:'25'}));
});
