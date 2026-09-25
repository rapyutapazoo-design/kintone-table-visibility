(function (root) {
  'use strict';
  var TIMEOUT = 15000;

  function request(path, params, guest) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('APIの応答がありません。通信状態を確認してください。')); }, TIMEOUT);
      function success(value) { clearTimeout(timer); resolve(value); }
      function failure(error) {
        clearTimeout(timer);
        var suffix = error && typeof error.code === 'string' ? '（' + error.code + '）' : '';
        reject(new Error('情報の取得に失敗しました' + suffix + '。権限と通信状態を確認してください。'));
      }
      try { root.kintone.api(root.kintone.api.url(path, Boolean(guest)), 'GET', params || {}, success, failure); }
      catch (error) { failure(error); }
    });
  }

  async function listAll(path, key) {
    var items = [];
    var seen = new Set();
    for (var offset = 0; ; offset += 100) {
      var response = await request(path, { size: 100, offset: offset });
      if (!response || !Array.isArray(response[key])) throw new Error('一覧の応答形式が不正です。');
      var page = response[key];
      if (page.length > 100) throw new Error('一覧の件数が不正です。');
      page.forEach(function (item) {
        if (!item || typeof item.code !== 'string' || !item.code || seen.has(item.code)) {
          throw new Error('一覧に不正または重複するコードがあります。再読み込みしてください。');
        }
        seen.add(item.code);
        items.push(item);
      });
      if (page.length < 100) return items;
    }
  }

  async function loadCatalog(appId) {
    var results = await Promise.all([
      request('/k/v1/preview/app/form/fields.json', { app: appId }, true),
      listAll('/v1/organizations.json', 'organizations'),
      listAll('/v1/groups.json', 'groups')
    ]);
    if (!results[0] || !results[0].properties || typeof results[0].properties !== 'object') {
      throw new Error('フォーム情報の応答形式が不正です。');
    }
    return { properties: results[0].properties, organizations: results[1], groups: results[2] };
  }

  async function loadMembership(userCode, rules) {
    if (typeof userCode !== 'string' || !userCode) throw new Error('ログインユーザーを確認できません。');
    var hierarchy = root.TableVisibility.needsHierarchy(rules);
    var results = await Promise.all([
      request('/v1/user/organizations.json', { code: userCode }),
      request('/v1/user/groups.json', { code: userCode }),
      hierarchy ? listAll('/v1/organizations.json', 'organizations') : Promise.resolve([])
    ]);
    if (!results[0] || !Array.isArray(results[0].organizationTitles) || !results[1] || !Array.isArray(results[1].groups)) {
      throw new Error('所属情報の応答形式が不正です。');
    }
    var orgCodes = results[0].organizationTitles.map(function (item) {
      if (!item || !item.organization || typeof item.organization.code !== 'string' || !item.organization.code) {
        throw new Error('所属組織の応答形式が不正です。');
      }
      return item.organization.code;
    });
    var groupCodes = results[1].groups.map(function (item) {
      if (!item || typeof item.code !== 'string' || !item.code) throw new Error('所属グループの応答形式が不正です。');
      return item.code;
    });
    return root.TableVisibility.createMembership(orgCodes, groupCodes, results[2], hierarchy);
  }

  root.TableVisibilityAPI = { request: request, listAll: listAll, loadCatalog: loadCatalog, loadMembership: loadMembership };
})(globalThis);
