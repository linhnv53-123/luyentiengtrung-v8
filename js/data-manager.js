(function (window, document) {
  'use strict';

  var state = {
    db: null,
    defaultDb: null,
    onChange: null,
    toast: null,
    onSync: null,
    editingNew: false,
    syncing: false
  };

  function element(id) {
    return document.getElementById(id);
  }

  function notify(message, duration) {
    if (state.toast) {
      state.toast(message, duration);
    }
  }

  function bodyModalState() {
    var dataOpen = !element('dataModal').hidden;
    var helpOpen = !element('helpModal').hidden;
    if (dataOpen || helpOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
  }

  function openModal() {
    var modal = element('dataModal');
    populateLessonSelect();
    if (state.db.lessons.length) {
      loadLesson(element('editLessonSelect').value || state.db.lessons[0].id);
    }
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    bodyModalState();
  }

  function closeModal() {
    var modal = element('dataModal');
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    bodyModalState();
  }

  function populateLessonSelect(preferredId) {
    var select = element('editLessonSelect');
    var previous = preferredId || select.value;
    var i;
    var option;
    select.innerHTML = '';
    for (i = 0; i < state.db.lessons.length; i += 1) {
      option = document.createElement('option');
      option.value = state.db.lessons[i].id;
      option.textContent = state.db.lessons[i].title + ' (' + String(state.db.lessons[i].words.length) + ' từ)';
      select.appendChild(option);
    }
    if (previous) {
      select.value = previous;
    }
    if (!select.value && select.options.length) {
      select.selectedIndex = 0;
    }
  }

  function lessonToText(lesson) {
    var lines = [];
    var i;
    for (i = 0; i < lesson.words.length; i += 1) {
      lines.push(lesson.words[i].h + ' | ' + lesson.words[i].p + ' | ' + lesson.words[i].m);
    }
    return lines.join('\n');
  }

  function findLesson(id) {
    var i;
    for (i = 0; i < state.db.lessons.length; i += 1) {
      if (state.db.lessons[i].id === id) {
        return state.db.lessons[i];
      }
    }
    return null;
  }

  function loadLesson(id) {
    var lesson = findLesson(id) || state.db.lessons[0];
    if (!lesson) {
      return;
    }
    state.editingNew = false;
    element('editLessonSelect').value = lesson.id;
    element('lessonIdInput').value = lesson.id;
    element('lessonTitleInput').value = lesson.title;
    element('lessonWordsInput').value = lessonToText(lesson);
  }

  function parseLessonLines(rawText) {
    var lines = String(rawText || '').split(/\r?\n/);
    var words = [];
    var errors = [];
    var i;
    var line;
    var parts;
    var meaningParts;

    for (i = 0; i < lines.length; i += 1) {
      line = lines[i].replace(/^\s+|\s+$/g, '');
      if (!line || line.charAt(0) === '#') {
        continue;
      }
      parts = line.indexOf('|') >= 0 ? line.split('|') : line.split('\t');
      if (parts.length < 3) {
        errors.push(i + 1);
        continue;
      }
      parts[0] = parts[0].replace(/^\s+|\s+$/g, '');
      parts[1] = parts[1].replace(/^\s+|\s+$/g, '');
      meaningParts = parts.slice(2);
      if (!parts[0]) {
        errors.push(i + 1);
        continue;
      }
      words.push({
        h: parts[0],
        p: parts[1],
        m: meaningParts.join(' | ').replace(/^\s+|\s+$/g, '')
      });
    }

    return { words: words, errors: errors };
  }

  function nextLessonIdentity() {
    var n = 13;
    var id = 'B' + String(n);
    while (findLesson(id)) {
      n += 1;
      id = 'B' + String(n);
    }
    return { id: id, title: 'Bài ' + String(n) };
  }

  function newLesson() {
    var identity = nextLessonIdentity();
    state.editingNew = true;
    element('lessonIdInput').value = identity.id;
    element('lessonTitleInput').value = identity.title;
    element('lessonWordsInput').value = '';
    element('lessonWordsInput').focus();
    notify('Đang tạo bài mới. Nhập từ rồi bấm “Lưu bài”.');
  }

  function saveLesson() {
    var oldId = state.editingNew ? '' : element('editLessonSelect').value;
    var id = element('lessonIdInput').value.replace(/^\s+|\s+$/g, '');
    var title = element('lessonTitleInput').value.replace(/^\s+|\s+$/g, '');
    var parsed = parseLessonLines(element('lessonWordsInput').value);
    var i;
    var existing;
    var lesson;

    if (!id) {
      notify('Mã bài không được để trống.', 2500);
      return;
    }
    if (!title) {
      title = id;
    }
    if (parsed.errors.length) {
      notify('Sai định dạng ở dòng: ' + parsed.errors.slice(0, 8).join(', '), 3500);
      return;
    }
    if (!parsed.words.length) {
      notify('Bài học chưa có từ vựng.', 2500);
      return;
    }

    existing = findLesson(id);
    if (existing && id !== oldId) {
      notify('Mã bài đã tồn tại.', 2500);
      return;
    }

    lesson = { id: id, title: title, words: parsed.words };

    if (state.editingNew) {
      state.db.lessons.push(lesson);
    } else {
      for (i = 0; i < state.db.lessons.length; i += 1) {
        if (state.db.lessons[i].id === oldId) {
          state.db.lessons[i] = lesson;
          break;
        }
      }
    }

    state.db = window.HanziReview.enrichDatabase(window.HanziReview.normalizeDatabase(state.db));
    state.editingNew = false;
    populateLessonSelect(id);
    loadLesson(id);
    if (state.onChange) {
      state.onChange(state.db, 'save');
    }
    notify('Đã lưu ' + title + '.');
  }

  function deleteLesson() {
    var id = element('editLessonSelect').value;
    var lesson = findLesson(id);
    var output = [];
    var i;

    if (!lesson) {
      return;
    }
    if (state.db.lessons.length <= 1) {
      notify('Cần giữ lại ít nhất một bài học.', 2500);
      return;
    }
    if (!window.confirm('Xóa ' + lesson.title + '?')) {
      return;
    }

    for (i = 0; i < state.db.lessons.length; i += 1) {
      if (state.db.lessons[i].id !== id) {
        output.push(state.db.lessons[i]);
      }
    }
    state.db.lessons = output;
    state.db = window.HanziReview.enrichDatabase(window.HanziReview.normalizeDatabase(state.db));
    populateLessonSelect(state.db.lessons[0].id);
    loadLesson(state.db.lessons[0].id);
    if (state.onChange) {
      state.onChange(state.db, 'delete');
    }
    notify('Đã xóa bài học.');
  }

  function mergeDatabases(current, incoming) {
    var output = window.HanziStorage.clone(window.HanziReview.cleanDatabase(current));
    var i;
    var j;
    var found;

    for (i = 0; i < incoming.lessons.length; i += 1) {
      found = false;
      for (j = 0; j < output.lessons.length; j += 1) {
        if (output.lessons[j].id === incoming.lessons[i].id) {
          output.lessons[j] = window.HanziStorage.clone(incoming.lessons[i]);
          found = true;
          break;
        }
      }
      if (!found) {
        output.lessons.push(window.HanziStorage.clone(incoming.lessons[i]));
      }
    }
    return window.HanziReview.enrichDatabase(window.HanziReview.normalizeDatabase(output));
  }

  function importText(text, fileName) {
    var trimmed = String(text || '').replace(/^\s+|\s+$/g, '');
    var imported;
    var parsed;
    var identity;
    var mode = element('importModeSelect').value;

    if (!trimmed) {
      throw new Error('Tệp không có dữ liệu.');
    }

    if (/\.json$/i.test(fileName || '') || trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') {
      imported = window.HanziReview.enrichDatabase(window.HanziReview.normalizeDatabase(JSON.parse(trimmed)));
      if (mode === 'replace') {
        state.db = imported;
      } else {
        state.db = mergeDatabases(state.db, imported);
      }
    } else {
      parsed = parseLessonLines(trimmed);
      if (parsed.errors.length || !parsed.words.length) {
        throw new Error('TXT phải theo dạng: chữ Hán | pinyin | nghĩa.');
      }
      identity = nextLessonIdentity();
      state.db.lessons.push({ id: identity.id, title: identity.title, words: parsed.words });
      state.db = window.HanziReview.enrichDatabase(window.HanziReview.normalizeDatabase(state.db));
    }

    populateLessonSelect(state.db.lessons[0].id);
    loadLesson(state.db.lessons[0].id);
    if (state.onChange) {
      state.onChange(state.db, 'import');
    }
    notify('Đã nhập dữ liệu thành công.', 2400);
  }

  function importFile(file) {
    var reader;
    if (!file) {
      return;
    }
    reader = new window.FileReader();
    reader.onload = function () {
      try {
        importText(reader.result, file.name || '');
      } catch (error) {
        notify('Không thể nhập tệp: ' + error.message, 4500);
      }
      element('importFileInput').value = '';
    };
    reader.onerror = function () {
      notify('Không thể đọc tệp đã chọn.', 3500);
      element('importFileInput').value = '';
    };
    reader.readAsText(file, 'utf-8');
  }

  function exportData() {
    var clean = window.HanziReview.cleanDatabase(state.db);
    var content = JSON.stringify(clean, null, 2);
    var blob = new window.Blob([content], { type: 'application/json;charset=utf-8' });
    var url = window.URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'du-lieu-luyen-chu-han.json';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    window.setTimeout(function () {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 1200);
    notify('Đã tạo tệp JSON để tải xuống.');
  }

  function resetData() {
    if (!window.confirm('Khôi phục dữ liệu mới nhất từ GitHub? Các bài tự thêm hoặc chỉnh sửa chỉ lưu trên thiết bị sẽ bị xóa.')) {
      return;
    }
    state.db = window.HanziReview.enrichDatabase(window.HanziReview.normalizeDatabase(window.HanziStorage.clone(state.defaultDb)));
    populateLessonSelect(state.db.lessons[0].id);
    loadLesson(state.db.lessons[0].id);
    if (state.onChange) {
      state.onChange(state.db, 'reset');
    }
    notify('Đã khôi phục dữ liệu GitHub mới nhất.');
  }

  function syncGithub() {
    if (!state.onSync || state.syncing) {
      return;
    }
    setSyncing(true);
    state.onSync(function () {
      setSyncing(false);
    });
  }

  function setSyncing(syncing) {
    var button = element('syncGithubButton');
    state.syncing = !!syncing;
    if (button) {
      button.disabled = state.syncing;
      button.textContent = state.syncing ? 'Đang kiểm tra…' : 'Kiểm tra bài mới';
    }
  }

  function setSyncStatus(message, source, error) {
    var node = element('githubSyncStatus');
    var box = element('githubSyncBox');
    if (node) {
      node.textContent = message || '';
    }
    if (box) {
      box.setAttribute('data-source', source || 'unknown');
      box.title = error && error.message ? error.message : '';
    }
  }

  function bindEvents() {
    element('manageDataButton').addEventListener('click', openModal, false);
    element('closeDataButton').addEventListener('click', closeModal, false);
    element('dataModal').addEventListener('click', function (event) {
      if (event.target === element('dataModal')) {
        closeModal();
      }
    }, false);
    element('editLessonSelect').addEventListener('change', function () {
      loadLesson(this.value);
    }, false);
    element('saveLessonButton').addEventListener('click', saveLesson, false);
    element('newLessonButton').addEventListener('click', newLesson, false);
    element('deleteLessonButton').addEventListener('click', deleteLesson, false);
    element('importFileInput').addEventListener('change', function () {
      importFile(this.files && this.files[0]);
    }, false);
    element('exportDataButton').addEventListener('click', exportData, false);
    element('resetDataButton').addEventListener('click', resetData, false);
    if (element('syncGithubButton')) {
      element('syncGithubButton').addEventListener('click', syncGithub, false);
    }
  }

  function init(options) {
    state.db = options.db;
    state.defaultDb = options.defaultDb;
    state.onChange = options.onChange;
    state.onSync = options.onSync || null;
    state.toast = options.toast;
    bindEvents();
    populateLessonSelect();
    if (state.db.lessons.length) {
      loadLesson(state.db.lessons[0].id);
    }
  }

  function setDefaultDatabase(db) {
    state.defaultDb = db;
  }

  function setDatabase(db) {
    state.db = db;
    populateLessonSelect();
    if (state.db.lessons.length) {
      loadLesson(state.db.lessons[0].id);
    }
  }

  window.HanziDataManager = {
    init: init,
    setDatabase: setDatabase,
    setDefaultDatabase: setDefaultDatabase,
    setSyncStatus: setSyncStatus,
    setSyncing: setSyncing,
    open: openModal,
    close: closeModal,
    parseLessonLines: parseLessonLines,
    importText: importText
  };
})(window, document);
