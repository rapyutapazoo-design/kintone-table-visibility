const { test } = require('node:test');
const assert = require('node:assert/strict');
const {createDOM,load,rule} = require('./helpers.cjs');
function setup(respond) {
  const dom=createDOM(); const calls=[];
  const api=(url,method,params,success,failure)=>{
    calls.push({url,method,params});
    Promise.resolve().then(()=>respond(url,params)).then(success,failure);
  };
  api.url=(path,guest)=>guest?'/k/guest/1'+path.slice(2):path;
  dom.window.kintone={api};
  load(dom.window,'core.js','api.js');
  return {dom,calls,api:dom.window.TableVisibilityAPI};
}

test('organization/group directory pages beyond 100 including exact page boundaries',async()=>{
  for (const count of [0,100,201]) {
    const s=setup((url,p)=>({groups:Array.from({length:Math.min(100,Math.max(0,count-p.offset))},(_,i)=>({code:String(i+p.offset),name:'Group'}))}));
    const groups=await s.api.listAll('/v1/groups.json','groups');
    assert.equal(groups.length,count);
    assert.equal(s.calls.length,Math.floor(count/100)+1);
    assert.ok(s.calls.every(c=>c.method==='GET' && c.params.size===100));
    s.dom.window.close();
  }
});

test('malformed/repeating directory page aborts instead of looping or returning partial permissions',async()=>{
  for (const response of [{groups:null},{groups:[{name:'missing code'}]}, {groups:Array.from({length:100},(_,i)=>({code:String(i)}))}]) {
    const s=setup(()=>response);
    await assert.rejects(s.api.listAll('/v1/groups.json','groups'));
    s.dom.window.close();
  }
});

test('form uses preview guest URL; User APIs never use guest URL',async()=>{
  const s=setup(url=>url.includes('/form/fields')?{properties:{}}:url.includes('organizations')?{organizations:[]}:{groups:[]});
  await s.api.loadCatalog(10);
  assert.equal(s.calls[0].url,'/k/guest/1/v1/preview/app/form/fields.json');
  assert.equal(s.calls[1].url,'/v1/organizations.json');
  assert.equal(s.calls[2].url,'/v1/groups.json');
  s.dom.window.close();
});

test('membership schema and descendant hierarchy are interpreted correctly',async()=>{
  const s=setup(url=>url==='/v1/user/organizations.json'?{organizationTitles:[{organization:{code:'child'}}]}:
    url==='/v1/user/groups.json'?{groups:[{code:'staff'}]}:{organizations:[{code:'child',parentCode:'root'},{code:'root',parentCode:null}]});
  const r=rule({allowOrganizations:[{code:'root',includeDescendants:true}]});
  const member=await s.api.loadMembership('user',[r]);
  assert.equal(s.dom.window.TableVisibility.evaluate(r,member),true);
  assert.equal(s.calls.length,3);
  assert.equal(s.calls[0].params.code,'user');
  s.dom.window.close();
});

test('direct-only rules avoid fetching organization directory',async()=>{
  const s=setup(url=>url.includes('organizations')?{organizationTitles:[]}:{groups:[]});
  await s.api.loadMembership('user',[rule()]);
  assert.equal(s.calls.length,2);
  s.dom.window.close();
});

test('API errors and invalid membership are errors, not empty membership',async()=>{
  for (const respond of [()=>{throw {code:'CB_NO02'};},()=>({groups:[],organizationTitles:[{}]}),()=>({})]) {
    const s=setup(respond);
    await assert.rejects(s.api.loadMembership('user',[rule({defaultVisible:true})]));
    s.dom.window.close();
  }
});

test('hung request times out; late callback cannot change the rejected result',async()=>{
  const s=setup(()=>new Promise(()=>{}));
  let scheduled;
  s.dom.window.setTimeout=(callback,ms)=>{scheduled={callback,ms};return 1;};
  s.dom.window.clearTimeout=()=>{};
  const pending=s.api.request('/v1/groups.json',{});
  const rejected=assert.rejects(pending,/応答がありません/);
  assert.equal(scheduled.ms,15000);
  scheduled.callback(); await rejected;
  s.dom.window.close();
});
