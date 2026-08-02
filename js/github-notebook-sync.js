(function (window, document) {
  'use strict';

  var CONFIG_KEY = 'github_notebook_sync_config_v1';
  var TOKEN_KEY = 'github_notebook_sync_token_v1';
  var STATUS_KEY = 'github_notebook_sync_status_v1';
  var DEFAULT_PATH = 'user-data/study-notes.json';
  var DEFAULT_INTERVAL = 15;
  var API_VERSION = '2022-11-28';
  var initialized = false;
  var config = {};
  var encryptedToken = null;
  var unlockedToken = '';
  var syncTimer = null;
  var debounceTimer = null;
  var syncing = false;
  var dirty = false;
  var lastStatus = {};
  var options = {};

  function element(id) {
    return document.getElementById(id);
  }

  function text(value) {
    return String(value === null || value === undefined ? '' : value);
  }

  function trim(value) {
    return text(value).replace(/^\s+|\s+$/g, '');
  }

  function toast(message, duration) {
    if (options.toast) {
      options.toast(message, duration);
    }
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function defaultConfig() {
    var owner = '';
    var repo = '';
    var host = window.location.hostname || '';
    var pathParts = (window.location.pathname || '').split('/');
    if (/\.github\.io$/i.test(host)) {
      owner = host.split('.')[0];
      repo = pathParts.length > 1 ? pathParts[1] : '';
    }
    return {
      owner: owner,
      repo: repo,
      branch: 'main',
      path: DEFAULT_PATH,
      intervalMinutes: DEFAULT_INTERVAL,
      autoSync: true,
      syncOnChange: true,
      updatedAt: nowIso()
    };
  }

  function readConfig() {
    var saved = window.HanziStorage.readJSON(CONFIG_KEY, null);
    var defaults = defaultConfig();
    config = saved && typeof saved === 'object' ? saved : defaults;
    if (!config.owner) { config.owner = defaults.owner; }
    if (!config.repo) { config.repo = defaults.repo; }
    if (!config.branch) { config.branch = 'main'; }
    if (!config.path) { config.path = DEFAULT_PATH; }
    if (!config.intervalMinutes) { config.intervalMinutes = DEFAULT_INTERVAL; }
    if (config.autoSync === undefined) { config.autoSync = true; }
    if (config.syncOnChange === undefined) { config.syncOnChange = true; }
    encryptedToken = window.HanziStorage.readJSON(TOKEN_KEY, null);
    lastStatus = window.HanziStorage.readJSON(STATUS_KEY, {}) || {};
  }

  function saveConfig() {
    config.updatedAt = nowIso();
    window.HanziStorage.writeJSON(CONFIG_KEY, config);
  }

  function saveStatus(status) {
    lastStatus = status || {};
    window.HanziStorage.writeJSON(STATUS_KEY, lastStatus);
    renderStatus();
  }

  function arrayBufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    var chunk = 0x8000;
    var i;
    for (i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    }
    return window.btoa(binary);
  }

  function base64ToUint8(value) {
    var binary = window.atob(text(value).replace(/\s/g, ''));
    var bytes = new Uint8Array(binary.length);
    var i;
    for (i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function utf8ToBase64(value) {
    return arrayBufferToBase64(new TextEncoder().encode(text(value)));
  }

  function base64ToUtf8(value) {
    return new TextDecoder('utf-8').decode(base64ToUint8(value));
  }

  function randomBytes(length) {
    var bytes = new Uint8Array(length);
    window.crypto.getRandomValues(bytes);
    return bytes;
  }

  function deriveKey(passphrase, salt, usages) {
    return window.crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    ).then(function (material) {
      return window.crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 180000,
          hash: 'SHA-256'
        },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        usages
      );
    });
  }

  function encryptToken(token, passphrase) {
    var salt = randomBytes(16);
    var iv = randomBytes(12);
    if (!window.crypto || !window.crypto.subtle) {
      return Promise.reject(new Error('Trình duyệt không hỗ trợ mã hóa Web Crypto.'));
    }
    return deriveKey(passphrase, salt, ['encrypt']).then(function (key) {
      return window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        new TextEncoder().encode(token)
      );
    }).then(function (encrypted) {
      return {
        version: 1,
        salt: arrayBufferToBase64(salt),
        iv: arrayBufferToBase64(iv),
        data: arrayBufferToBase64(encrypted),
        createdAt: nowIso()
      };
    });
  }

  function decryptToken(payload, passphrase) {
    var salt;
    var iv;
    var encrypted;
    if (!payload || !payload.salt || !payload.iv || !payload.data) {
      return Promise.reject(new Error('Chưa có token được lưu.'));
    }
    if (!window.crypto || !window.crypto.subtle) {
      return Promise.reject(new Error('Trình duyệt không hỗ trợ mã hóa Web Crypto.'));
    }
    salt = base64ToUint8(payload.salt);
    iv = base64ToUint8(payload.iv);
    encrypted = base64ToUint8(payload.data);
    return deriveKey(passphrase, salt, ['decrypt']).then(function (key) {
      return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, encrypted);
    }).then(function (plain) {
      return new TextDecoder('utf-8').decode(plain);
    }).catch(function () {
      throw new Error('Mật khẩu mở khóa không đúng hoặc dữ liệu token bị hỏng.');
    });
  }

  function apiHeaders(token) {
    return {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + token,
      'X-GitHub-Api-Version': API_VERSION,
      'Content-Type': 'application/json'
    };
  }

  function encodePath(path) {
    return trim(path).split('/').map(function (part) {
      return encodeURIComponent(part);
    }).join('/');
  }

  function apiUrl() {
    return 'https://api.github.com/repos/' + encodeURIComponent(config.owner) + '/' + encodeURIComponent(config.repo) + '/contents/' + encodePath(config.path) + '?ref=' + encodeURIComponent(config.branch);
  }

  function parseApiError(response, fallback) {
    return response.text().then(function (body) {
      var message = fallback || ('GitHub trả về lỗi ' + String(response.status));
      var parsed;
      try {
        parsed = JSON.parse(body);
        if (parsed && parsed.message) {
          message = parsed.message;
        }
      } catch (error) {
        // Giữ nội dung mặc định.
      }
      throw new Error(message + ' (HTTP ' + String(response.status) + ')');
    });
  }

  function getRemoteFile() {
    return fetch(apiUrl(), {
      method: 'GET',
      headers: apiHeaders(unlockedToken),
      cache: 'no-store'
    }).then(function (response) {
      if (response.status === 404) {
        return { exists: false, sha: '', payload: null };
      }
      if (!response.ok) {
        return parseApiError(response, 'Không đọc được file sổ tay trên GitHub.');
      }
      return response.json().then(function (data) {
        var payload = null;
        try {
          payload = JSON.parse(base64ToUtf8(data.content || ''));
        } catch (error) {
          throw new Error('File trên GitHub không phải JSON sổ tay hợp lệ.');
        }
        return { exists: true, sha: data.sha || '', payload: payload };
      });
    });
  }

  function putRemoteFile(payload, sha) {
    var body = {
      message: 'Đồng bộ sổ tay tiếng Trung ' + new Date().toLocaleString('vi-VN'),
      content: utf8ToBase64(JSON.stringify(payload, null, 2)),
      branch: config.branch
    };
    if (sha) {
      body.sha = sha;
    }
    return fetch(apiUrl().replace(/\?ref=.*$/, ''), {
      method: 'PUT',
      headers: apiHeaders(unlockedToken),
      body: JSON.stringify(body)
    }).then(function (response) {
      if (!response.ok) {
        return parseApiError(response, 'Không ghi được file sổ tay lên GitHub.');
      }
      return response.json();
    });
  }

  function validateConfig() {
    if (!trim(config.owner) || !trim(config.repo)) {
      throw new Error('Hãy nhập tài khoản và repository GitHub.');
    }
    if (!trim(config.branch) || !trim(config.path)) {
      throw new Error('Hãy nhập branch và đường dẫn file đồng bộ.');
    }
    if (!unlockedToken) {
      throw new Error('Hãy mở khóa token GitHub trước.');
    }
  }

  function doSync(attempt) {
    var localBefore;
    var merged;
    validateConfig();
    localBefore = window.HanziStudyReference.exportSyncState();
    return getRemoteFile().then(function (remote) {
      merged = window.HanziStudyReference.mergeSyncPayload(localBefore, remote.payload || {});
      window.HanziStudyReference.importSyncState(merged, true);
      merged = window.HanziStudyReference.exportSyncState();
      merged.syncedAt = nowIso();
      merged.syncTarget = {
        owner: config.owner,
        repo: config.repo,
        branch: config.branch,
        path: config.path
      };
      return putRemoteFile(merged, remote.sha);
    }).catch(function (error) {
      if (attempt < 2 && /HTTP 409/.test(error.message || '')) {
        return doSync(attempt + 1);
      }
      throw error;
    });
  }

  function syncNow(source) {
    if (syncing) {
      return Promise.resolve(false);
    }
    syncing = true;
    renderStatus('Đang đồng bộ…', 'working');
    return doSync(0).then(function () {
      dirty = false;
      saveStatus({
        ok: true,
        at: nowIso(),
        source: source || 'manual',
        target: config.owner + '/' + config.repo + '/' + config.path
      });
      toast('Đã đồng bộ sổ tay lên GitHub.', 2800);
      return true;
    }).catch(function (error) {
      saveStatus({ ok: false, at: nowIso(), error: error.message || String(error) });
      toast('Đồng bộ GitHub thất bại: ' + (error.message || String(error)), 4800);
      throw error;
    }).then(function (result) {
      syncing = false;
      renderStatus();
      return result;
    }, function (error) {
      syncing = false;
      renderStatus();
      throw error;
    });
  }

  function clearTimers() {
    if (syncTimer) {
      window.clearInterval(syncTimer);
      syncTimer = null;
    }
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  function scheduleTimers() {
    clearTimers();
    if (!unlockedToken || !config.autoSync) {
      return;
    }
    syncTimer = window.setInterval(function () {
      if (dirty && document.visibilityState !== 'hidden') {
        syncNow('interval').catch(function () {});
      }
    }, Math.max(5, Number(config.intervalMinutes || DEFAULT_INTERVAL)) * 60 * 1000);
  }

  function markDirty() {
    dirty = true;
    renderStatus();
    if (!unlockedToken || !config.autoSync || !config.syncOnChange) {
      return;
    }
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
    }
    debounceTimer = window.setTimeout(function () {
      if (dirty && document.visibilityState !== 'hidden') {
        syncNow('change').catch(function () {});
      }
    }, 45000);
  }

  function statusText() {
    if (syncing) {
      return 'Đang đồng bộ với GitHub…';
    }
    if (!encryptedToken) {
      return 'Chưa thiết lập token GitHub.';
    }
    if (!unlockedToken) {
      return 'Đã lưu token mã hóa · cần mở khóa sau mỗi lần mở ứng dụng.';
    }
    if (dirty) {
      return 'Có thay đổi chưa đồng bộ.';
    }
    if (lastStatus && lastStatus.ok && lastStatus.at) {
      return 'Đã đồng bộ lúc ' + new Date(lastStatus.at).toLocaleString('vi-VN') + '.';
    }
    if (lastStatus && lastStatus.error) {
      return 'Lần đồng bộ gần nhất lỗi: ' + lastStatus.error;
    }
    return 'Đã mở khóa · sẵn sàng đồng bộ.';
  }

  function renderStatus(message, state) {
    var node = element('githubNotebookSyncStatus');
    var badge = element('githubNotebookSyncBadge');
    var unlockButton = element('githubNotebookUnlockButton');
    var syncButton = element('githubNotebookSyncNowButton');
    if (node) {
      node.textContent = message || statusText();
      node.setAttribute('data-state', state || (syncing ? 'working' : (lastStatus.ok ? 'ok' : (lastStatus.error ? 'error' : 'idle'))));
    }
    if (badge) {
      badge.textContent = unlockedToken ? 'Đã mở khóa' : (encryptedToken ? 'Đang khóa' : 'Chưa cấu hình');
      badge.setAttribute('data-state', unlockedToken ? 'ok' : 'idle');
    }
    if (unlockButton) {
      unlockButton.textContent = unlockedToken ? 'Khóa token' : 'Mở khóa';
    }
    if (syncButton) {
      syncButton.disabled = !unlockedToken || syncing;
    }
  }

  function fillForm() {
    element('githubSyncOwnerInput').value = config.owner || '';
    element('githubSyncRepoInput').value = config.repo || '';
    element('githubSyncBranchInput').value = config.branch || 'main';
    element('githubSyncPathInput').value = config.path || DEFAULT_PATH;
    element('githubSyncIntervalSelect').value = String(config.intervalMinutes || DEFAULT_INTERVAL);
    element('githubSyncAutoCheckbox').checked = !!config.autoSync;
    element('githubSyncOnChangeCheckbox').checked = !!config.syncOnChange;
    element('githubSyncTokenInput').value = '';
    element('githubSyncPassphraseInput').value = '';
  }

  function readFormConfig() {
    config.owner = trim(element('githubSyncOwnerInput').value);
    config.repo = trim(element('githubSyncRepoInput').value);
    config.branch = trim(element('githubSyncBranchInput').value) || 'main';
    config.path = trim(element('githubSyncPathInput').value) || DEFAULT_PATH;
    config.intervalMinutes = Number(element('githubSyncIntervalSelect').value || DEFAULT_INTERVAL);
    config.autoSync = !!element('githubSyncAutoCheckbox').checked;
    config.syncOnChange = !!element('githubSyncOnChangeCheckbox').checked;
  }

  function saveConnection() {
    var token = trim(element('githubSyncTokenInput').value);
    var passphrase = element('githubSyncPassphraseInput').value;
    readFormConfig();
    if (!token && encryptedToken) {
      saveConfig();
      scheduleTimers();
      renderStatus();
      toast('Đã cập nhật thiết lập đồng bộ.');
      return Promise.resolve(true);
    }
    if (!token) {
      return Promise.reject(new Error('Hãy nhập fine-grained token GitHub.'));
    }
    if (passphrase.length < 6) {
      return Promise.reject(new Error('Mật khẩu mã hóa token cần ít nhất 6 ký tự.'));
    }
    return encryptToken(token, passphrase).then(function (payload) {
      encryptedToken = payload;
      unlockedToken = token;
      window.HanziStorage.writeJSON(TOKEN_KEY, encryptedToken);
      saveConfig();
      element('githubSyncTokenInput').value = '';
      scheduleTimers();
      renderStatus();
      toast('Đã lưu token dưới dạng mã hóa trên thiết bị.', 3000);
      return true;
    });
  }

  function unlockOrLock() {
    var passphrase;
    if (unlockedToken) {
      unlockedToken = '';
      clearTimers();
      renderStatus();
      toast('Đã khóa token GitHub.');
      return Promise.resolve(false);
    }
    passphrase = element('githubSyncPassphraseInput').value;
    if (!passphrase) {
      return Promise.reject(new Error('Hãy nhập mật khẩu mở khóa token.'));
    }
    return decryptToken(encryptedToken, passphrase).then(function (token) {
      unlockedToken = token;
      scheduleTimers();
      renderStatus();
      toast('Đã mở khóa token GitHub.');
      if (config.autoSync) {
        return syncNow('unlock').catch(function () { return false; });
      }
      return true;
    });
  }

  function disconnect() {
    if (!window.confirm('Xóa token GitHub và ngừng tự động đồng bộ trên thiết bị này?')) {
      return;
    }
    unlockedToken = '';
    encryptedToken = null;
    clearTimers();
    window.HanziStorage.remove(TOKEN_KEY);
    saveStatus({});
    fillForm();
    renderStatus();
    toast('Đã ngắt kết nối GitHub.');
  }

  function bindEvents() {
    element('githubNotebookSaveConnectionButton').addEventListener('click', function () {
      saveConnection().catch(function (error) {
        toast(error.message || String(error), 4200);
      });
    }, false);
    element('githubNotebookUnlockButton').addEventListener('click', function () {
      unlockOrLock().catch(function (error) {
        toast(error.message || String(error), 4200);
      });
    }, false);
    element('githubNotebookSyncNowButton').addEventListener('click', function () {
      readFormConfig();
      saveConfig();
      syncNow('manual').catch(function () {});
    }, false);
    element('githubNotebookDisconnectButton').addEventListener('click', disconnect, false);
    document.addEventListener('hanzi-notebook-changed', markDirty, false);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && unlockedToken && config.autoSync && dirty) {
        syncNow('visible').catch(function () {});
      }
    }, false);
    window.addEventListener('online', function () {
      if (unlockedToken && config.autoSync && dirty) {
        syncNow('online').catch(function () {});
      }
    }, false);
  }

  function init(initOptions) {
    if (initialized) {
      return;
    }
    options = initOptions || {};
    readConfig();
    fillForm();
    bindEvents();
    renderStatus();
    initialized = true;
  }

  window.HanziGithubNotebookSync = {
    init: init,
    syncNow: syncNow,
    markDirty: markDirty,
    isUnlocked: function () { return !!unlockedToken; },
    getConfig: function () { return window.HanziStorage.clone(config); },
    _test: {
      encryptToken: encryptToken,
      decryptToken: decryptToken,
      utf8ToBase64: utf8ToBase64,
      base64ToUtf8: base64ToUtf8,
      setToken: function (token) { unlockedToken = token; },
      setConfig: function (next) { config = next; },
      getDirty: function () { return dirty; }
    }
  };
})(window, document);
