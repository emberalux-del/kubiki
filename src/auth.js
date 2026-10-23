import {createHmac,timingSafeEqual} from 'node:crypto';

export class AppError extends Error {
  constructor(status,code,message) {super(message);this.status=status;this.code=code;}
}
export function validateInitData(raw,token,{now=Date.now(),maxAge=3600}={}) {
  const fail=()=>{throw new AppError(401,'TELEGRAM_AUTH','Открой приложение заново из Telegram.');};
  if (typeof raw!=='string'||!raw||raw.length>16384||!token) return fail();
  const params=new URLSearchParams(raw),seen=new Set();
  for(const [key] of params){if(seen.has(key))return fail();seen.add(key);}
  const hash=params.get('hash');if(!/^[a-f0-9]{64}$/i.test(hash||''))return fail();
  params.delete('hash');
  const data=[...params].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
  const secret=createHmac('sha256','WebAppData').update(token).digest();
  const expected=createHmac('sha256',secret).update(data).digest();
  if(!timingSafeEqual(expected,Buffer.from(hash,'hex')))return fail();
  const authDate=Number(params.get('auth_date')),age=now/1000-authDate;
  if(!Number.isInteger(authDate)||age>maxAge||age < -30)return fail();
  let user;try{user=JSON.parse(params.get('user'));}catch{return fail();}
  if(!user||!Number.isSafeInteger(user.id)||user.id<=0)return fail();
  return user;
}
