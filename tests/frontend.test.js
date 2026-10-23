import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('production frontend has its root, all script-bound elements, three choices and valid JavaScript',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(ids.length,new Set(ids).size,'IDs must be unique');
  assert(ids.includes('glass-luck-preview'));
  for(const [,id] of js.matchAll(/\$\('([^']+)'\)/g))assert(ids.includes(id),`Missing UI element ${id}`);
  assert.equal((html.match(/class="cube-button"/g)||[]).length,3);
  assert(!html.includes('testOverlay'));assert(!html.includes('preview-button'));assert(!html.includes('удачу.'));
  assert.doesNotThrow(()=>new Script(js));
});
test('fonts are local WOFF2 assets and test secrets are absent from shipped interface',()=>{
  const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
  for(const name of ['inter-latin.woff2','inter-cyrillic.woff2']){assert(css.includes(`url(/${name})`));const font=readFileSync(new URL(`../public/${name}`,import.meta.url));assert.equal(font.subarray(0,4).toString(),'wOF2');}
  assert(!js.includes('BOT_TOKEN'));assert(!js.includes('makePlan'));assert(!css.includes('data:font'));
});
