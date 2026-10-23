import {createHmac} from 'node:crypto';
export const TOKEN='123456789:test_token_only_never_a_real_secret';
export const TIME=new Date('2026-10-22T08:00:00Z');
export function signedData(id=42,now=TIME,extra={}) {
  const p=new URLSearchParams({auth_date:String(Math.floor(now.getTime()/1000)),query_id:'test-query',user:JSON.stringify({id,first_name:'Бусенька'}),...extra});
  const text=[...p].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
  p.set('hash',createHmac('sha256',createHmac('sha256','WebAppData').update(TOKEN).digest()).update(text).digest('hex'));
  return p.toString();
}
export const config={demo:false,token:TOKEN,recipient:'42',appUrl:'https://gifts.example.test',timezone:'Europe/Moscow',hour:10,minute:0,authAge:3600,adminChatId:''};
