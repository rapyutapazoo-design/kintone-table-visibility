const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
function createDOM(html = '') {
  const dom = new JSDOM('<!doctype html><html><body>' + html + '</body></html>', {
    url:'https://example.cybozu.com/k/admin/app/10/plugin/config', runScripts:'outside-only'
  });
  dom.window.TextEncoder = TextEncoder;
  return dom;
}
function load(window, ...files) {
  files.forEach(file => window.eval(fs.readFileSync(path.join(__dirname,'../src',file),'utf8')));
}
function rule(overrides = {}) {
  return {tableCode:'明細',allowOrganizations:[],denyOrganizations:[],allowGroups:[],denyGroups:[],defaultVisible:false,...overrides};
}
function config(...rules) { return {version:1,rules}; }
module.exports = { createDOM, load, rule, config };
