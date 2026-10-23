import {loadConfig} from '../src/config.js';
import {Telegram} from '../src/telegram.js';
const config=loadConfig();
if(config.demo)throw new Error('Bot setup is unavailable in demo mode');
const telegram=new Telegram(config.token);
try {
  const me=await telegram.call('getMe');
  await telegram.call('deleteWebhook',{drop_pending_updates:false});
  await telegram.call('setMyCommands',{commands:[{command:'start',description:'Открыть кубики и включить уведомления'},{command:'status',description:'Мой прогресс'},{command:'id',description:'Мой Telegram ID'},{command:'stop',description:'Выключить уведомления'}]});
  await telegram.call('setChatMenuButton',{menu_button:{type:'web_app',text:'Кубики удачи',web_app:{url:config.appUrl}}});
  console.log(`Bot @${me.username} configured. Main Mini App URL must also be set in BotFather: ${config.appUrl}`);
}catch(e){console.error(`Bot setup failed (code ${Number(e.code)||503}). Check token and connection.`);process.exitCode=1;}
