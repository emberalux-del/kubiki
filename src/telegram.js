import {clockParts,label} from './game.js';

export class TelegramError extends Error {
  constructor(code,retryAfter=0){super(`Telegram API error ${code}`);this.code=code;this.retryAfter=retryAfter;}
}
export class Telegram {
  constructor(token,fetcher=fetch){this.token=token;this.fetcher=fetcher;}
  async call(method,payload={},signal) {
    // Never log this URL or raw fetch errors: they may contain the bot token.
    let response,body;
    try {
      const timeout=AbortSignal.timeout(method==='getUpdates'?35000:15000);
      response=await this.fetcher(`https://api.telegram.org/bot${this.token}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:signal?AbortSignal.any([signal,timeout]):timeout});
      body=await response.json();
    }catch{throw new TelegramError(503);}
    if(!response.ok||!body.ok)throw new TelegramError(body.error_code||response.status,Number(body.parameters?.retry_after)||0);
    return body.result;
  }
}

export function appButton(appUrl){return {inline_keyboard:[[{text:'Открыть кубики',web_app:{url:appUrl}}]]};}

export function processUpdate(store,update,config,now=new Date()) {
  const message=update.message;
  store.transaction(()=>{
    if(Number(store.getMeta('telegram_offset'))>update.update_id)return;
    if(message?.chat?.type==='private'&&Number.isSafeInteger(message.from?.id)&&typeof message.text==='string') {
      const userId=String(message.from.id),chatId=String(message.chat.id),command=message.text.trim().split(/\s+/)[0].split('@')[0];
      const reply=(text,markup)=>store.enqueue(`update:${update.update_id}`,chatId,{text,reply_markup:markup});
      if(command==='/id')reply(`Твой Telegram ID: ${userId}\nЭтот номер можно указать в ALLOWED_TELEGRAM_ID на сервере.`);
      else if(!config.recipient||userId!==config.recipient)reply('Это личное приложение. Доступ к подаркам открыт только получателю.');
      else if(command==='/start'||command==='/notifications_on') {
        store.subscribe(userId,chatId,true);
        const {day}=clockParts(now,config.timezone),s=store.state(userId,day,now);
        reply(s.complete?'Бусенька, все 15 подарков открыты. Общая сумма — 20 000 ₽.':`Бусенька, здесь твои кубики удачи.\nОдин выбор в день. Напоминания — в ${String(config.hour).padStart(2,'0')}:${String(config.minute).padStart(2,'0')} (${config.timezone}).\nОтключить уведомления: /stop`,appButton(config.appUrl));
      } else if(command==='/stop'||command==='/notifications_off') {
        store.subscribe(userId,chatId,false);reply('Уведомления отключены. Включить снова: /start');
      } else if(command==='/status') {
        const s=store.state(userId,clockParts(now,config.timezone).day,now);
        reply(`Открыто ${s.cursor} из 15. Сумма: ${s.total.toLocaleString('ru-RU')} ₽.${s.complete?' Все подарки открыты.':s.canOpen?' Сегодня можно выбрать кубик.':' Новый выбор завтра.'}`,appButton(config.appUrl));
      } else reply('Открыть приложение: /start\nМой ID: /id\nПрогресс: /status\nВыключить уведомления: /stop');
    }
    store.setMeta('telegram_offset',update.update_id+1);
  });
}

export function scheduleReminder(store,config,now=new Date()) {
  const {day,hour,minute}=clockParts(now,config.timezone);
  if(hour*60+minute<config.hour*60+config.minute||!config.recipient)return;
  const sub=store.db.prepare('SELECT * FROM subscribers WHERE user_id=? AND enabled=1').get(config.recipient);
  if(!sub)return;
  const state=store.state(config.recipient,day,now);
  if(!state.canOpen)return;
  store.enqueue(`reminder:${config.recipient}:${day}`,sub.chat_id,{text:'Бусенька, новый подарок ждёт тебя. Выбирай кубик удачи.',reply_markup:appButton(config.appUrl)},{kind:'reminder',userId:config.recipient,day});
}

export async function flushOutbox(store,telegram,config,now=new Date()) {
  const rows=store.db.prepare('SELECT * FROM outbox WHERE sent_at IS NULL AND dead=0 AND next_at<=? ORDER BY id LIMIT 12').all(now.getTime());
  for(const row of rows) {
    const {day}=clockParts(now,config.timezone);
    const enabled=row.user_id?store.db.prepare('SELECT enabled FROM subscribers WHERE user_id=?').get(row.user_id)?.enabled:true;
    const staleReminder=row.kind==='reminder'&&(row.day!==day||!store.state(row.user_id,day,now).canOpen);
    if(!enabled||staleReminder){store.db.prepare('UPDATE outbox SET dead=1 WHERE id=?').run(row.id);continue;}
    try {
      await telegram.call('sendMessage',{...JSON.parse(row.body),chat_id:row.chat_id});
      store.db.prepare('UPDATE outbox SET sent_at=? WHERE id=?').run(now.getTime(),row.id);
    }catch(e) {
      const permanent=[400,401,403].includes(e.code);
      if(e.code===403&&row.user_id)store.db.prepare('UPDATE subscribers SET enabled=0 WHERE user_id=?').run(row.user_id);
      const delay=Math.max(e.retryAfter||0,Math.min(3600,15*2**Math.min(row.attempts,8)));
      store.db.prepare('UPDATE outbox SET attempts=attempts+1,next_at=?,dead=? WHERE id=?').run(now.getTime()+delay*1000,permanent?1:0,row.id);
      // Safe numeric logging only, no message contents, user IDs, or credentials.
      console.warn(`Telegram notification deferred (code ${Number(e.code)||503}).`);
    }
  }
}

export function startTelegramWorkers(store,telegram,config) {
  const controller=new AbortController();let sending=false,pollStatus='starting',timer,tickPromise=Promise.resolve();
  const tick=()=>{if(sending||controller.signal.aborted)return tickPromise;sending=true;tickPromise=(async()=>{try{scheduleReminder(store,config);await flushOutbox(store,telegram,config);}catch{console.warn('Notification worker will retry.');}finally{sending=false;}})();return tickPromise;};
  const delay=ms=>new Promise(resolve=>{const finish=()=>{clearTimeout(t);controller.signal.removeEventListener('abort',finish);resolve();};const t=setTimeout(finish,ms);controller.signal.addEventListener('abort',finish,{once:true});if(controller.signal.aborted)finish();});
  const run=async()=>{
    while(!controller.signal.aborted) {
      try {
        const hook=await telegram.call('getWebhookInfo',{},controller.signal);
        if(hook.url){pollStatus='webhook_conflict';console.warn('Bot has an existing webhook. Run npm run bot:setup, then restart this service.');await delay(30000);continue;}
        pollStatus='running';
        while(!controller.signal.aborted) {
          const updates=await telegram.call('getUpdates',{offset:Number(store.getMeta('telegram_offset')),timeout:25,allowed_updates:['message']},controller.signal);
          for(const update of updates)processUpdate(store,update,config);
          await tick();
        }
      }catch(e){if(!controller.signal.aborted){pollStatus=e.code===409?'another_poller':'retrying';console.warn(`Telegram polling retry (code ${Number(e.code)||503}).`);await delay(5000);}}
    }
  };
  const polling=run();timer=setInterval(tick,15000);void tick();
  return {status:()=>pollStatus,stop:async()=>{clearInterval(timer);controller.abort();await polling;await tickPromise;}};
}
