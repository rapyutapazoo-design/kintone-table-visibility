(function () {
  'use strict';

  var root = document.getElementById('tv-config');
  if (!root) {
    return;
  }

  var elements = {
    loading: root.querySelector('#tv-loading'),
    content: root.querySelector('#tv-content'),
    status: root.querySelector('#tv-status'),
    error: root.querySelector('#tv-error'),
    rules: root.querySelector('#tv-rules'),
    empty: root.querySelector('#tv-empty'),
    add: root.querySelector('#tv-add-rule'),
    save: root.querySelector('#tv-save'),
    cancel: root.querySelector('#tv-cancel')
  };

  var state = {
    catalog: null,
    rules: [],
    busy: true,
    loadError: null,
    sequence: 0
  };

  function copyRule(rule) {
    return {
      id: ++state.sequence,
      tableCode: typeof rule.tableCode === 'string' ? rule.tableCode : '',
      allowOrganizations: copyOrganizations(rule.allowOrganizations),
      denyOrganizations: copyOrganizations(rule.denyOrganizations),
      allowGroups: copyCodes(rule.allowGroups),
      denyGroups: copyCodes(rule.denyGroups),
      defaultVisible: rule.defaultVisible === true
    };
  }

  function copyOrganizations(items) {
    return Array.isArray(items) ? items.map(function (item) {
      return {
        code: typeof item.code === 'string' ? item.code : '',
        includeDescendants: item.includeDescendants === true
      };
    }) : [];
  }

  function copyCodes(items) {
    return Array.isArray(items) ? items.filter(function (code) {
      return typeof code === 'string';
    }).slice() : [];
  }

  function newRule() {
    return copyRule({
      tableCode: '',
      allowOrganizations: [],
      denyOrganizations: [],
      allowGroups: [],
      denyGroups: [],
      defaultVisible: false
    });
  }

  function setBusy(busy, message) {
    state.busy = busy;
    root.setAttribute('aria-busy', String(busy));
    elements.add.disabled = busy || Boolean(state.loadError);
    elements.save.disabled = busy || Boolean(state.loadError);
    elements.cancel.disabled = busy;
    Array.prototype.forEach.call(root.querySelectorAll('button, input, select'), function (control) {
      if (!control.closest('.tv-actions') && control !== elements.cancel) {
        control.disabled = busy || Boolean(state.loadError);
      }
    });
    setStatus(message || '');
  }

  function setStatus(message) {
    elements.status.textContent = message;
  }

  function showError(message) {
    elements.error.textContent = message;
    elements.error.hidden = !message;
    if (message) {
      elements.error.scrollIntoView({ block: 'nearest' });
    }
  }

  function create(tag, className, text) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (typeof text === 'string') {
      node.textContent = text;
    }
    return node;
  }

  function createCheckbox(labelText, checked, onChange, missing) {
    var label = create('label', 'tv-option' + (missing ? ' tv-missing' : ''));
    var input = create('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', function () {
      onChange(input.checked);
    });
    label.appendChild(input);
    label.appendChild(create('span', '', labelText));
    return label;
  }

  function tableEntries() {
    var properties = state.catalog && state.catalog.properties ? state.catalog.properties : {};
    return Object.keys(properties).map(function (key) {
      return properties[key];
    }).filter(function (property) {
      return property && property.type === 'SUBTABLE';
    }).map(function (property) {
      return {
        code: property.code,
        label: property.label || property.code,
        fields: property.fields || {}
      };
    }).sort(function (a, b) {
      return a.label.localeCompare(b.label, 'ja');
    });
  }

  function findTable(code) {
    return tableEntries().find(function (table) {
      return table.code === code;
    });
  }

  function formatNamedCode(name, code) {
    return (name || code) + '（' + code + '）';
  }

  function missingText(kind, code) {
    return '削除済みの' + kind + '（' + code + '）';
  }

  function render() {
    elements.rules.textContent = '';
    state.rules.forEach(function (rule, index) {
      elements.rules.appendChild(renderRule(rule, index));
    });
    elements.empty.hidden = state.rules.length !== 0;
    setBusy(state.busy);
  }

  function renderRule(rule, index) {
    var article = create('article', 'tv-rule');
    article.dataset.ruleId = String(rule.id);

    var header = create('div', 'tv-rule-header');
    header.appendChild(create('h3', '', 'ルール ' + (index + 1)));
    var remove = create('button', 'tv-remove', '削除');
    remove.type = 'button';
    remove.setAttribute('aria-label', 'ルール ' + (index + 1) + ' を削除');
    remove.addEventListener('click', function () {
      state.rules = state.rules.filter(function (candidate) {
        return candidate.id !== rule.id;
      });
      showError('');
      render();
    });
    header.appendChild(remove);
    article.appendChild(header);

    var body = create('div', 'tv-rule-body');
    body.appendChild(renderTableField(rule, index));

    var grid = create('div', 'tv-access-grid');
    grid.appendChild(renderAccessColumn(rule, 'allow', '表示を許可'));
    grid.appendChild(renderAccessColumn(rule, 'deny', '表示を拒否'));
    body.appendChild(grid);
    body.appendChild(renderDefaultField(rule, index));
    article.appendChild(body);
    return article;
  }

  function renderTableField(rule, index) {
    var field = create('div', 'tv-field');
    var id = 'tv-table-' + rule.id;
    var label = create('label', 'tv-label', '対象テーブル');
    label.htmlFor = id;
    label.appendChild(create('span', 'tv-required', '必須'));
    field.appendChild(label);

    var select = create('select');
    select.id = id;
    select.required = true;
    select.setAttribute('aria-describedby', id + '-advisory');
    var placeholder = create('option', '', 'テーブルを選択してください');
    placeholder.value = '';
    select.appendChild(placeholder);

    var tables = tableEntries();
    var exists = !rule.tableCode || tables.some(function (table) { return table.code === rule.tableCode; });
    if (!exists) {
      var missing = create('option', '', missingText('テーブル', rule.tableCode));
      missing.value = rule.tableCode;
      missing.className = 'tv-missing';
      select.appendChild(missing);
    }

    var used = state.rules.map(function (candidate) { return candidate.tableCode; });
    tables.forEach(function (table) {
      var option = create('option', '', formatNamedCode(table.label, table.code));
      option.value = table.code;
      option.disabled = table.code !== rule.tableCode && used.indexOf(table.code) !== -1;
      select.appendChild(option);
    });
    select.value = rule.tableCode;
    select.addEventListener('change', function () {
      rule.tableCode = select.value;
      showError('');
      render();
    });
    field.appendChild(select);

    var advisory = create('p', 'tv-advisory');
    advisory.id = id + '-advisory';
    var selected = findTable(rule.tableCode);
    if (!rule.tableCode) {
      advisory.textContent = 'テーブルを選ぶと、テーブル内の必須フィールドを確認できます。';
    } else if (!selected) {
      advisory.textContent = 'このテーブルは現在のフォームに存在しません。別のテーブルを選択してください。';
      advisory.classList.add('tv-missing');
    } else {
      var requiredFields = Object.keys(selected.fields).map(function (key) {
        return selected.fields[key];
      }).filter(function (subField) {
        return subField && subField.required === true;
      }).map(function (subField) {
        return formatNamedCode(subField.label || subField.code, subField.code);
      });
      advisory.textContent = requiredFields.length
        ? 'テーブル内の必須フィールド: ' + requiredFields.join('、') + '。非表示でも入力が必須のため、新規追加・編集で保存できるか確認してください。'
        : 'テーブル内に必須フィールドはありません。この表示は確認用です。';
    }
    field.appendChild(advisory);
    return field;
  }

  function renderAccessColumn(rule, prefix, title) {
    var fieldset = create('fieldset', 'tv-access-column');
    fieldset.appendChild(create('legend', '', title));
    var orgKey = prefix + 'Organizations';
    var groupKey = prefix + 'Groups';
    fieldset.appendChild(renderOrganizationPicker(rule, orgKey, title + 'する組織'));
    fieldset.appendChild(renderGroupPicker(rule, groupKey, title + 'するグループ'));
    return fieldset;
  }

  function renderOrganizationPicker(rule, key, title) {
    var organizations = Array.isArray(state.catalog.organizations) ? state.catalog.organizations : [];
    var picker = create('div', 'tv-picker');
    var searchId = 'tv-' + key + '-search-' + rule.id;
    var label = create('label', 'tv-picker-label', title);
    label.htmlFor = searchId;
    picker.appendChild(label);
    var search = create('input');
    search.type = 'search';
    search.id = searchId;
    search.placeholder = '組織名・コードで検索';
    picker.appendChild(search);
    var options = create('div', 'tv-options');
    options.setAttribute('role', 'group');
    options.setAttribute('aria-label', title + 'の選択肢');
    picker.appendChild(options);
    var details = create('div', 'tv-org-details');
    picker.appendChild(details);

    function drawOptions() {
      var query = search.value.trim().toLocaleLowerCase('ja');
      options.textContent = '';
      var knownCodes = organizations.map(function (organization) { return organization.code; });
      var selectedMissing = rule[key].filter(function (item) {
        return knownCodes.indexOf(item.code) === -1;
      }).map(function (item) {
        return { code: item.code, name: missingText('組織', item.code), missing: true };
      });
      var candidates = organizations.map(function (organization) {
        return { code: organization.code, name: organization.name || organization.code, missing: false };
      }).concat(selectedMissing).filter(function (organization) {
        return !query || (organization.name + ' ' + organization.code).toLocaleLowerCase('ja').indexOf(query) !== -1;
      });
      if (!candidates.length) {
        options.appendChild(create('p', 'tv-no-results', '該当する組織がありません。'));
      }
      candidates.forEach(function (organization) {
        var selected = rule[key].some(function (item) { return item.code === organization.code; });
        options.appendChild(createCheckbox(
          organization.missing ? organization.name : formatNamedCode(organization.name, organization.code),
          selected,
          function (checked) {
            if (checked) {
              rule[key].push({ code: organization.code, includeDescendants: false });
            } else {
              rule[key] = rule[key].filter(function (item) { return item.code !== organization.code; });
            }
            drawDetails();
          },
          organization.missing
        ));
      });
    }

    function drawDetails() {
      details.textContent = '';
      rule[key].forEach(function (selected) {
        var found = organizations.find(function (organization) { return organization.code === selected.code; });
        var card = create('div', 'tv-selected-org' + (found ? '' : ' tv-missing'));
        card.appendChild(create('span', 'tv-selected-name', found
          ? formatNamedCode(found.name || found.code, found.code)
          : missingText('組織', selected.code)));
        var descendantLabel = create('label', 'tv-descendant-option');
        var checkbox = create('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selected.includeDescendants;
        checkbox.addEventListener('change', function () {
          selected.includeDescendants = checkbox.checked;
        });
        descendantLabel.appendChild(checkbox);
        descendantLabel.appendChild(create('span', '', '下位組織も含める'));
        card.appendChild(descendantLabel);
        details.appendChild(card);
      });
    }

    search.addEventListener('input', drawOptions);
    drawOptions();
    drawDetails();
    return picker;
  }

  function renderGroupPicker(rule, key, title) {
    var groups = Array.isArray(state.catalog.groups) ? state.catalog.groups : [];
    var picker = create('div', 'tv-picker');
    var searchId = 'tv-' + key + '-search-' + rule.id;
    var label = create('label', 'tv-picker-label', title);
    label.htmlFor = searchId;
    picker.appendChild(label);
    var search = create('input');
    search.type = 'search';
    search.id = searchId;
    search.placeholder = 'グループ名・コードで検索';
    picker.appendChild(search);
    var options = create('div', 'tv-options');
    options.setAttribute('role', 'group');
    options.setAttribute('aria-label', title + 'の選択肢');
    picker.appendChild(options);

    function drawOptions() {
      var query = search.value.trim().toLocaleLowerCase('ja');
      options.textContent = '';
      var knownCodes = groups.map(function (group) { return group.code; });
      var selectedMissing = rule[key].filter(function (code) {
        return knownCodes.indexOf(code) === -1;
      }).map(function (code) {
        return { code: code, name: missingText('グループ', code), missing: true };
      });
      var candidates = groups.map(function (group) {
        return { code: group.code, name: group.name || group.code, missing: false };
      }).concat(selectedMissing).filter(function (group) {
        return !query || (group.name + ' ' + group.code).toLocaleLowerCase('ja').indexOf(query) !== -1;
      });
      if (!candidates.length) {
        options.appendChild(create('p', 'tv-no-results', '該当するグループがありません。'));
      }
      candidates.forEach(function (group) {
        options.appendChild(createCheckbox(
          group.missing ? group.name : formatNamedCode(group.name, group.code),
          rule[key].indexOf(group.code) !== -1,
          function (checked) {
            if (checked) {
              rule[key].push(group.code);
            } else {
              rule[key] = rule[key].filter(function (code) { return code !== group.code; });
            }
          },
          group.missing
        ));
      });
    }

    search.addEventListener('input', drawOptions);
    drawOptions();
    return picker;
  }

  function renderDefaultField(rule, index) {
    var row = create('div', 'tv-default-row');
    var field = create('div', 'tv-field');
    var id = 'tv-default-' + rule.id;
    var label = create('label', 'tv-label', 'その他の利用者');
    label.htmlFor = id;
    field.appendChild(label);
    var select = create('select');
    select.id = id;
    var hidden = create('option', '', '非表示');
    hidden.value = 'false';
    var visible = create('option', '', '表示');
    visible.value = 'true';
    select.appendChild(hidden);
    select.appendChild(visible);
    select.value = String(rule.defaultVisible);
    select.addEventListener('change', function () {
      rule.defaultVisible = select.value === 'true';
    });
    field.appendChild(select);
    row.appendChild(field);
    row.appendChild(create('p', 'tv-default-description', '許可・拒否のどちらにも該当しない利用者への初期表示です。初期値は「非表示」です。'));
    return row;
  }

  function serializableConfig() {
    return {
      version: 1,
      rules: state.rules.map(function (rule) {
        return {
          tableCode: rule.tableCode,
          allowOrganizations: copyOrganizations(rule.allowOrganizations),
          denyOrganizations: copyOrganizations(rule.denyOrganizations),
          allowGroups: copyCodes(rule.allowGroups),
          denyGroups: copyCodes(rule.denyGroups),
          defaultVisible: rule.defaultVisible
        };
      })
    };
  }

  function catalogValidationErrors(config) {
    var errors = [];
    var tables = tableEntries().map(function (table) { return table.code; });
    var organizations = (state.catalog.organizations || []).map(function (item) { return item.code; });
    var groups = (state.catalog.groups || []).map(function (item) { return item.code; });
    var seenTables = new Set();

    config.rules.forEach(function (rule, index) {
      var number = index + 1;
      if (!rule.tableCode) {
        errors.push('ルール ' + number + ': 対象テーブルを選択してください。');
      } else if (tables.indexOf(rule.tableCode) === -1) {
        errors.push('ルール ' + number + ': 対象テーブル「' + rule.tableCode + '」は現在のフォームに存在しません。');
      } else if (seenTables.has(rule.tableCode)) {
        errors.push('ルール ' + number + ': 同じ対象テーブルを複数のルールに設定できません。');
      }
      seenTables.add(rule.tableCode);

      ['allowOrganizations', 'denyOrganizations'].forEach(function (key) {
        rule[key].forEach(function (item) {
          if (organizations.indexOf(item.code) === -1) {
            errors.push('ルール ' + number + ': 組織「' + item.code + '」は現在の組織一覧に存在しません。');
          }
        });
      });
      ['allowGroups', 'denyGroups'].forEach(function (key) {
        rule[key].forEach(function (code) {
          if (groups.indexOf(code) === -1) {
            errors.push('ルール ' + number + ': グループ「' + code + '」は現在のグループ一覧に存在しません。');
          }
        });
      });
    });
    return errors;
  }

  function save() {
    showError('');
    var config = serializableConfig();
    var errors = catalogValidationErrors(config);
    try {
      window.TableVisibility.validateConfig(config);
    } catch (error) {
      errors.push(error && error.message ? error.message : '設定内容を確認してください。');
    }
    if (errors.length) {
      showError(errors.join('\n'));
      setStatus('保存できませんでした。赤いメッセージの内容を確認してください。');
      return;
    }

    setBusy(true, '設定を保存しています…');
    try {
      kintone.plugin.app.setConfig({ settings: JSON.stringify(config) }, function () {
        setBusy(false, '保存しました。設定を反映するには、アプリを更新してください。');
      });
    } catch (error) {
      setBusy(false, '');
      showError('設定を保存できませんでした。' + (error && error.message ? ' ' + error.message : ''));
    }
  }

  function pluginListUrl(appId) {
    var match = window.location.pathname.match(/^\/k\/guest\/(\d+)\//);
    var prefix = match ? '/k/guest/' + match[1] : '/k';
    return prefix + '/admin/app/' + encodeURIComponent(String(appId)) + '/plugin/';
  }

  function initialize() {
    var appId = kintone.app.getId();
    elements.cancel.addEventListener('click', function () {
      window.location.href = pluginListUrl(appId);
    });
    var rawConfig = kintone.plugin.app.getConfig(kintone.$PLUGIN_ID) || {};
    var parsed;
    try {
      parsed = window.TableVisibility.parseConfig(rawConfig);
    } catch (error) {
      state.loadError = error;
      elements.loading.hidden = true;
      elements.content.hidden = false;
      showError('保存済み設定を読み込めませんでした。設定データを確認してください。' + (error && error.message ? ' ' + error.message : ''));
      setBusy(false);
      return;
    }

    window.TableVisibilityAPI.loadCatalog(appId).then(function (catalog) {
      state.catalog = catalog;
      state.rules = parsed.rules.map(copyRule);
      if (!state.rules.length) {
        state.rules.push(newRule());
      }
      state.busy = false;
      elements.loading.hidden = true;
      elements.content.hidden = false;
      render();
    }).catch(function (error) {
      state.loadError = error;
      state.busy = false;
      elements.loading.hidden = true;
      elements.content.hidden = false;
      showError('設定に必要な情報を読み込めませんでした。ページを再読み込みしてください。' + (error && error.message ? ' ' + error.message : ''));
      setBusy(false);
    });
  }

  elements.add.addEventListener('click', function () {
    state.rules.push(newRule());
    showError('');
    render();
    var cards = elements.rules.querySelectorAll('.tv-rule');
    var last = cards[cards.length - 1];
    if (last) {
      last.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var select = last.querySelector('select');
      if (select) {
        select.focus({ preventScroll: true });
      }
    }
  });
  elements.save.addEventListener('click', save);

  initialize();
}());
