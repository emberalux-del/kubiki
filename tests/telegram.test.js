import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../src/store.js';
import {processUpdate,scheduleReminder,flushOutbox,TelegramError,Telegram} from '../src/telegram.js';
import {config,TIME} from './helpers.js';

const update=(id,text,user=42)=>({update_id:id,message:{from:{id:user},chat:{id:user,type:'private'},text}});
test('bot /start subscribes only recipient; processed updates are not repeated; /stop disables',()=>{
  const s=new Store(':memory:');try{
    processUpdate(s,update(1,'/start',99),config,TIME);assert.equal(s.db.prepare('SELECT count(*) n FROM subscribers').get().n,0);
    processUpdate(s,update(2,'/start'),config,TIME);processUpdate(s,update(2,'/start'),config,TIME);
    assert.equal(s.db.prepare('SELECT count(*) n FROM subscribers').get().n,1);assert.equal(s.getMeta('telegram_offset'),'3');assert.equal(s.db.prepare("SELECT count(*) n FROM outbox WHERE event_key='update:2'").get().n,1);
    processUpdate(s,update(3,'/stop'),config,TIME);assert.equal(s.db.prepare('SELECT enabled FROM subscribers').get().enabled,0);
  }finally{s.close();}
});
test('one reminder per day, overdue reminders suppressed after gift claimed',async()=>{
  const s=new Store(':memory:');try{s.subscribe(42,42);scheduleReminder(s,config,TIME);scheduleReminder(s,config,TIME);assert.equal(s.db.prepare('SELECT count(*) n FROM outbox').get().n,1);
    s.claim(42,'2026-10-22',randomUUID(),0,TIME);let sent=0;await flushOutbox(s,{call:async()=>{sent++;}},config,TIME);assert.equal(sent,1);assert.equal(s.db.prepare("SELECT dead FROM outbox WHERE kind='reminder'").get().dead,1);
  }finally{s.close();}
});
test('notification retry is durable and respects Telegram retry_after',async()=>{
  const s=new Store(':memory:');try{s.enqueue('one',42,{text:'Test'});await flushOutbox(s,{call:async()=>{throw new TelegramError(429,60);}},config,TIME);const row=s.db.prepare('SELECT * FROM outbox').get();assert.equal(row.attempts,1);assert.equal(row.next_at,TIME.getTime()+60000);let sent=0;const fake={call:async()=>{sent++;}};await flushOutbox(s,fake,config,new Date(TIME.getTime()+59000));assert.equal(sent,0);await flushOutbox(s,fake,config,new Date(TIME.getTime()+61000));assert.equal(sent,1);await flushOutbox(s,fake,config,new Date(TIME.getTime()+62000));assert.equal(sent,1);}finally{s.close();}
});
test('blocked bot disables further notifications; /id works before recipient configured',async()=>{
  const s=new Store(':memory:');try{processUpdate(s,update(1,'/id'),{...config,recipient:''},TIME);assert(JSON.parse(s.db.prepare('SELECT body FROM outbox').get().body).text.includes('42'));s.subscribe(42,42);scheduleReminder(s,config,TIME);await flushOutbox(s,{call:async()=>{throw new TelegramError(403);}},config,TIME);assert.equal(s.db.prepare('SELECT enabled FROM subscribers').get().enabled,0);}finally{s.close();}
});
test('network failures never expose token through thrown error',async()=>{
  const tg=new Telegram('SECRET_TOKEN',async()=>{throw new Error('https://api.telegram.org/botSECRET_TOKEN/sendMessage');});
  await assert.rejects(()=>tg.call('sendMessage'),e=>e.message==='Telegram API error 503'&&!e.message.includes('SECRET_TOKEN'));
});
