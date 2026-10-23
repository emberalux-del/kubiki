import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,extname} from 'node:path';
import {loadConfig} from './config.js';
import {Store} from './store.js';
import {AppError,validateInitData} from './auth.js';
import {clockParts} from './game.js';
import {Telegram,startTelegramWorkers} from './telegram.js';

const publicDir=resolve(dirname(fileURLToPath(import.meta.url)),'../public');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.svg':'image/svg+xml'};

export function createApp(config,{store=new Store(config.database),now=()=>new Date()}={}) {
  const limits=new Map();let workers=null;
  const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));};
  const authenticate=req=>{
    if(config.demo)return {id:1};
    const user=validateInitData(req.headers['x-telegram-init-data'],config.token,{now:now().getTime(),maxAge:config.authAge});
    if(!config.recipient)throw new AppError(503,'SETUP_REQUIRED','Приложение ещё настраивается. Попробуй позже.');
    if(String(user.id)!==config.recipient)throw new AppError(403,'PRIVATE_GIFT','Это личный подарок. Доступ открыт только получателю.');
    return user;
  };
  const handler=async(req,res)=>{
    res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');
    res.setHeader('content-security-policy',"default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self' https://web.telegram.org https://*.telegram.org; base-uri 'none'; form-action 'self'; object-src 'none'");
    res.setHeader('permissions-policy','camera=(), microphone=(), geolocation=()');
    let url;try{url=new URL(req.url,'http://local');}catch{return json(res,400,{error:'BAD_URL'});}
    try {
      if(url.pathname==='/health'&&req.method==='GET')return json(res,200,{ok:true,configured:config.demo||!!config.recipient,telegram:workers?.status()||'disabled'});
      if(url.pathname.startsWith('/api/')) {
        const origin=req.headers.origin;
        if(origin&&origin!==(config.demo?`http://${req.headers.host}`:new URL(config.appUrl).origin))throw new AppError(403,'ORIGIN','Недопустимый источник запроса.');
        const user=authenticate(req),time=now(),day=clockParts(time,config.timezone).day;
        if(url.pathname==='/api/state'&&req.method==='GET')return json(res,200,{...store.state(user.id,day,time),demo:config.demo,timezone:config.timezone});
        if(url.pathname==='/api/claim'&&req.method==='POST') {
          if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new AppError(415,'CONTENT_TYPE','Нужен JSON-запрос.');
          const key=String(user.id),window=Math.floor(time.getTime()/60000),previous=limits.get(key),count=previous?.window===window?previous.count+1:1;
          limits.set(key,{window,count});if(count>30)throw new AppError(429,'RATE_LIMIT','Слишком много запросов. Попробуй через минуту.');
          let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>2048)throw new AppError(413,'TOO_LARGE','Запрос слишком большой.');chunks.push(chunk);}
          let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{throw new AppError(400,'BAD_JSON','Некорректный запрос.');}
          if(!body||!Number.isInteger(body.cube)||body.cube<0||body.cube>2||typeof body.requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(body.requestId))throw new AppError(400,'BAD_CLAIM','Некорректный выбор кубика.');
          return json(res,200,store.claim(user.id,day,body.requestId,body.cube,time,config.demo?{}:{appUrl:config.appUrl,adminChatId:config.adminChatId}));
        }
        throw new AppError(404,'NOT_FOUND','Такой запрос не поддерживается.');
      }
      if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'METHOD_NOT_ALLOWED'});
      const allowed=['/','/index.html','/app.js','/style.css','/inter-latin.woff2','/inter-cyrillic.woff2','/icon.svg','/INTER-LICENSE.txt'];
      if(!allowed.includes(url.pathname))return json(res,404,{error:'NOT_FOUND'});
      const filename=url.pathname==='/'?'index.html':url.pathname.slice(1),data=await readFile(resolve(publicDir,filename));
      res.writeHead(200,{'content-type':types[extname(filename)]||'application/octet-stream','cache-control':filename.endsWith('.woff2')?'public, max-age=86400':'no-cache'});
      res.end(req.method==='HEAD'?undefined:data);
    }catch(e){if(e instanceof AppError)return json(res,e.status,{error:e.code,message:e.message});console.error('Request failed; inspect server configuration and database.');json(res,500,{error:'SERVER_ERROR',message:'Не удалось загрузить подарок. Попробуй ещё раз.'});}
  };
  const server=http.createServer(handler);server.requestTimeout=15000;server.headersTimeout=10000;
  return {server,store,startWorkers(){if(!config.demo)workers=startTelegramWorkers(store,new Telegram(config.token),config);},async stop(){await workers?.stop();await new Promise(resolve=>server.close(resolve));store.close();}};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const config=loadConfig(),app=createApp(config);
  app.server.listen(config.port,config.host,()=>{console.log(`Gift app listening on port ${config.port}. ${config.demo?'LOCAL DEMO — not a real gift.':''}`);if(!config.recipient&&!config.demo)console.warn('Set ALLOWED_TELEGRAM_ID to enable gifts. /id works in the bot.');app.startWorkers();});
  let closing=false;for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{if(closing)return;closing=true;await app.stop();process.exit(0);});
}
