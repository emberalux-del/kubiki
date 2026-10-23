import {DatabaseSync,backup} from 'node:sqlite';
import {resolve} from 'node:path';
import {mkdirSync} from 'node:fs';
const db=new DatabaseSync(resolve(process.env.DATABASE_PATH||'./data/gifts.sqlite'),{readOnly:true});
mkdirSync('./backups',{recursive:true});
const destination=resolve(`./backups/gifts-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
await backup(db,destination);db.close();console.log(destination);
