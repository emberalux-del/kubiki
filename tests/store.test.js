import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.js';
import {DatabaseSync,backup} from 'node:sqlite';

test('15 openings total exactly 20,000; duplicate, backward date and cycle reset rejected',()=>{
  const store=new Store(':memory:');let result;
  try {
    for(let i=0;i<15;i++){
      const now=new Date(Date.UTC(2026,9,1+i,12)),day=now.toISOString().slice(0,10),key=randomUUID();
      result=store.claim(42,day,key,i%3,now);
      const replay=store.claim(42,day,key,2,now);
      assert.equal(replay.prize.amount,result.prize.amount);assert(replay.replayed);assert.equal(replay.state.cursor,i+1);
      assert.throws(()=>store.claim(42,day,randomUUID(),0,now),e=>e.status===409);
      assert.throws(()=>store.claim(42,'2026-09-30',randomUUID(),0,now),e=>e.status===409);
    }
    assert.equal(result.state.total,20000);assert(result.state.complete);assert.equal(result.state.cursor,15);
    assert.throws(()=>store.claim(42,'2026-11-01',randomUUID(),0,new Date()),e=>e.code==='COMPLETE');
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM claims WHERE amount=0').get().n,1);
  }finally{store.close();}
});
test('missed days do not consume gifts; SQLite survives process/store restart',()=>{
  const dir=mkdtempSync(join(tmpdir(),'gift-test-')),path=join(dir,'state.sqlite');let s=new Store(path);
  try{
    const first=s.claim(42,'2026-10-01',randomUUID(),0,new Date('2026-10-01'));s.close();s=new Store(path);
    const state=s.state(42,'2026-10-10');assert.equal(state.cursor,1);assert.equal(state.total,first.prize.amount);assert(state.canOpen);
    const second=s.claim(42,'2026-10-10',randomUUID(),2,new Date('2026-10-10'));assert.equal(second.state.cursor,2);
  }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('claim and durable notification are committed together once',()=>{
  const s=new Store(':memory:');try{s.subscribe(42,42);const id=randomUUID();s.claim(42,'2026-10-22',id,1,new Date(),{appUrl:'https://example.test'});s.claim(42,'2026-10-22',id,1,new Date());assert.equal(s.db.prepare('SELECT count(*) AS n FROM outbox').get().n,1);}finally{s.close();}
});

test('online backup preserves the exact gift plan and already claimed amount',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'gift-backup-')),s=new Store(join(dir,'main.sqlite'));
  try{const result=s.claim(42,'2026-10-22',randomUUID(),0,new Date());const target=join(dir,'backup.sqlite');await backup(s.db,target);const b=new DatabaseSync(target,{readOnly:true});try{assert.equal(b.prepare('SELECT amount FROM claims').get().amount,result.prize.amount);assert.equal(b.prepare('SELECT plan FROM gifts').get().plan,s.db.prepare('SELECT plan FROM gifts').get().plan);}finally{b.close();}}finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
