'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const JSZip=require('jszip');
const root=path.resolve(__dirname,'..');

(async()=>{
  const plugin=await JSZip.loadAsync(fs.readFileSync(path.join(root,'dist/table-visibility.zip')));
  assert.deepEqual(Object.keys(plugin.files).sort(),['PUBKEY','SIGNATURE','contents.zip'].sort());
  const contents=await plugin.file('contents.zip').async('nodebuffer');
  const pubkey=await plugin.file('PUBKEY').async('nodebuffer');
  const signature=await plugin.file('SIGNATURE').async('nodebuffer');
  const key=crypto.createPublicKey({key:pubkey,format:'der',type:'spki'});
  assert.equal(crypto.verify('RSA-SHA1',contents,key,signature),true,'Plugin signature must verify');
  const inner=await JSZip.loadAsync(contents);
  const manifest=JSON.parse(await inner.file('manifest.json').async('string'));
  assert.deepEqual(manifest,JSON.parse(fs.readFileSync(path.join(root,'src/manifest.json'),'utf8')));
  const expected=[...new Set(['manifest.json',manifest.icon,...manifest.desktop.js,...manifest.mobile.js,
    manifest.config.html,...manifest.config.js,...manifest.config.css])];
  assert.deepEqual(Object.keys(inner.files).filter(name=>!inner.files[name].dir).sort(),expected.sort());
  for(const filename of expected) {
    assert.ok(!/\.ppk$|\.pem$|\.keys|node_modules|tests\//.test(filename),'No private/dev files');
    if(filename!=='manifest.json') assert.deepEqual(await inner.file(filename).async('nodebuffer'),fs.readFileSync(path.join(root,'src',filename)),filename+' matches source');
  }
  const id=crypto.createHash('sha256').update(pubkey).digest('hex').slice(0,32).replace(/[0-9a-f]/g,char=>String.fromCharCode(97+parseInt(char,16)));
  assert.equal(id,fs.readFileSync(path.join(root,'dist/plugin-id.txt'),'utf8').trim());
  const sum=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'dist/table-visibility.zip'))).digest('hex');
  assert.equal(fs.readFileSync(path.join(root,'dist/SHA256SUMS'),'utf8').split(' ')[0],sum);
  console.log('PASS: ZIP署名・プラグインID・マニフェスト・ソース一致・秘密鍵除外・SHA256 ('+expected.length+' files)');
})().catch(error=>{console.error(error);process.exitCode=1;});
