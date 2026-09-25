const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core.js');

const rule = (overrides = {}) => ({ tableCode: '明細', allowOrganizations: [], denyOrganizations: [],
  allowGroups: [], denyGroups: [], defaultVisible: false, ...overrides });
const config = (...rules) => ({ version: 1, rules });
const membership = (orgs = [], groups = []) => core.createMembership(orgs, groups, [], false);

test('unconfigured plugin is a no-op; damaged settings are not silently ignored', () => {
  assert.deepEqual(core.parseConfig({}), config());
  for (const raw of [null, {settings: ''}, {settings: 'oops'}, {other: 'value'}, {settings: '{"version":2,"rules":[]}'}]) {
    assert.throws(() => core.parseConfig(raw));
  }
});

test('reject duplicate tables, missing flags, malformed codes and duplicate entities', () => {
  const invalid = [config(rule(), rule()), config(rule({tableCode: ''})), config(rule({defaultVisible: 'false'})),
    config(rule({allowOrganizations: [{code: '営業'}]})), config(rule({denyGroups: ['x', 'x']})),
    config(rule({allowOrganizations: ['営業']})), config(rule({allowGroups: null}))];
  invalid.forEach(value => assert.throws(() => core.validateConfig(value)));
  assert.equal(core.validateConfig(config(rule())).rules.length, 1);
});

test('deny wins over allow across both organizations and groups', () => {
  const cases = [
    rule({allowOrganizations: [{code: 'sales', includeDescendants: false}], denyGroups: ['vendor']}),
    rule({allowGroups: ['manager'], denyOrganizations: [{code: 'sales', includeDescendants: false}]}),
    rule({allowGroups: ['vendor'], denyGroups: ['vendor'], defaultVisible: true})
  ];
  cases.forEach(value => assert.equal(core.evaluate(value, membership(['sales'], ['vendor', 'manager'])), false));
});

test('allow is OR across multiple memberships; otherwise use explicit default', () => {
  assert.equal(core.evaluate(rule({allowGroups: ['manager']}), membership(['sales'], ['other', 'manager'])), true);
  assert.equal(core.evaluate(rule({allowOrganizations: [{code: 'sales', includeDescendants: false}]}), membership(['other', 'sales'])), true);
  assert.equal(core.evaluate(rule(), membership()), false);
  assert.equal(core.evaluate(rule({defaultVisible: true}), membership()), true);
  assert.equal(core.evaluate(rule({allowGroups: ['manager'], defaultVisible: true}), membership()), true);
});

test('descendant opt-in follows ancestors to arbitrary depth but not siblings', () => {
  const orgs = [{code:'root',parentCode:null},{code:'sales',parentCode:'root'},
    {code:'child',parentCode:'sales'},{code:'leaf',parentCode:'child'},{code:'other',parentCode:'root'}];
  const m = core.createMembership(['leaf'], [], orgs, true);
  assert.equal(core.evaluate(rule({allowOrganizations:[{code:'sales',includeDescendants:true}]}),m),true);
  assert.equal(core.evaluate(rule({allowOrganizations:[{code:'sales',includeDescendants:false}]}),m),false);
  assert.equal(core.evaluate(rule({allowOrganizations:[{code:'other',includeDescendants:true}]}),m),false);
  assert.equal(core.evaluate(rule({allowGroups:['manager'],denyOrganizations:[{code:'root',includeDescendants:true}],defaultVisible:true}),m),false);
});

test('incomplete and cyclic hierarchies throw rather than grant fallback visibility', () => {
  for (const orgs of [[], [{code:'a',parentCode:'missing'}], [{code:'a',parentCode:'a'}],
    [{code:'a',parentCode:'b'},{code:'b',parentCode:'a'}], [{code:'a',parentCode:null},{code:'a',parentCode:null}]]) {
    assert.throws(() => core.createMembership(['a'], [], orgs, true));
  }
});

test('arbitrary codes such as __proto__ do not collide with object properties', () => {
  const m = core.createMembership(['__proto__'], ['constructor'], [{code:'__proto__',parentCode:null}],true);
  assert.equal(core.evaluate(rule({allowOrganizations:[{code:'__proto__',includeDescendants:true}]}),m),true);
});

test('round-trip keeps Japanese identifiers and enforces a bounded settings size', () => {
  const value = config(rule({allowGroups:['管理者']}));
  assert.deepEqual(core.parseConfig({settings:JSON.stringify(value)}),value);
  assert.throws(() => core.validateConfig(config(rule({allowGroups:['あ'.repeat(22000)]}))), /容量/);
});

module.exports = { rule, config };
