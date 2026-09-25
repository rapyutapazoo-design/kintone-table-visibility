(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TableVisibility = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function fail(message) { throw new Error(message); }
  function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function code(value) { return typeof value === 'string' && value.trim().length > 0; }

  function validateConfig(config) {
    if (!object(config) || config.version !== 1 || !Array.isArray(config.rules)) {
      fail('設定形式が正しくありません。プラグイン設定を確認してください。');
    }
    if (config.rules.length > 100) fail('設定できるテーブルは100件までです。');
    var tables = new Set();
    config.rules.forEach(function (rule, index) {
      var prefix = '設定' + (index + 1) + '：';
      if (!object(rule) || !code(rule.tableCode)) fail(prefix + '対象テーブルを選択してください。');
      if (tables.has(rule.tableCode)) fail(prefix + '同じテーブルが重複しています。');
      tables.add(rule.tableCode);
      if (typeof rule.defaultVisible !== 'boolean') fail(prefix + '既定の表示方法が不正です。');
      ['allowOrganizations', 'denyOrganizations', 'allowGroups', 'denyGroups'].forEach(function (key) {
        if (!Array.isArray(rule[key])) fail(prefix + '組織・グループの設定が不正です。');
        var seen = new Set();
        rule[key].forEach(function (entry) {
          var isOrganization = key.endsWith('Organizations');
          var value = isOrganization && object(entry) ? entry.code : entry;
          if (!code(value) || (isOrganization && (!object(entry) || typeof entry.includeDescendants !== 'boolean'))) {
            fail(prefix + '組織・グループのコードまたは下位組織設定が不正です。');
          }
          if (seen.has(value)) fail(prefix + '同じ組織・グループが重複しています。');
          seen.add(value);
        });
      });
    });
    if (new TextEncoder().encode(JSON.stringify(config)).length > 60000) {
      fail('設定容量が上限（60,000バイト）を超えました。選択数を減らしてください。');
    }
    return config;
  }

  function parseConfig(raw) {
    if (object(raw) && !Object.prototype.hasOwnProperty.call(raw, 'settings') && Object.keys(raw).length === 0) {
      return { version: 1, rules: [] };
    }
    if (!object(raw) || typeof raw.settings !== 'string' || !raw.settings) fail('保存された設定を読み込めません。');
    var config;
    try { config = JSON.parse(raw.settings); } catch (_) { fail('保存された設定のJSONが不正です。'); }
    return validateConfig(config);
  }

  function needsHierarchy(rules) {
    return rules.some(function (rule) {
      return rule.allowOrganizations.concat(rule.denyOrganizations).some(function (item) { return item.includeDescendants; });
    });
  }

  function createMembership(organizationCodes, groupCodes, organizations, withHierarchy) {
    var direct = new Set(organizationCodes);
    var ancestors = new Set(direct);
    if (withHierarchy) {
      var parents = new Map();
      organizations.forEach(function (org) {
        if (!object(org) || !code(org.code) || (org.parentCode !== null && !code(org.parentCode))) {
          fail('組織階層の情報が不正です。');
        }
        if (parents.has(org.code)) fail('組織階層の情報が重複しています。');
        parents.set(org.code, org.parentCode);
      });
      direct.forEach(function (ownCode) {
        var current = ownCode;
        var visited = new Set();
        while (current !== null) {
          if (visited.has(current)) fail('組織階層に循環があります。');
          if (!parents.has(current)) fail('所属組織の階層を確認できません。');
          visited.add(current);
          ancestors.add(current);
          current = parents.get(current);
        }
      });
    }
    return { direct: direct, ancestors: ancestors, groups: new Set(groupCodes) };
  }

  function matches(organizations, groups, membership) {
    return organizations.some(function (org) {
      return (org.includeDescendants ? membership.ancestors : membership.direct).has(org.code);
    }) || groups.some(function (group) { return membership.groups.has(group); });
  }

  function evaluate(rule, membership) {
    if (matches(rule.denyOrganizations, rule.denyGroups, membership)) return false;
    if (matches(rule.allowOrganizations, rule.allowGroups, membership)) return true;
    return rule.defaultVisible;
  }

  return { validateConfig: validateConfig, parseConfig: parseConfig, needsHierarchy: needsHierarchy,
    createMembership: createMembership, evaluate: evaluate };
});
