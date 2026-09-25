'use strict';
// Development-only preview. Serves an explicit allowlist; never the workspace or signing key.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const mock=`
window.kintone = { $PLUGIN_ID:'preview', app:{getId:()=>10}, plugin:{app:{
  getConfig:()=>JSON.parse(sessionStorage.getItem('tv-preview-settings')||'{}'),
  setConfig:(value,callback)=>{ sessionStorage.setItem('tv-preview-settings',JSON.stringify(value)); callback(); }
}}};
window.TableVisibilityAPI={loadCatalog:async()=>({
  properties:{見積明細:{type:'SUBTABLE',code:'見積明細',label:'見積明細',fields:{金額:{code:'金額',label:'金額',required:true}}},
    原価明細:{type:'SUBTABLE',code:'原価明細',label:'原価明細',fields:{}}},
  organizations:[{code:'sales',name:'営業部',parentCode:null},{code:'sales_east',name:'東日本営業',parentCode:'sales'},
    {code:'development',name:'開発部',parentCode:null},{code:'management',name:'管理本部',parentCode:null}],
  groups:[{code:'manager',name:'管理職'},{code:'vendor',name:'外部委託'},{code:'everyone',name:'Everyone'}]
})};`;
const files={'/core.js':'text/javascript','/config.js':'text/javascript','/config.css':'text/css'};
http.createServer((request,response)=>{
  const url=new URL(request.url,'http://127.0.0.1');
  response.setHeader('Cache-Control','no-store');
  if(url.pathname==='/') {
    response.setHeader('Content-Type','text/html; charset=utf-8');
    response.end('<!doctype html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>テーブル表示制御 設定プレビュー</title><link rel="stylesheet" href="/config.css"></head><body><p style="padding:8px 16px;background:#f1f5f9;font-family:sans-serif">設定画面プレビュー — 架空のデータを使用。Kintoneには接続していません。</p>'+fs.readFileSync(path.join(root,'src/config.html'),'utf8')+'<script src="/core.js"></script><script>'+mock+'</script><script src="/config.js"></script></body></html>');
  } else if(Object.prototype.hasOwnProperty.call(files,url.pathname)) {
    response.setHeader('Content-Type',files[url.pathname]+'; charset=utf-8');
    response.end(fs.readFileSync(path.join(root,'src',url.pathname.slice(1))));
  } else {response.statusCode=404;response.end('Not found');}
}).listen(4178,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:4178 (Ctrl+C to stop)'));
