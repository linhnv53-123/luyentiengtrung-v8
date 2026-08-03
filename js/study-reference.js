(function (window, document) {
  'use strict';

  var PINYIN_STORAGE_KEY = 'pinyin_descriptions_v1';
  var PINYIN_META_STORAGE_KEY = 'pinyin_description_meta_v1';
  var NOTES_STORAGE_KEY = 'study_notes_v1';
  var DELETED_NOTES_STORAGE_KEY = 'study_notes_deleted_v1';
  var initialized = false;
  var config = {};
  var descriptions = {};
  var descriptionMeta = {};
  var notesState = { version: 1, items: [] };
  var deletedNotes = {};
  var editingId = '';
  var saveStatusTimer = null;

  var INITIAL_GROUPS = [
    { title: 'Âm hai môi và môi–răng', items: ['b', 'p', 'm', 'f'] },
    { title: 'Đầu lưỡi', items: ['d', 't', 'n', 'l'] },
    { title: 'Gốc lưỡi', items: ['g', 'k', 'h'] },
    { title: 'Mặt lưỡi', items: ['j', 'q', 'x'] },
    { title: 'Uốn lưỡi', items: ['zh', 'ch', 'sh', 'r'] },
    { title: 'Đầu lưỡi trước', items: ['z', 'c', 's'] },
    { title: 'Ký hiệu âm đầu khi viết pinyin', items: ['y', 'w'] }
  ];

  var FINAL_GROUPS = [
    { title: 'Vận mẫu đơn', items: ['a', 'o', 'e', 'ê', 'i', 'u', 'ü', 'er'] },
    { title: 'Vận mẫu ghép hai âm', items: ['ai', 'ei', 'ao', 'ou', 'ia', 'ie', 'ua', 'uo', 'üe'] },
    { title: 'Vận mẫu ghép ba âm và dạng viết rút gọn', items: ['iao', 'iou → iu', 'uai', 'uei → ui'] },
    { title: 'Vận mẫu mũi trước', items: ['an', 'en', 'ian', 'in', 'uan', 'uen → un', 'üan', 'ün'] },
    { title: 'Vận mẫu mũi sau', items: ['ang', 'eng', 'ong', 'iang', 'ing', 'iong', 'uang', 'ueng'] },
    { title: 'Âm i đặc biệt', items: ['i trong zhi / chi / shi / ri', 'i trong zi / ci / si'] }
  ];

  var NOTE_CATEGORIES = [
    'Phát âm',
    'Thanh điệu',
    'Ngữ pháp / công thức',
    'Cách viết câu',
    'Từ vựng',
    'Khác'
  ];

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
    if (config.toast) {
      config.toast(message, duration);
    }
  }

  function nowId() {
    return 'note_' + String(new Date().getTime()) + '_' + String(Math.floor(Math.random() * 100000));
  }

  function nowTime() {
    return new Date().getTime();
  }

  function notifyChanged(reason) {
    var event;
    try {
      event = new CustomEvent('hanzi-notebook-changed', { detail: { reason: reason || 'changed', at: nowTime() } });
    } catch (error) {
      event = document.createEvent('CustomEvent');
      event.initCustomEvent('hanzi-notebook-changed', false, false, { reason: reason || 'changed', at: nowTime() });
    }
    document.dispatchEvent(event);
  }

  function readDescriptions() {
    var saved = window.HanziStorage.readJSON(PINYIN_STORAGE_KEY, null);
    var savedMeta = window.HanziStorage.readJSON(PINYIN_META_STORAGE_KEY, null);
    descriptions = saved && typeof saved === 'object' ? saved : {};
    descriptionMeta = savedMeta && typeof savedMeta === 'object' ? savedMeta : {};
  }

  function saveDescriptions(reason, silent) {
    window.HanziStorage.writeJSON(PINYIN_STORAGE_KEY, descriptions);
    window.HanziStorage.writeJSON(PINYIN_META_STORAGE_KEY, descriptionMeta);
    if (!silent) {
      showPinyinSaveStatus('Đã tự động lưu trên thiết bị');
      notifyChanged(reason || 'pinyin');
    }
  }

  function showPinyinSaveStatus(message) {
    var node = element('pinyinSaveStatus');
    if (!node) {
      return;
    }
    node.textContent = message;
    window.clearTimeout(saveStatusTimer);
    saveStatusTimer = window.setTimeout(function () {
      node.textContent = 'Nội dung được lưu riêng trên trình duyệt hiện tại.';
    }, 1800);
  }

  function descriptionKey(type, symbol) {
    return type + ':' + symbol;
  }

  function safeDomId(value) {
    var source = text(value);
    var parts = [];
    var i;
    var ch;
    for (i = 0; i < source.length; i += 1) {
      ch = source.charAt(i);
      if (/[a-z0-9]/i.test(ch)) {
        parts.push(ch.toLowerCase());
      } else {
        parts.push('u' + source.charCodeAt(i).toString(16));
      }
    }
    return 'pinyin-note-' + parts.join('-');
  }

  function createPinyinRow(type, symbol) {
    var row = document.createElement('div');
    var label = document.createElement('label');
    var input = document.createElement('textarea');
    var key = descriptionKey(type, symbol);

    row.className = 'pinyin-entry';
    label.className = 'pinyin-symbol';
    label.setAttribute('for', safeDomId(key));
    label.textContent = symbol;

    input.id = safeDomId(key);
    input.className = 'pinyin-description-input';
    input.rows = 2;
    input.placeholder = 'Tự mô tả cách đọc bằng tiếng Việt…';
    input.value = text(descriptions[key]);
    input.setAttribute('data-pinyin-key', key);
    input.addEventListener('input', function () {
      var changedKey = this.getAttribute('data-pinyin-key');
      descriptions[changedKey] = this.value;
      descriptionMeta[changedKey] = nowTime();
      saveDescriptions('pinyin');
    }, false);

    row.appendChild(label);
    row.appendChild(input);
    return row;
  }

  function renderPinyinGroup(container, type, group, openByDefault) {
    var details = document.createElement('details');
    var summary = document.createElement('summary');
    var titleLine = document.createElement('span');
    var itemLine = document.createElement('span');
    var body = document.createElement('div');
    var i;

    details.className = 'pinyin-group';
    details.open = !!openByDefault;
    summary.className = 'pinyin-group-summary';
    titleLine.className = 'pinyin-group-summary-title';
    titleLine.textContent = group.title + ' · ' + String(group.items.length) + ' mục';
    itemLine.className = 'pinyin-group-summary-items';
    itemLine.textContent = '(' + group.items.join(', ') + ')';
    summary.appendChild(titleLine);
    summary.appendChild(itemLine);
    body.className = 'pinyin-group-body';

    for (i = 0; i < group.items.length; i += 1) {
      body.appendChild(createPinyinRow(type, group.items[i]));
    }
    details.appendChild(summary);
    details.appendChild(body);
    container.appendChild(details);
  }

  function renderPinyinTables() {
    var initialContainer = element('initialsList');
    var finalContainer = element('finalsList');
    var i;
    if (!initialContainer || !finalContainer) {
      return;
    }
    initialContainer.innerHTML = '';
    finalContainer.innerHTML = '';
    for (i = 0; i < INITIAL_GROUPS.length; i += 1) {
      renderPinyinGroup(initialContainer, 'initial', INITIAL_GROUPS[i], i === 0);
    }
    for (i = 0; i < FINAL_GROUPS.length; i += 1) {
      renderPinyinGroup(finalContainer, 'final', FINAL_GROUPS[i], i === 0);
    }
    updatePinyinProgress();
  }

  function updatePinyinProgress() {
    var total = 0;
    var filled = 0;
    var i;
    var j;
    var key;
    for (i = 0; i < INITIAL_GROUPS.length; i += 1) {
      for (j = 0; j < INITIAL_GROUPS[i].items.length; j += 1) {
        total += 1;
        key = descriptionKey('initial', INITIAL_GROUPS[i].items[j]);
        if (trim(descriptions[key])) {
          filled += 1;
        }
      }
    }
    for (i = 0; i < FINAL_GROUPS.length; i += 1) {
      for (j = 0; j < FINAL_GROUPS[i].items.length; j += 1) {
        total += 1;
        key = descriptionKey('final', FINAL_GROUPS[i].items[j]);
        if (trim(descriptions[key])) {
          filled += 1;
        }
      }
    }
    if (element('pinyinProgressText')) {
      element('pinyinProgressText').textContent = 'Đã ghi chú ' + String(filled) + '/' + String(total) + ' mục';
    }
  }

  function allPinyinKeys() {
    var keys = [];
    var i;
    var j;
    for (i = 0; i < INITIAL_GROUPS.length; i += 1) {
      for (j = 0; j < INITIAL_GROUPS[i].items.length; j += 1) {
        keys.push(descriptionKey('initial', INITIAL_GROUPS[i].items[j]));
      }
    }
    for (i = 0; i < FINAL_GROUPS.length; i += 1) {
      for (j = 0; j < FINAL_GROUPS[i].items.length; j += 1) {
        keys.push(descriptionKey('final', FINAL_GROUPS[i].items[j]));
      }
    }
    return keys;
  }

  function clearPinyinDescriptions() {
    var keys;
    var i;
    var timestamp;
    if (!window.confirm('Xóa toàn bộ mô tả cách đọc bạn đã nhập?')) {
      return;
    }
    keys = allPinyinKeys();
    timestamp = nowTime();
    descriptions = {};
    for (i = 0; i < keys.length; i += 1) {
      descriptions[keys[i]] = '';
      descriptionMeta[keys[i]] = timestamp;
    }
    saveDescriptions('clear-pinyin', true);
    renderPinyinTables();
    showPinyinSaveStatus('Đã xóa toàn bộ mô tả');
    notifyChanged('clear-pinyin');
  }

  function normalizeNotesState(raw) {
    var state = raw && typeof raw === 'object' ? raw : {};
    var items = Object.prototype.toString.call(state.items) === '[object Array]' ? state.items : [];
    var clean = [];
    var i;
    var item;
    for (i = 0; i < items.length; i += 1) {
      item = items[i] || {};
      if (!item.id) {
        item.id = nowId();
      }
      clean.push({
        id: text(item.id),
        category: trim(item.category) || 'Khác',
        title: trim(item.title),
        content: text(item.content),
        example: text(item.example),
        createdAt: Number(item.createdAt || new Date().getTime()),
        updatedAt: Number(item.updatedAt || item.createdAt || new Date().getTime())
      });
    }
    return { version: 1, items: clean };
  }

  function readNotes() {
    var savedDeleted = window.HanziStorage.readJSON(DELETED_NOTES_STORAGE_KEY, null);
    notesState = normalizeNotesState(window.HanziStorage.readJSON(NOTES_STORAGE_KEY, null));
    deletedNotes = savedDeleted && typeof savedDeleted === 'object' ? savedDeleted : {};
  }

  function saveNotesState(reason, silent) {
    window.HanziStorage.writeJSON(NOTES_STORAGE_KEY, notesState);
    window.HanziStorage.writeJSON(DELETED_NOTES_STORAGE_KEY, deletedNotes);
    if (!silent) {
      notifyChanged(reason || 'notes');
    }
  }

  function populateCategorySelect() {
    var select = element('noteCategoryInput');
    var i;
    var option;
    if (!select) {
      return;
    }
    select.innerHTML = '';
    for (i = 0; i < NOTE_CATEGORIES.length; i += 1) {
      option = document.createElement('option');
      option.value = NOTE_CATEGORIES[i];
      option.textContent = NOTE_CATEGORIES[i];
      select.appendChild(option);
    }
  }

  function clearNoteEditor() {
    editingId = '';
    element('noteCategoryInput').value = 'Ngữ pháp / công thức';
    element('noteTitleInput').value = '';
    element('noteContentInput').value = '';
    element('noteExampleInput').value = '';
    element('saveNoteButton').textContent = 'Lưu ghi chú';
    element('deleteNoteButton').hidden = true;
    element('noteEditorTitle').textContent = 'Thêm ghi chú mới';
  }

  function setNoteEditorOpen(open) {
    var details = element('notesEditorDetails');
    if (details) {
      details.open = !!open;
    }
  }

  function focusNoteEditor() {
    setNoteEditorOpen(true);
    window.setTimeout(function () {
      var panel = element('notesEditorPanel');
      var titleInput = element('noteTitleInput');
      if (panel && panel.scrollIntoView) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (titleInput) {
        titleInput.focus();
      }
    }, 30);
  }

  function returnToNotesList() {
    setNoteEditorOpen(false);
    window.setTimeout(function () {
      var panel = element('notesPrimaryPanel');
      if (panel && panel.scrollIntoView) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 30);
  }

  function getEditingNote() {
    var i;
    for (i = 0; i < notesState.items.length; i += 1) {
      if (notesState.items[i].id === editingId) {
        return notesState.items[i];
      }
    }
    return null;
  }

  function saveNote() {
    var title = trim(element('noteTitleInput').value);
    var content = trim(element('noteContentInput').value);
    var example = trim(element('noteExampleInput').value);
    var category = element('noteCategoryInput').value || 'Khác';
    var note = getEditingNote();
    var time = new Date().getTime();

    if (!title && !content) {
      toast('Hãy nhập tiêu đề hoặc nội dung ghi chú.', 2600);
      element('noteTitleInput').focus();
      return;
    }

    if (note) {
      note.category = category;
      note.title = title;
      note.content = content;
      note.example = example;
      note.updatedAt = time;
      toast('Đã cập nhật ghi chú.');
    } else {
      notesState.items.push({
        id: nowId(),
        category: category,
        title: title || 'Ghi chú chưa đặt tên',
        content: content,
        example: example,
        createdAt: time,
        updatedAt: time
      });
      toast('Đã lưu ghi chú.');
    }
    saveNotesState('note-saved');
    clearNoteEditor();
    renderNotes();
    returnToNotesList();
  }

  function editNote(id) {
    var i;
    var note = null;
    for (i = 0; i < notesState.items.length; i += 1) {
      if (notesState.items[i].id === id) {
        note = notesState.items[i];
        break;
      }
    }
    if (!note) {
      return;
    }
    editingId = note.id;
    element('noteCategoryInput').value = note.category;
    if (!element('noteCategoryInput').value) {
      element('noteCategoryInput').value = 'Khác';
    }
    element('noteTitleInput').value = note.title;
    element('noteContentInput').value = note.content;
    element('noteExampleInput').value = note.example;
    element('saveNoteButton').textContent = 'Cập nhật ghi chú';
    element('deleteNoteButton').hidden = false;
    element('noteEditorTitle').textContent = 'Chỉnh sửa ghi chú';
    focusNoteEditor();
  }

  function deleteEditingNote() {
    var note = getEditingNote();
    var next = [];
    var i;
    if (!note) {
      return;
    }
    if (!window.confirm('Xóa ghi chú “' + note.title + '”?')) {
      return;
    }
    for (i = 0; i < notesState.items.length; i += 1) {
      if (notesState.items[i].id !== note.id) {
        next.push(notesState.items[i]);
      }
    }
    notesState.items = next;
    deletedNotes[note.id] = nowTime();
    saveNotesState('note-deleted');
    clearNoteEditor();
    renderNotes();
    returnToNotesList();
    toast('Đã xóa ghi chú.');
  }

  function formatDate(timestamp) {
    try {
      return new Date(timestamp).toLocaleString('vi-VN');
    } catch (error) {
      return '';
    }
  }

  function normalizeSearch(value) {
    var normalized = text(value).toLowerCase();
    if (normalized.normalize) {
      normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    return normalized.replace(/đ/g, 'd');
  }

  function noteMatches(note, query) {
    var haystack = normalizeSearch([note.category, note.title, note.content, note.example].join(' '));
    return !query || haystack.indexOf(query) !== -1;
  }

  function createNoteCard(note) {
    var card = document.createElement('article');
    var top = document.createElement('div');
    var category = document.createElement('span');
    var date = document.createElement('time');
    var title = document.createElement('h3');
    var content = document.createElement('div');
    var example;
    var button = document.createElement('button');

    card.className = 'study-note-card';
    card.setAttribute('data-note-id', note.id);
    top.className = 'study-note-meta';
    category.className = 'note-category-badge';
    category.textContent = note.category;
    date.textContent = formatDate(note.updatedAt);
    date.setAttribute('datetime', new Date(note.updatedAt).toISOString());
    top.appendChild(category);
    top.appendChild(date);

    title.textContent = note.title || 'Ghi chú chưa đặt tên';
    content.className = 'study-note-content';
    content.textContent = note.content || '';

    card.appendChild(top);
    card.appendChild(title);
    if (note.content) {
      card.appendChild(content);
    }
    if (note.example) {
      example = document.createElement('div');
      example.className = 'study-note-example';
      example.textContent = note.example;
      card.appendChild(example);
    }

    button.type = 'button';
    button.className = 'button button-secondary note-edit-button';
    button.textContent = 'Sửa';
    button.addEventListener('click', function () {
      editNote(note.id);
    }, false);
    card.appendChild(button);
    return card;
  }

  function renderNotes() {
    var list = element('notesList');
    var count = element('notesCountText');
    var query = normalizeSearch(element('notesSearchInput') ? element('notesSearchInput').value : '');
    var sorted = notesState.items.slice(0).sort(function (a, b) {
      return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
    });
    var visible = 0;
    var i;
    if (!list) {
      return;
    }
    list.innerHTML = '';
    for (i = 0; i < sorted.length; i += 1) {
      if (noteMatches(sorted[i], query)) {
        list.appendChild(createNoteCard(sorted[i]));
        visible += 1;
      }
    }
    if (!visible) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = query ? 'Không tìm thấy ghi chú phù hợp.' : 'Chưa có ghi chú. Hãy lưu công thức hoặc lưu ý đầu tiên của bạn.';
      list.appendChild(empty);
    }
    count.textContent = query ? String(visible) + '/' + String(notesState.items.length) + ' ghi chú' : String(notesState.items.length) + ' ghi chú';
  }

  function downloadJson(filename, data) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    var url = window.URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () {
      window.URL.revokeObjectURL(url);
    }, 800);
  }

  function exportNotebook() {
    downloadJson('so-tay-tieng-trung.json', {
      version: 1,
      exportedAt: new Date().toISOString(),
      pinyinDescriptions: descriptions,
      pinyinUpdatedAt: descriptionMeta,
      notes: notesState.items,
      deletedNotes: deletedNotes
    });
    toast('Đã tạo file sao lưu sổ tay.');
  }

  function importNotebookFile(file) {
    var reader;
    if (!file) {
      return;
    }
    reader = new FileReader();
    reader.onload = function () {
      var payload;
      try {
        payload = JSON.parse(String(reader.result || ''));
        if (!payload || typeof payload !== 'object') {
          throw new Error('Dữ liệu không hợp lệ.');
        }
        descriptions = payload.pinyinDescriptions && typeof payload.pinyinDescriptions === 'object' ? payload.pinyinDescriptions : descriptions;
        if (Object.prototype.toString.call(payload.notes) === '[object Array]') {
          notesState = normalizeNotesState({ items: payload.notes });
        }
        saveDescriptions('import', true);
        saveNotesState('import', true);
        renderPinyinTables();
        clearNoteEditor();
        renderNotes();
        setNoteEditorOpen(false);
        notifyChanged('import');
        toast('Đã nhập dữ liệu sổ tay.', 2800);
      } catch (error) {
        toast('Không đọc được file sổ tay: ' + error.message, 3800);
      }
      element('notebookImportInput').value = '';
    };
    reader.onerror = function () {
      toast('Không đọc được file đã chọn.', 3200);
      element('notebookImportInput').value = '';
    };
    reader.readAsText(file, 'utf-8');
  }

  function numberOrZero(value) {
    var number = Number(value || 0);
    return isFinite(number) ? number : 0;
  }

  function normalizeSyncPayload(payload) {
    var source = payload && typeof payload === 'object' ? payload : {};
    var pinyin = source.pinyinDescriptions && typeof source.pinyinDescriptions === 'object' ? source.pinyinDescriptions : {};
    var pinyinMeta = source.pinyinUpdatedAt && typeof source.pinyinUpdatedAt === 'object' ? source.pinyinUpdatedAt : {};
    var deleted = source.deletedNotes && typeof source.deletedNotes === 'object' ? source.deletedNotes : {};
    var fallbackTime = 0;
    var notes;
    var key;
    try {
      fallbackTime = source.updatedAt ? new Date(source.updatedAt).getTime() : 0;
      if (!fallbackTime && source.exportedAt) {
        fallbackTime = new Date(source.exportedAt).getTime();
      }
    } catch (error) {
      fallbackTime = 0;
    }
    for (key in pinyin) {
      if (Object.prototype.hasOwnProperty.call(pinyin, key) && !pinyinMeta[key]) {
        pinyinMeta[key] = fallbackTime;
      }
    }
    notes = normalizeNotesState({ items: Object.prototype.toString.call(source.notes) === '[object Array]' ? source.notes : [] }).items;
    return {
      version: 2,
      pinyinDescriptions: pinyin,
      pinyinUpdatedAt: pinyinMeta,
      notes: notes,
      deletedNotes: deleted,
      updatedAt: fallbackTime
    };
  }

  function mergeSyncPayload(localPayload, remotePayload) {
    var local = normalizeSyncPayload(localPayload);
    var remote = normalizeSyncPayload(remotePayload);
    var resultDescriptions = {};
    var resultMeta = {};
    var noteMap = {};
    var resultDeleted = {};
    var keys = {};
    var key;
    var i;
    var note;
    var localTime;
    var remoteTime;
    var deletedTime;
    var notes = [];

    for (key in local.pinyinDescriptions) {
      if (Object.prototype.hasOwnProperty.call(local.pinyinDescriptions, key)) { keys[key] = true; }
    }
    for (key in remote.pinyinDescriptions) {
      if (Object.prototype.hasOwnProperty.call(remote.pinyinDescriptions, key)) { keys[key] = true; }
    }
    for (key in keys) {
      if (Object.prototype.hasOwnProperty.call(keys, key)) {
        localTime = numberOrZero(local.pinyinUpdatedAt[key]);
        remoteTime = numberOrZero(remote.pinyinUpdatedAt[key]);
        if (remoteTime > localTime) {
          resultDescriptions[key] = text(remote.pinyinDescriptions[key]);
          resultMeta[key] = remoteTime;
        } else {
          resultDescriptions[key] = text(local.pinyinDescriptions[key]);
          resultMeta[key] = localTime;
        }
      }
    }

    for (key in local.deletedNotes) {
      if (Object.prototype.hasOwnProperty.call(local.deletedNotes, key)) {
        resultDeleted[key] = numberOrZero(local.deletedNotes[key]);
      }
    }
    for (key in remote.deletedNotes) {
      if (Object.prototype.hasOwnProperty.call(remote.deletedNotes, key)) {
        resultDeleted[key] = Math.max(numberOrZero(resultDeleted[key]), numberOrZero(remote.deletedNotes[key]));
      }
    }

    for (i = 0; i < local.notes.length; i += 1) {
      noteMap[local.notes[i].id] = local.notes[i];
    }
    for (i = 0; i < remote.notes.length; i += 1) {
      note = remote.notes[i];
      if (!noteMap[note.id] || numberOrZero(note.updatedAt) > numberOrZero(noteMap[note.id].updatedAt)) {
        noteMap[note.id] = note;
      }
    }
    for (key in noteMap) {
      if (Object.prototype.hasOwnProperty.call(noteMap, key)) {
        note = noteMap[key];
        deletedTime = numberOrZero(resultDeleted[key]);
        if (!deletedTime || numberOrZero(note.updatedAt) > deletedTime) {
          notes.push(note);
        }
      }
    }
    notes.sort(function (a, b) { return numberOrZero(b.updatedAt) - numberOrZero(a.updatedAt); });

    return {
      version: 2,
      updatedAt: new Date().toISOString(),
      pinyinDescriptions: resultDescriptions,
      pinyinUpdatedAt: resultMeta,
      notes: notes,
      deletedNotes: resultDeleted
    };
  }

  function exportSyncState() {
    return {
      version: 2,
      updatedAt: new Date().toISOString(),
      pinyinDescriptions: window.HanziStorage.clone(descriptions),
      pinyinUpdatedAt: window.HanziStorage.clone(descriptionMeta),
      notes: window.HanziStorage.clone(notesState.items),
      deletedNotes: window.HanziStorage.clone(deletedNotes)
    };
  }

  function importSyncState(payload, silent) {
    var merged = mergeSyncPayload(exportSyncState(), payload);
    descriptions = merged.pinyinDescriptions;
    descriptionMeta = merged.pinyinUpdatedAt;
    notesState = normalizeNotesState({ items: merged.notes });
    deletedNotes = merged.deletedNotes;
    saveDescriptions('github-merge', true);
    saveNotesState('github-merge', true);
    renderPinyinTables();
    clearNoteEditor();
    renderNotes();
    setNoteEditorOpen(false);
    if (!silent) {
      notifyChanged('github-merge');
    }
    return exportSyncState();
  }

  function bindEvents() {
    element('clearPinyinNotesButton').addEventListener('click', clearPinyinDescriptions, false);
    element('saveNoteButton').addEventListener('click', saveNote, false);
    element('newNoteButton').addEventListener('click', function () {
      clearNoteEditor();
      focusNoteEditor();
    }, false);
    element('cancelNoteButton').addEventListener('click', function () {
      clearNoteEditor();
      returnToNotesList();
    }, false);
    element('deleteNoteButton').addEventListener('click', deleteEditingNote, false);
    element('notesSearchInput').addEventListener('input', renderNotes, false);
    element('exportNotebookButton').addEventListener('click', exportNotebook, false);
    element('notebookImportInput').addEventListener('change', function () {
      importNotebookFile(this.files && this.files.length ? this.files[0] : null);
    }, false);
    document.addEventListener('input', function (event) {
      if (event.target && event.target.getAttribute && event.target.getAttribute('data-pinyin-key')) {
        updatePinyinProgress();
      }
    }, false);
  }

  function init(options) {
    if (initialized) {
      return;
    }
    config = options || {};
    readDescriptions();
    readNotes();
    populateCategorySelect();
    renderPinyinTables();
    clearNoteEditor();
    setNoteEditorOpen(false);
    renderNotes();
    bindEvents();
    initialized = true;
  }

  window.HanziStudyReference = {
    init: init,
    getDescriptions: function () { return window.HanziStorage.clone(descriptions); },
    getNotes: function () { return window.HanziStorage.clone(notesState.items); },
    exportSyncState: exportSyncState,
    importSyncState: importSyncState,
    mergeSyncPayload: mergeSyncPayload,
    renderPinyinTables: renderPinyinTables,
    renderNotes: renderNotes,
    clearNoteEditor: clearNoteEditor
  };
})(window, document);
