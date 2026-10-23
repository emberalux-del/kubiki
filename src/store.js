import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {makePlan,validPlan,label,DAYS,BUDGET} from './game.js';
import {AppError} from './auth.js';

export class Store {
  constructor(path) {
    if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
    this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS gifts(user_id TEXT PRIMARY KEY,plan TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS claims(id INTEGER PRIMARY KEY,user_id TEXT NOT NULL REFERENCES gifts(user_id),day TEXT NOT NULL,opening INTEGER NOT NULL,amount INTEGER NOT NULL,request_id TEXT NOT NULL,cube INTEGER NOT NULL,created_at TEXT NOT NULL,UNIQUE(user_id,day),UNIQUE(user_id,opening),UNIQUE(user_id,request_id));
      CREATE TABLE IF NOT EXISTS subscribers(user_id TEXT PRIMARY KEY,chat_id TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS outbox(id INTEGER PRIMARY KEY,event_key TEXT UNIQUE NOT NULL,chat_id TEXT NOT NULL,body TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,sent_at INTEGER,dead INTEGER NOT NULL DEFAULT 0,kind TEXT NOT NULL DEFAULT 'reply',user_id TEXT,day TEXT);
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  }
  transaction(fn) {this.db.exec('BEGIN IMMEDIATE');try{const v=fn();this.db.exec('COMMIT');return v;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  getMeta(key,fallback='0'){return this.db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value??fallback;}
  setMeta(key,value){this.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,String(value));}
  ensure(userId,now) {
    let row=this.db.prepare('SELECT * FROM gifts WHERE user_id=?').get(String(userId));
    if(!row){const plan=makePlan();this.db.prepare('INSERT INTO gifts VALUES(?,?,?)').run(String(userId),JSON.stringify(plan),now.toISOString());row={plan:JSON.stringify(plan)};}
    const plan=JSON.parse(row.plan);if(!validPlan(plan))throw new Error('Stored gift plan failed validation');return plan;
  }
  state(userId,day,now=new Date()) {
    this.ensure(userId,now);
    const claims=this.db.prepare('SELECT opening,day,amount,cube FROM claims WHERE user_id=? ORDER BY opening').all(String(userId));
    const last=claims.at(-1),complete=claims.length>=DAYS;
    return {today:day,cursor:claims.length,total:claims.reduce((a,c)=>a+c.amount,0),budget:BUDGET,days:DAYS,complete,canOpen:!complete&&(!last||last.day<day),last:last?{...last,label:label(last.amount)}:null,notifications:!!this.db.prepare('SELECT enabled FROM subscribers WHERE user_id=?').get(String(userId))?.enabled};
  }
  enqueue(key,chatId,body,{kind='reply',userId=null,day=null}={}) {
    this.db.prepare('INSERT OR IGNORE INTO outbox(event_key,chat_id,body,kind,user_id,day) VALUES(?,?,?,?,?,?)').run(key,String(chatId),JSON.stringify(body),kind,userId===null?null:String(userId),day);
  }
  subscribe(userId,chatId,enabled=true) {
    this.db.prepare('INSERT INTO subscribers VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET chat_id=excluded.chat_id,enabled=excluded.enabled').run(String(userId),String(chatId),enabled?1:0);
  }
  claim(userId,day,requestId,cube,now,{appUrl,adminChatId}={}) {
    return this.transaction(()=>{
      const plan=this.ensure(userId,now);
      const prior=this.db.prepare('SELECT * FROM claims WHERE user_id=? AND request_id=?').get(String(userId),requestId);
      if(prior)return {state:this.state(userId,day,now),prize:{amount:prior.amount,kind:prior.amount===0?'tease':'money'},replayed:true};
      const state=this.state(userId,day,now);
      if(!state.canOpen)throw new AppError(409,state.complete?'COMPLETE':'ALREADY_OPENED',state.complete?'Все 15 подарков уже открыты.':'Сегодня подарок уже открыт. Новый выбор завтра.');
      const amount=plan[state.cursor],opening=state.cursor+1;
      this.db.prepare('INSERT INTO claims(user_id,day,opening,amount,request_id,cube,created_at) VALUES(?,?,?,?,?,?,?)').run(String(userId),day,opening,amount,requestId,cube,now.toISOString());
      const updated=this.state(userId,day,now),subscriber=this.db.prepare('SELECT * FROM subscribers WHERE user_id=? AND enabled=1').get(String(userId));
      const text=`Бусенька, твой подарок: ${label(amount)}\nОткрыто ${opening} из ${DAYS}. Всего: ${label(updated.total)}.${updated.complete?'\nВсе подарки открыты — 20 000 ₽!':''}`;
      const markup=appUrl?{inline_keyboard:[[{text:'Открыть кубики',web_app:{url:appUrl}}]]}:undefined;
      if(subscriber)this.enqueue(`result:${userId}:${opening}`,subscriber.chat_id,{text,reply_markup:markup},{kind:'result',userId,day});
      if(adminChatId&&String(adminChatId)!==String(subscriber?.chat_id))this.enqueue(`admin:${userId}:${opening}`,adminChatId,{text:`Бусенька открыла подарок ${opening}/15: ${label(amount)}. Общая сумма: ${label(updated.total)}.`});
      return {state:updated,prize:{amount,kind:amount===0?'tease':'money'},replayed:false};
    });
  }
  close(){this.db.close();}
}
