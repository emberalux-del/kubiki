import { randomInt } from 'node:crypto';

export const CASH = [300, 500, 1000, 1500, 2000, 5000];
export const DAYS = 15;
export const BUDGET = 20000;

// Weighted exact-sum sampling; every plan has 14 cash prizes and one zero.
export function makePlan() {
  const values = CASH.map(x => x / 100), weights = [30, 25, 20, 12, 8, 5];
  const ways = Array.from({length: 15}, () => new Float64Array(201));
  ways[0][0] = 1;
  for (let k=1; k<=14; k++) for (let sum=0; sum<=200; sum++)
    values.forEach((v,j) => { if (sum>=v) ways[k][sum] += weights[j]*ways[k-1][sum-v]; });
  const plan=[]; let left=200;
  for (let k=14; k>0; k--) {
    const options=values.map((v,j)=>({v,w:left>=v?weights[j]*ways[k-1][left-v]:0})).filter(x=>x.w>0);
    let r=randomInt(0x100000000)/0x100000000*options.reduce((a,x)=>a+x.w,0);
    let selected=options.at(-1);
    for (const x of options) { r-=x.w; if (r<0) {selected=x;break;} }
    plan.push(selected.v*100); left-=selected.v;
  }
  plan.push(0);
  for (let i=plan.length-1;i>0;i--) {const j=randomInt(i+1);[plan[i],plan[j]]=[plan[j],plan[i]];}
  if (!validPlan(plan)) throw new Error('Invalid gift plan');
  return plan;
}

export function validPlan(plan) {
  return Array.isArray(plan) && plan.length===DAYS && plan.filter(x=>x===0).length===1
    && plan.every(x=>x===0||CASH.includes(x)) && plan.reduce((a,b)=>a+b,0)===BUDGET;
}

export function clockParts(date=new Date(),timezone='Europe/Moscow') {
  const p={}; new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).forEach(x=>p[x.type]=x.value);
  return {day:`${p.year}-${p.month}-${p.day}`,hour:Number(p.hour),minute:Number(p.minute)};
}
export const label = amount => amount===0 ? 'Фигушка!' : `${amount.toLocaleString('ru-RU')} ₽`;
