import {resolve} from 'node:path';

export function loadConfig(env=process.env) {
  const demo=env.DEMO_MODE==='true';
  if(demo&&env.NODE_ENV==='production')throw new Error('DEMO_MODE must not be enabled in production');
  const token=env.BOT_TOKEN||'';
  if(!demo&&!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token))throw new Error('Set a valid BOT_TOKEN in server environment variables');
  const recipient=env.ALLOWED_TELEGRAM_ID||'';
  if(recipient&&!/^[1-9]\d{0,15}$/.test(recipient))throw new Error('ALLOWED_TELEGRAM_ID must be a positive Telegram ID');
  const appUrl=env.APP_URL||'';
  if(!demo){const u=new URL(appUrl);if(u.protocol!=='https:'||u.username||u.password)throw new Error('APP_URL must be a public HTTPS URL');}
  const timezone=env.TIMEZONE||'Europe/Moscow';new Intl.DateTimeFormat('en',{timeZone:timezone});
  const hour=Number(env.REMINDER_HOUR??10),minute=Number(env.REMINDER_MINUTE??0);
  if(!Number.isInteger(hour)||hour<0||hour>23||!Number.isInteger(minute)||minute<0||minute>59)throw new Error('Invalid reminder time');
  const authAge=Number(env.AUTH_MAX_AGE_SECONDS||3600);
  if(!Number.isInteger(authAge)||authAge<60||authAge>86400)throw new Error('Invalid auth maximum age');
  const adminChatId=env.ADMIN_CHAT_ID||'';if(adminChatId&&!/^-?\d+$/.test(adminChatId))throw new Error('Invalid ADMIN_CHAT_ID');
  return {demo,token,recipient,appUrl:appUrl.replace(/\/$/,''),timezone,hour,minute,authAge,adminChatId,port:Number(env.PORT||3000),host:demo?'127.0.0.1':env.HOST||'0.0.0.0',database:resolve(env.DATABASE_PATH||(demo?'./data/demo.sqlite':'./data/gifts.sqlite'))};
}
