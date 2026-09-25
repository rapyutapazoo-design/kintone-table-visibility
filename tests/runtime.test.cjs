const { test } = require('node:test');
const assert = require('node:assert/strict');
const {createDOM,load,rule,config} = require('./helpers.cjs');
function setup(raw, membership) {
  const dom = createDOM();
  const handlers = new Map();
  const calls = [];
  const api = platform => ({setFieldShown:(code,visible) => calls.push([platform,code,visible]),getHeaderMenuSpaceElement:()=>null});
  dom.window.kintone = {$PLUGIN_ID:'test',app:{record:api('pc')},mobile:{app:{record:api('mobile')}},
    getLoginUser:()=>({code:'user'}),plugin:{app:{getConfig:()=>raw}},
    events:{on:(names,fn)=>names.forEach(name=>handlers.set(name,fn))}};
  load(dom.window,'core.js');
  dom.window.TableVisibilityAPI = {loadMembership: membership || (async()=>dom.window.TableVisibility.createMembership([],['sales'],[],false))};
  load(dom.window,'runtime.js');
  return {dom,handlers,calls};
}
function event(type='app.record.detail.show') {
  return {type,record:{明細:{type:'SUBTABLE',value:[{id:'1',value:{金額:{type:'NUMBER',value:'123'}}}]},
    その他:{type:'SUBTABLE',value:[]},一般:{type:'SINGLE_LINE_TEXT',value:'keep'}}};
}

test('all seven show screens hide before async lookup, then show only allowed target, preserving data', async t => {
  const types = ['app.record.detail.show','app.record.create.show','app.record.edit.show','app.record.print.show',
    'mobile.app.record.detail.show','mobile.app.record.create.show','mobile.app.record.edit.show'];
  for (const type of types) await t.test(type,async()=>{
    let resolve;
    const s=setup({settings:JSON.stringify(config(rule({allowGroups:['sales']})))},()=>new Promise(r=>resolve=r));
    const e=event(type); const before=JSON.stringify(e);
    const pending=s.handlers.get(type)(e);
    const platform=type.startsWith('mobile.')?'mobile':'pc';
    assert.deepEqual(s.calls,[[platform,'明細',false]]);
    resolve(s.dom.window.TableVisibility.createMembership([],['sales'],[],false));
    assert.equal(await pending,e);
    assert.deepEqual(s.calls,[[platform,'明細',false],[platform,'明細',true]]);
    assert.equal(JSON.stringify(e),before);
    s.dom.window.close();
  });
});

test('deny and lookup failure never reveal a target even with defaultVisible=true',async()=>{
  for (const failure of [false,true]) {
    const s=setup({settings:JSON.stringify(config(rule({denyGroups:['sales'],defaultVisible:true})))},
      failure?async()=>{throw Error('offline');}:undefined);
    await s.handlers.get('app.record.detail.show')(event());
    assert.ok(s.calls.every(call=>call[2]===false));
    assert.equal(!!s.dom.window.document.querySelector('[role=alert]'),failure);
    s.dom.window.close();
  }
});

test('corrupt configuration hides all tables but no ordinary fields',async()=>{
  const s=setup({settings:'broken'});
  await s.handlers.get('app.record.detail.show')(event());
  assert.deepEqual(s.calls,[['pc','明細',false],['pc','その他',false]]);
  assert.match(s.dom.window.document.body.textContent,/設定を読み込めない/);
  s.dom.window.close();
});

test('unconfigured plugin does not fetch membership or alter display',async()=>{
  const s=setup({},()=>{throw Error('must not call');});
  await s.handlers.get('app.record.detail.show')(event());
  assert.equal(s.calls.length,0);
  s.dom.window.close();
});

test('renamed or wrong-type table does not accidentally hide a normal field',async()=>{
  const s=setup({settings:JSON.stringify(config(rule({tableCode:'一般'})))});
  await s.handlers.get('app.record.detail.show')(event());
  assert.equal(s.calls.length,0);
  assert.match(s.dom.window.document.body.textContent,/見つかりません/);
  s.dom.window.close();
});

test('navigation invalidates previous async result',async()=>{
  let resolve;
  const s=setup({settings:JSON.stringify(config(rule({defaultVisible:true})))},()=>new Promise(r=>resolve=r));
  const pending=s.handlers.get('app.record.detail.show')(event());
  s.handlers.get('app.record.index.show')({type:'app.record.index.show'});
  resolve(s.dom.window.TableVisibility.createMembership([],[],[],false));
  await pending;
  assert.deepEqual(s.calls,[['pc','明細',false]]);
  assert.equal(s.dom.window.document.querySelector('[role=alert]'),null);
  s.dom.window.close();
});

test('two detail requests cannot apply membership results out of order',async()=>{
  const resolvers=[];
  const s=setup({settings:JSON.stringify(config(rule({allowGroups:['sales']})))},()=>new Promise(r=>resolvers.push(r)));
  const first=s.handlers.get('app.record.detail.show')(event());
  const second=s.handlers.get('app.record.detail.show')(event());
  resolvers[1](s.dom.window.TableVisibility.createMembership([],[],[],false)); await second;
  resolvers[0](s.dom.window.TableVisibility.createMembership([],['sales'],[],false)); await first;
  assert.ok(s.calls.every(call=>!call[2]));
  s.dom.window.close();
});
