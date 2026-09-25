const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createDOM,load,rule,config}=require('./helpers.cjs');
const html=fs.readFileSync(path.join(__dirname,'../src/config.html'),'utf8');
const catalog={properties:{明細:{type:'SUBTABLE',code:'明細',label:'見積明細',fields:{金額:{code:'金額',label:'金額',required:true}}},
  連絡先:{type:'SINGLE_LINE_TEXT',code:'連絡先',label:'連絡先'},備考:{type:'SUBTABLE',code:'備考',label:'備考',fields:{}}},
  organizations:[{code:'sales',name:'営業部',parentCode:null},{code:'dev',name:'開発部',parentCode:null}],
  groups:[{code:'manager',name:'管理職'},{code:'vendor',name:'外部委託'}]};
const flush=()=>new Promise(r=>setImmediate(r));
async function setup(raw={},data=catalog) {
  const dom=createDOM(html); const saved=[]; const callbacks=[];
  const style=dom.window.document.createElement('style');
  style.textContent=fs.readFileSync(path.join(__dirname,'../src/config.css'),'utf8');
  dom.window.document.head.appendChild(style);
  dom.window.HTMLElement.prototype.scrollIntoView=function(){};
  dom.window.kintone={$PLUGIN_ID:'test',app:{getId:()=>10},plugin:{app:{getConfig:()=>raw,
    setConfig:(value,callback)=>{saved.push(value);callbacks.push(callback);}}}};
  dom.window.TableVisibilityAPI={loadCatalog:()=>data instanceof Error?Promise.reject(data):Promise.resolve(data)};
  load(dom.window,'core.js','config.js'); await flush();
  return {dom,doc:dom.window.document,saved,callbacks};
}
function change(s,element,value) {
  if (element.type==='checkbox') element.checked=value; else element.value=value;
  element.dispatchEvent(new s.dom.window.Event('change',{bubbles:true}));
}
function pick(s,key,code,checked=true) {
  const picker=s.doc.querySelector('[id^="tv-'+key+'-search-"]').closest('.tv-picker');
  const label=[...picker.querySelectorAll('.tv-options label')].find(label=>label.textContent.includes('（'+code+'）'));
  assert.ok(label,'picker option '+code);
  change(s,label.querySelector('input'),checked);
}

test('create rule via table selector and all four pickers, save and restore exact settings',async()=>{
  const s=await setup();
  assert.equal(s.dom.window.getComputedStyle(s.doc.querySelector('#tv-loading')).display,'none');
  assert.equal(s.doc.querySelectorAll('.tv-picker').length,4);
  assert.equal(s.doc.querySelectorAll('[id^=tv-table-] option').length,3);
  change(s,s.doc.querySelector('select[id^=tv-table-]'),'明細');
  assert.match(s.doc.querySelector('.tv-advisory').textContent,/必須.*金額/);
  pick(s,'allowOrganizations','sales');
  change(s,s.doc.querySelector('.tv-descendant-option input'),true);
  pick(s,'denyOrganizations','dev');
  pick(s,'allowGroups','manager');
  pick(s,'denyGroups','vendor');
  s.doc.querySelector('#tv-save').click();
  assert.equal(s.saved.length,1);
  assert.equal(s.doc.querySelector('#tv-save').disabled,true);
  assert.ok([...s.doc.querySelectorAll('input,select,button')].every(node=>node.disabled));
  const expected=config(rule({allowOrganizations:[{code:'sales',includeDescendants:true}],
    denyOrganizations:[{code:'dev',includeDescendants:false}],allowGroups:['manager'],denyGroups:['vendor']}));
  assert.deepEqual(JSON.parse(s.saved[0].settings),expected);
  s.callbacks[0]();
  assert.equal(s.doc.querySelector('#tv-save').disabled,false);
  assert.match(s.doc.querySelector('#tv-status').textContent,/アプリを更新/);
  const restored=await setup(s.saved[0]);
  restored.doc.querySelector('#tv-save').click();
  assert.deepEqual(JSON.parse(restored.saved[0].settings),expected);
  s.dom.window.close();restored.dom.window.close();
});

test('search filters options without dropping previous selections',async()=>{
  const s=await setup({settings:JSON.stringify(config(rule({allowGroups:['vendor']})))});
  const search=s.doc.querySelector('[id^=tv-allowGroups-search]');
  search.value='管理';search.dispatchEvent(new s.dom.window.Event('input'));
  assert.equal(search.closest('.tv-picker').querySelectorAll('.tv-option').length,1);
  pick(s,'allowGroups','manager');
  s.doc.querySelector('#tv-save').click();
  assert.deepEqual(JSON.parse(s.saved[0].settings).rules[0].allowGroups,['vendor','manager']);
  s.dom.window.close();
});

test('deleted table, organization and group remain visible and cannot be silently saved',async()=>{
  for(const r of [rule({tableCode:'削除済'}),rule({allowOrganizations:[{code:'gone-org',includeDescendants:true}]}),rule({denyGroups:['gone-group']})]) {
    const s=await setup({settings:JSON.stringify(config(r))});
    assert.match(s.doc.body.textContent,/削除済み/);
    s.doc.querySelector('#tv-save').click();
    assert.equal(s.saved.length,0);
    assert.match(s.doc.querySelector('#tv-error').textContent,/存在しません/);
    s.dom.window.close();
  }
});

test('inherited object property names are valid table codes (review regression)',async()=>{
  for(const code of ['constructor','__proto__','toString']) {
    const data={...catalog,properties:Object.fromEntries([[code,{type:'SUBTABLE',code,label:code,fields:{}}]])};
    const s=await setup({settings:JSON.stringify(config(rule({tableCode:code})))},data);
    s.doc.querySelector('#tv-save').click();
    assert.equal(s.saved.length,1,code);
    s.dom.window.close();
  }
});

test('blank table blocks save, duplicate choices are disabled, removing all saves no-op',async()=>{
  const s=await setup();
  s.doc.querySelector('#tv-save').click();assert.equal(s.saved.length,0);
  change(s,s.doc.querySelector('select[id^=tv-table-]'),'明細');
  s.doc.querySelector('#tv-add-rule').click();
  const second=s.doc.querySelectorAll('select[id^=tv-table-]')[1];
  assert.equal([...second.options].find(o=>o.value==='明細').disabled,true);
  while(s.doc.querySelector('.tv-remove')) s.doc.querySelector('.tv-remove').click();
  s.doc.querySelector('#tv-save').click();
  assert.deepEqual(JSON.parse(s.saved[0].settings),config());
  s.dom.window.close();
});

test('catalog failure or corrupt saved data blocks writes but leaves cancel enabled',async()=>{
  for(const [raw,data] of [[{},Error('offline')],[{settings:'broken'},catalog]]) {
    const s=await setup(raw,data);
    assert.equal(s.doc.querySelector('#tv-save').disabled,true);
    assert.equal(s.doc.querySelector('#tv-cancel').disabled,false);
    assert.equal(s.doc.querySelector('#tv-error').hidden,false);
    assert.equal(s.saved.length,0);
    s.dom.window.close();
  }
});

test('untrusted labels and codes render as text, never HTML',async()=>{
  const data={...catalog,groups:[{code:'<img src=x onerror=alert(1)>',name:'<script>bad()</script>'}]};
  const s=await setup({},data);
  assert.equal(s.doc.querySelectorAll('script,img').length,0);
  assert.match(s.doc.body.textContent,/<script>bad/);
  s.dom.window.close();
});

test('synchronous save error unlocks editing and reports failure',async()=>{
  const s=await setup({settings:JSON.stringify(config(rule()))});
  s.dom.window.kintone.plugin.app.setConfig=()=>{throw Error('save error');};
  s.doc.querySelector('#tv-save').click();
  assert.equal(s.doc.querySelector('#tv-save').disabled,false);
  assert.match(s.doc.querySelector('#tv-error').textContent,/保存できませんでした/);
  s.dom.window.close();
});
