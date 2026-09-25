'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
const cli = require.resolve('@kintone/cli/cli.js');
const key = path.join(root,'.keys/plugin.ppk');
const output = path.join(root,'dist/table-visibility.zip');

function crc32(buffer) {
  let crc=0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit=0;bit<8;bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function chunk(type,data) {
  const header=Buffer.alloc(4);header.writeUInt32BE(data.length);
  const payload=Buffer.concat([Buffer.from(type),data]);
  const checksum=Buffer.alloc(4);checksum.writeUInt32BE(crc32(payload));
  return Buffer.concat([header,payload,checksum]);
}
function makeIcon() {
  // Code-drawn table icon, no external artwork or generated image dependencies.
  const size=56,raw=Buffer.alloc(size*(size*4+1));
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const index=y*(size*4+1)+1+x*4;
    const inTable=x>=11&&x<=44&&y>=13&&y<=42;
    const line=inTable&&(x===11||x===44||y===13||y===42||y===22||y===32||x===27);
    const color=line?[255,255,255,255]:[29,85,159,255];
    raw.set(color,index);
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}

fs.mkdirSync(path.dirname(key),{recursive:true,mode:0o700});
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(path.join(root,'src/icon.png'),makeIcon());
if (!fs.existsSync(key)) {
  if(fs.existsSync(path.join(root,'dist/plugin-id.txt')) || fs.existsSync(output)) {
    throw Error('既存ビルドの秘密鍵がありません。.keys/plugin.ppk を復元してください。プラグインIDの変更を防ぐため中断します。');
  }
  execFileSync(process.execPath,[cli,'plugin','keygen','--output',key],{stdio:'inherit'});
}
fs.chmodSync(key,0o600);
execFileSync(process.execPath,[cli,'plugin','pack','--input',path.join(root,'src/manifest.json'),'--output',output,'--private-key',key],{stdio:'inherit'});
const publicKey=crypto.createPublicKey(fs.readFileSync(key)).export({format:'der',type:'spki'});
const id=crypto.createHash('sha256').update(publicKey).digest('hex').slice(0,32).replace(/[0-9a-f]/g,char=>String.fromCharCode(97+parseInt(char,16)));
fs.writeFileSync(path.join(root,'dist/plugin-id.txt'),id+'\n');
fs.writeFileSync(path.join(root,'dist/SHA256SUMS'),crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex')+'  table-visibility.zip\n');
console.log('Plugin ID: '+id);
console.log('署名用秘密鍵: .keys/plugin.ppk（ZIPには含まれません。更新用に保管してください）');
