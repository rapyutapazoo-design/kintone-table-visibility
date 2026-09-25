(function (root, pluginId) {
  'use strict';
  var kintone = root.kintone;
  var generation = 0;
  var messageId = 'table-visibility-message-' + pluginId;
  var events = [
    'app.record.detail.show', 'app.record.create.show', 'app.record.edit.show', 'app.record.print.show',
    'mobile.app.record.detail.show', 'mobile.app.record.create.show', 'mobile.app.record.edit.show'
  ];

  function clearMessage() {
    var previous = document.getElementById(messageId);
    if (previous) previous.remove();
  }

  function showMessage(message, recordAPI) {
    clearMessage();
    var element = document.createElement('div');
    element.id = messageId;
    element.setAttribute('role', 'alert');
    element.style.cssText = 'padding:12px 16px;margin:8px;background:#fff4e5;border:1px solid #b87517;color:#573700;font-size:14px;line-height:1.6;white-space:pre-wrap;';
    element.textContent = 'テーブル表示制御：' + message;
    var header;
    try { header = recordAPI.getHeaderMenuSpaceElement && recordAPI.getHeaderMenuSpaceElement(); } catch (_) { /* Print has no header. */ }
    (header || document.body).prepend(element);
  }

  function tableCodes(record) {
    return Object.keys(record || {}).filter(function (code) { return record[code] && record[code].type === 'SUBTABLE'; });
  }

  kintone.events.on(events, async function (event) {
    var current = ++generation;
    var recordAPI = event.type.startsWith('mobile.') ? kintone.mobile.app.record : kintone.app.record;
    clearMessage();
    var config;
    try { config = root.TableVisibility.parseConfig(kintone.plugin.app.getConfig(pluginId)); }
    catch (_) {
      tableCodes(event.record).forEach(function (code) { recordAPI.setFieldShown(code, false); });
      showMessage('設定を読み込めないため、この画面のすべてのテーブルを非表示にしました。アプリ管理者に設定の確認を依頼してください。', recordAPI);
      return event;
    }
    if (!config.rules.length) return event;
    var available = new Set(tableCodes(event.record));
    var active = config.rules.filter(function (rule) { return available.has(rule.tableCode); });
    var missing = active.length !== config.rules.length;
    // Hide immediately, before awaiting membership. Never change record values.
    active.forEach(function (rule) { recordAPI.setFieldShown(rule.tableCode, false); });
    if (!active.length) {
      showMessage('設定されたテーブルが見つかりません。フィールドコードとプラグイン設定を確認してください。', recordAPI);
      return event;
    }
    try {
      var user = kintone.getLoginUser();
      var membership = await root.TableVisibilityAPI.loadMembership(user && user.code, active);
      if (current !== generation) return event;
      active.forEach(function (rule) {
        if (root.TableVisibility.evaluate(rule, membership)) recordAPI.setFieldShown(rule.tableCode, true);
      });
      if (missing) showMessage('一部の対象テーブルが見つかりません。フィールドコードとプラグイン設定を確認してください。', recordAPI);
    } catch (_) {
      if (current !== generation) return event;
      active.forEach(function (rule) { recordAPI.setFieldShown(rule.tableCode, false); });
      showMessage('所属情報を確認できないため、対象テーブルを非表示にしています。通信状態を確認して画面を再読み込みしてください。ゲストユーザーには対応していません。', recordAPI);
    }
    return event;
  });

  // Prevent a previous detail request from updating a newer list/detail screen.
  kintone.events.on(['app.record.index.show', 'mobile.app.record.index.show'], function (event) {
    generation += 1;
    clearMessage();
    return event;
  });
})(globalThis, kintone.$PLUGIN_ID);
