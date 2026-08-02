(function (window, document) {
  'use strict';

  var LEGACY_DATA_KEY = 'database';
  var CUSTOM_DATA_KEY = 'customLessonsV1';
  var PROGRESS_KEY = 'progress';
  var SETTINGS_KEY = 'settings';
  var SESSION_KEY = 'session';

  var defaultSettings = {
    scope: 'B12',
    mode: 'cueToHanzi',
    order: 'smart',
    limit: '20'
  };

  var db = null;
  var defaultDb = null;
  var progress = {};
  var settings = null;
  var session = null;
  var cardMode = 'cueToHanzi';
  var revealed = false;
  var streak = 0;
  var toastTimer = null;
  var remoteStatus = { source: 'loading', error: null, syncedAt: 0, metadata: {} };

  function element(id) {
    return document.getElementById(id);
  }

  function toast(message, duration) {
    var node = element('toast');
    window.clearTimeout(toastTimer);
    node.textContent = message;
    node.classList.add('is-visible');
    toastTimer = window.setTimeout(function () {
      node.classList.remove('is-visible');
    }, duration || 1900);
  }

  function clone(value) {
    return window.HanziStorage.clone(value);
  }

  function cleanLesson(lesson) {
    var words = [];
    var i;
    for (i = 0; i < lesson.words.length; i += 1) {
      words.push({ h: lesson.words[i].h, p: lesson.words[i].p, m: lesson.words[i].m });
    }
    return { id: lesson.id, title: lesson.title, words: words };
  }

  function lessonSignature(lesson) {
    return JSON.stringify(cleanLesson(lesson));
  }

  function lessonMap(database) {
    var map = {};
    var i;
    for (i = 0; i < database.lessons.length; i += 1) {
      map[database.lessons[i].id] = database.lessons[i];
    }
    return map;
  }

  function normalizeCustomState(raw) {
    var source = raw || {};
    return {
      version: 1,
      lessons: Object.prototype.toString.call(source.lessons) === '[object Array]' ? source.lessons : [],
      deleted: Object.prototype.toString.call(source.deleted) === '[object Array]' ? source.deleted : []
    };
  }

  function migrateLegacyDatabase(baseDatabase) {
    var legacy = window.HanziStorage.readJSON(LEGACY_DATA_KEY, null);
    var custom = { version: 1, lessons: [], deleted: [] };
    var baseMap = lessonMap(baseDatabase);
    var normalized;
    var i;

    if (!legacy) {
      return custom;
    }
    try {
      normalized = window.HanziReview.enrichDatabase(window.HanziReview.normalizeDatabase(legacy));
      for (i = 0; i < normalized.lessons.length; i += 1) {
        if (!baseMap[normalized.lessons[i].id]) {
          custom.lessons.push(cleanLesson(normalized.lessons[i]));
        }
      }
      if (custom.lessons.length) {
        window.HanziStorage.writeJSON(CUSTOM_DATA_KEY, custom);
      }
      window.HanziStorage.remove(LEGACY_DATA_KEY);
    } catch (error) {
      window.HanziStorage.remove(LEGACY_DATA_KEY);
    }
    return custom;
  }

  function mergeBaseAndCustom(baseDatabase, customState) {
    var baseClean = window.HanziReview.cleanDatabase(baseDatabase);
    var custom = normalizeCustomState(customState);
    var deleted = {};
    var replacements = {};
    var lessons = [];
    var used = {};
    var i;

    for (i = 0; i < custom.deleted.length; i += 1) {
      deleted[String(custom.deleted[i])] = true;
    }
    for (i = 0; i < custom.lessons.length; i += 1) {
      if (custom.lessons[i] && custom.lessons[i].id) {
        replacements[String(custom.lessons[i].id)] = custom.lessons[i];
      }
    }
    for (i = 0; i < baseClean.lessons.length; i += 1) {
      if (deleted[baseClean.lessons[i].id]) {
        continue;
      }
      if (replacements[baseClean.lessons[i].id]) {
        lessons.push(replacements[baseClean.lessons[i].id]);
        used[baseClean.lessons[i].id] = true;
      } else {
        lessons.push(baseClean.lessons[i]);
      }
    }
    for (i = 0; i < custom.lessons.length; i += 1) {
      if (custom.lessons[i] && custom.lessons[i].id && !used[custom.lessons[i].id] && !lessonMap(baseDatabase)[custom.lessons[i].id]) {
        lessons.push(custom.lessons[i]);
      }
    }
    return window.HanziReview.enrichDatabase(window.HanziReview.normalizeDatabase({
      version: 3,
      metadata: baseDatabase.metadata || {},
      lessons: lessons
    }));
  }

  function computeCustomState(currentDatabase, baseDatabase) {
    var currentClean = window.HanziReview.cleanDatabase(currentDatabase);
    var baseClean = window.HanziReview.cleanDatabase(baseDatabase);
    var currentMap = lessonMap(currentClean);
    var baseMap = lessonMap(baseClean);
    var custom = { version: 1, lessons: [], deleted: [] };
    var i;
    var lesson;

    for (i = 0; i < currentClean.lessons.length; i += 1) {
      lesson = currentClean.lessons[i];
      if (!baseMap[lesson.id] || lessonSignature(lesson) !== lessonSignature(baseMap[lesson.id])) {
        custom.lessons.push(cleanLesson(lesson));
      }
    }
    for (i = 0; i < baseClean.lessons.length; i += 1) {
      if (!currentMap[baseClean.lessons[i].id]) {
        custom.deleted.push(baseClean.lessons[i].id);
      }
    }
    return custom;
  }

  function loadDatabase() {
    var stored = window.HanziStorage.readJSON(CUSTOM_DATA_KEY, null);
    var custom;
    try {
      custom = stored ? normalizeCustomState(stored) : migrateLegacyDatabase(defaultDb);
      return mergeBaseAndCustom(defaultDb, custom);
    } catch (error) {
      toast('Dữ liệu tùy chỉnh trên thiết bị bị lỗi; đang dùng dữ liệu GitHub.', 3500);
      return window.HanziReview.enrichDatabase(window.HanziReview.normalizeDatabase(clone(defaultDb)));
    }
  }

  function saveDatabase() {
    var custom = computeCustomState(db, defaultDb);
    if (!custom.lessons.length && !custom.deleted.length) {
      window.HanziStorage.remove(CUSTOM_DATA_KEY);
      return;
    }
    window.HanziStorage.writeJSON(CUSTOM_DATA_KEY, custom);
  }

  function loadSettings() {
    var stored = window.HanziStorage.readJSON(SETTINGS_KEY, null) || {};
    return {
      scope: stored.scope || defaultSettings.scope,
      mode: stored.mode || defaultSettings.mode,
      order: stored.order || defaultSettings.order,
      limit: String(stored.limit || defaultSettings.limit)
    };
  }

  function saveSettings() {
    settings.scope = element('lessonSelect').value;
    settings.mode = element('modeSelect').value;
    settings.order = element('orderSelect').value;
    settings.limit = element('limitSelect').value;
    window.HanziStorage.writeJSON(SETTINGS_KEY, settings);
  }

  function saveProgress() {
    window.HanziStorage.writeJSON(PROGRESS_KEY, progress);
  }

  function saveSession() {
    if (!session) {
      window.HanziStorage.remove(SESSION_KEY);
      return;
    }
    window.HanziStorage.writeJSON(SESSION_KEY, session);
  }

  function sessionCanRestore(candidate) {
    var i;
    if (!candidate || candidate.completed || Object.prototype.toString.call(candidate.deck) !== '[object Array]') {
      return false;
    }
    for (i = 0; i < candidate.deck.length; i += 1) {
      if (window.HanziReview.findWord(db, candidate.deck[i])) {
        return true;
      }
    }
    return false;
  }

  function populateLessonSelect() {
    var select = element('lessonSelect');
    var current = settings.scope;
    var allWords = window.HanziReview.allWords(db);
    var option;
    var i;

    select.innerHTML = '';
    option = document.createElement('option');
    option.value = '__all__';
    option.textContent = 'Tất cả bài (' + String(allWords.length) + ' từ)';
    select.appendChild(option);

    for (i = 0; i < db.lessons.length; i += 1) {
      option = document.createElement('option');
      option.value = db.lessons[i].id;
      option.textContent = db.lessons[i].title + ' (' + String(db.lessons[i].words.length) + ' từ)';
      select.appendChild(option);
    }

    select.value = current;
    if (!select.value) {
      select.value = db.lessons.length ? db.lessons[0].id : '__all__';
    }
    settings.scope = select.value;
  }

  function applySettingsToControls() {
    populateLessonSelect();
    element('modeSelect').value = settings.mode;
    if (!element('modeSelect').value) {
      element('modeSelect').value = defaultSettings.mode;
    }
    element('orderSelect').value = settings.order;
    if (!element('orderSelect').value) {
      element('orderSelect').value = defaultSettings.order;
    }
    element('limitSelect').value = settings.limit;
    if (!element('limitSelect').value) {
      element('limitSelect').value = defaultSettings.limit;
    }
  }

  function currentWord() {
    if (!session || session.completed || session.index >= session.deck.length) {
      return null;
    }
    return window.HanziReview.findWord(db, session.deck[session.index]);
  }

  function chooseCardMode() {
    var mode = element('modeSelect').value;
    if (mode === 'mixed') {
      return Math.random() < 0.5 ? 'cueToHanzi' : 'hanziToCue';
    }
    return mode;
  }

  function startSession(reuseKeys) {
    var keys;
    var controls = {
      scope: element('lessonSelect').value,
      mode: element('modeSelect').value,
      order: element('orderSelect').value,
      limit: element('limitSelect').value
    };

    saveSettings();
    if (reuseKeys && reuseKeys.length) {
      keys = reuseKeys.slice(0);
    } else {
      keys = window.HanziReview.buildDeck(db, controls.scope, controls.order, controls.limit, progress);
    }

    if (!keys.length) {
      session = null;
      saveSession();
      renderEmpty();
      toast('Phạm vi đang chọn chưa có từ vựng.', 2800);
      return;
    }

    session = window.HanziReview.createSession(keys, controls);
    streak = 0;
    saveSession();
    renderCurrent(true);
  }

  function showElement(node, show) {
    node.hidden = !show;
  }

  function formatDue(progressEntry) {
    var seen = Number(progressEntry.seen || 0);
    var dueAt = Number(progressEntry.dueAt || 0);
    var now = new Date().getTime();
    var minutes;
    var hours;
    var days;

    if (!seen) {
      return 'Từ mới';
    }
    if (!dueAt || dueAt <= now) {
      return 'Đến hạn ôn';
    }
    minutes = Math.round((dueAt - now) / 60000);
    if (minutes < 60) {
      return 'Ôn sau khoảng ' + String(Math.max(1, minutes)) + ' phút';
    }
    hours = Math.round(minutes / 60);
    if (hours < 36) {
      return 'Ôn sau khoảng ' + String(hours) + ' giờ';
    }
    days = Math.round(hours / 24);
    return 'Ôn sau khoảng ' + String(days) + ' ngày';
  }

  function renderCurrent(newCard) {
    var word = currentWord();
    var key;
    var p;

    if (!session) {
      renderEmpty();
      return;
    }
    if (session.completed) {
      renderComplete();
      return;
    }
    if (!word) {
      finishDeckRound();
      return;
    }

    if (newCard) {
      cardMode = chooseCardMode();
      revealed = false;
      window.HanziDrawing.build(word.h);
    }

    key = window.HanziReview.wordKey(word);
    p = progress[key] || {};

    element('lessonBadge').textContent = word.lessonTitle;
    element('memoryInfo').textContent = formatDue(p);
    element('pinyinPrompt').textContent = word.p || '(chưa có pinyin)';
    element('meaningPrompt').textContent = word.m || '(chưa có nghĩa)';
    element('hanziPrompt').textContent = word.h;
    element('answerHanzi').textContent = word.h;
    element('answerPinyin').textContent = word.p;
    element('answerMeaning').textContent = word.m;

    showElement(element('completeBox'), false);
    showElement(element('completeActions'), false);
    showElement(element('studyActions'), true);
    showElement(element('secondaryActions'), true);

    if (cardMode === 'hanziToCue') {
      element('promptLabel').textContent = 'Hãy nhớ cách đọc và nghĩa';
      showElement(element('hanziPrompt'), true);
      showElement(element('cueStack'), false);
      element('promptNote').textContent = 'Nhấn “Hiện đáp án” để đối chiếu pinyin và nghĩa.';
    } else {
      element('promptLabel').textContent = 'Hãy viết chữ Hán';
      showElement(element('hanziPrompt'), false);
      showElement(element('cueStack'), true);
      element('promptNote').textContent = 'Dựa vào cả pinyin và nghĩa để xác định đúng từ.';
    }

    showElement(element('answerArea'), revealed);
    showElement(element('revealButton'), !revealed);
    showElement(element('ratingGrid'), revealed);
    updateStats();
    saveSession();
  }

  function renderEmpty() {
    element('lessonBadge').textContent = 'Chưa có dữ liệu';
    element('memoryInfo').textContent = '';
    element('promptLabel').textContent = 'Chưa thể bắt đầu';
    element('hanziPrompt').textContent = '—';
    showElement(element('hanziPrompt'), true);
    showElement(element('cueStack'), false);
    element('promptNote').textContent = 'Mở “Quản lý dữ liệu” để thêm bài học.';
    showElement(element('answerArea'), false);
    showElement(element('revealButton'), false);
    showElement(element('ratingGrid'), false);
    showElement(element('completeBox'), false);
    showElement(element('completeActions'), false);
    window.HanziDrawing.build('');
    updateStats();
  }

  function reveal() {
    if (!session || session.completed || !currentWord()) {
      return;
    }
    revealed = true;
    if (cardMode === 'hanziToCue') {
      showElement(element('cueStack'), true);
    }
    showElement(element('answerArea'), true);
    showElement(element('revealButton'), false);
    showElement(element('ratingGrid'), true);
  }

  function rate(rating) {
    var word;
    var key;
    var now;

    if (!session || session.completed) {
      return;
    }
    if (!revealed) {
      reveal();
      return;
    }

    word = currentWord();
    if (!word) {
      return;
    }
    key = window.HanziReview.wordKey(word);
    now = new Date().getTime();
    progress[key] = window.HanziReview.rateProgress(progress[key], rating, now);
    window.HanziReview.markRating(session, key, rating);

    if (window.HanziReview.isKnownRating(rating)) {
      streak += 1;
    } else {
      streak = 0;
    }

    saveProgress();
    session.index += 1;
    saveSession();

    if (session.index >= session.deck.length) {
      finishDeckRound();
    } else {
      renderCurrent(true);
    }
  }

  function skip() {
    var word;
    var key;
    if (!session || session.completed) {
      return;
    }
    word = currentWord();
    if (word) {
      key = window.HanziReview.wordKey(word);
      session.outstanding[key] = true;
    }
    streak = 0;
    session.index += 1;
    saveSession();
    if (session.index >= session.deck.length) {
      finishDeckRound();
    } else {
      renderCurrent(true);
    }
  }

  function finishDeckRound() {
    var result;
    var pending;
    if (!session) {
      return;
    }
    result = window.HanziReview.advancePhase(session);
    saveSession();
    if (result === 'review') {
      pending = window.HanziReview.outstandingCount(session);
      toast('Bắt đầu ôn lại vòng ' + String(session.reviewRound) + ': còn ' + String(pending) + ' từ.', 2600);
      renderCurrent(true);
    } else if (result === 'complete') {
      renderComplete();
    }
  }

  function renderComplete() {
    var reviewed;
    if (!session) {
      renderEmpty();
      return;
    }

    reviewed = Math.max(0, session.initialTotal - session.firstPassKnown);
    showElement(element('hanziPrompt'), false);
    showElement(element('cueStack'), false);
    showElement(element('answerArea'), false);
    showElement(element('revealButton'), false);
    showElement(element('ratingGrid'), false);
    showElement(element('secondaryActions'), false);
    showElement(element('completeBox'), true);
    showElement(element('completeActions'), true);

    element('promptLabel').textContent = 'Lượt học đã hoàn thành';
    element('promptNote').textContent = '';
    element('completeSummary').textContent = 'Bạn nhớ ngay ' + String(session.firstPassKnown) + '/' + String(session.initialTotal) + ' từ ở lượt đầu. ' + (reviewed ? 'Các từ còn lại đã được đưa qua vòng ôn lại.' : 'Không có từ nào cần ôn lại trong lượt này.');
    window.HanziDrawing.build('');
    updateStats();
    saveSession();
  }

  function updateStats() {
    var pending;
    if (!session) {
      element('phaseText').textContent = 'Chưa bắt đầu';
      element('positionText').textContent = '0/0';
      element('knownText').textContent = '0';
      element('pendingText').textContent = '0';
      element('streakText').textContent = String(streak);
      return;
    }

    pending = window.HanziReview.outstandingCount(session);
    if (session.completed) {
      element('phaseText').textContent = 'Hoàn thành';
      element('positionText').textContent = String(session.initialTotal) + '/' + String(session.initialTotal);
    } else if (session.phase === 'review') {
      element('phaseText').textContent = 'Ôn lại vòng ' + String(session.reviewRound);
      element('positionText').textContent = String(Math.min(session.index + 1, session.deck.length)) + '/' + String(session.deck.length);
    } else {
      element('phaseText').textContent = 'Lượt đầu';
      element('positionText').textContent = String(Math.min(session.index + 1, session.deck.length)) + '/' + String(session.deck.length);
    }
    element('knownText').textContent = String(session.firstPassKnown);
    element('pendingText').textContent = String(pending);
    element('streakText').textContent = String(streak);
  }

  function speak() {
    var word = currentWord();
    var utterance;
    var voices;
    var i;
    if (!word) {
      return;
    }
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      toast('Thiết bị này không hỗ trợ phát âm bằng trình duyệt.', 3000);
      return;
    }
    window.speechSynthesis.cancel();
    utterance = new window.SpeechSynthesisUtterance(word.h);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.72;
    voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
    for (i = 0; i < voices.length; i += 1) {
      if (/^zh/i.test(voices[i].lang || '')) {
        utterance.voice = voices[i];
        break;
      }
    }
    window.speechSynthesis.speak(utterance);
  }

  function resetProgressForScope() {
    var words = window.HanziReview.selectedWords(db, element('lessonSelect').value);
    var keys = {};
    var i;
    var key;
    if (!window.confirm('Xóa tiến độ đã lưu của phạm vi đang chọn?')) {
      return;
    }
    for (i = 0; i < words.length; i += 1) {
      keys[window.HanziReview.wordKey(words[i])] = true;
    }
    for (key in progress) {
      if (Object.prototype.hasOwnProperty.call(progress, key) && keys[key]) {
        delete progress[key];
      }
    }
    saveProgress();
    startSession();
    toast('Đã xóa tiến độ của phạm vi đang chọn.');
  }

  function onControlChange() {
    saveSettings();
    startSession();
  }

  function onActionChange() {
    var value = element('actionSelect').value;
    if (value === 'restart') {
      startSession();
    } else if (value === 'resetScope') {
      resetProgressForScope();
    }
    element('actionSelect').value = 'continue';
  }

  function openHelp() {
    var modal = element('helpModal');
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function closeHelp() {
    var modal = element('helpModal');
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    if (element('dataModal').hidden) {
      document.body.classList.remove('modal-open');
    }
  }

  function updateRuntimeStatus() {
    var protocol = window.location.protocol;
    var storageText = window.HanziStorage.isPersistent() ? 'localStorage đang hoạt động.' : 'Không thể dùng localStorage; tiến độ chỉ tồn tại đến khi đóng trang.';
    var protocolText;
    if (protocol === 'https:') {
      protocolText = 'Trang đang chạy qua HTTPS, phù hợp để cài lên Màn hình chính.';
    } else if (protocol === 'http:') {
      protocolText = 'Trang đang chạy qua HTTP. Chế độ ngoại tuyến chỉ hoạt động trên localhost hoặc HTTPS.';
    } else {
      protocolText = 'Trang đang mở bằng tệp cục bộ (' + protocol + '). Trên iPhone, hãy triển khai qua HTTPS thay vì mở từ Files/Quick Look.';
    }
    element('runtimeStatus').textContent = protocolText + ' ' + storageText;
  }

  function onDatabaseChanged(newDb) {
    db = newDb;
    saveDatabase();
    window.HanziDataManager.setDatabase(db);
    if (window.HanziDictionary && window.HanziDictionary.setDatabase) {
      window.HanziDictionary.setDatabase(db);
    }
    populateLessonSelect();
    saveSettings();
    session = null;
    saveSession();
    startSession();
  }

  function syncStatusText() {
    var metadata = remoteStatus.metadata || {};
    var count = Number(metadata.lesson_count || (defaultDb && defaultDb.lessons ? defaultDb.lessons.length : 0));
    var wordCount = Number(metadata.word_count || (db ? window.HanziReview.allWords(db).length : 0));
    var timeText = remoteStatus.syncedAt ? new Date(remoteStatus.syncedAt).toLocaleString('vi-VN') : '';
    if (remoteStatus.source === 'github') {
      return 'Đã đồng bộ từ GitHub: ' + String(count) + ' bài, ' + String(wordCount) + ' từ' + (timeText ? ' · ' + timeText : '') + '.';
    }
    if (remoteStatus.source === 'fallback') {
      return 'Đang dùng dữ liệu dự phòng trong ứng dụng. ' + (remoteStatus.error ? remoteStatus.error.message : 'Không kết nối được GitHub.');
    }
    return 'Chưa tải được dữ liệu GitHub.';
  }

  function updateSyncStatus() {
    if (window.HanziDataManager && window.HanziDataManager.setSyncStatus) {
      window.HanziDataManager.setSyncStatus(syncStatusText(), remoteStatus.source, remoteStatus.error);
    }
  }

  function syncFromGitHub(userRequested, callback) {
    if (!window.HanziRemoteData || !window.HanziRemoteData.load) {
      toast('Phiên bản này chưa có bộ đồng bộ GitHub.', 3000);
      if (callback) { callback(false); }
      return;
    }
    if (window.HanziDataManager && window.HanziDataManager.setSyncing) {
      window.HanziDataManager.setSyncing(true);
    }
    window.HanziRemoteData.load(function (result) {
      var previousScope = element('lessonSelect') ? element('lessonSelect').value : settings.scope;
      remoteStatus = result;
      defaultDb = result.db;
      db = loadDatabase();
      if (window.HanziDataManager) {
        window.HanziDataManager.setDefaultDatabase(defaultDb);
        window.HanziDataManager.setDatabase(db);
        window.HanziDataManager.setSyncing(false);
      }
      if (window.HanziDictionary && window.HanziDictionary.setDatabase) {
        window.HanziDictionary.setDatabase(db);
      }
      settings.scope = previousScope;
      applySettingsToControls();
      session = null;
      saveSession();
      startSession();
      updateSyncStatus();
      if (userRequested) {
        if (result.source === 'github') {
          toast('Đã kiểm tra dữ liệu GitHub. Hiện có ' + String(defaultDb.lessons.length) + ' bài.', 3000);
        } else {
          toast('Chưa thể lấy dữ liệu mới từ GitHub; đang dùng dữ liệu dự phòng.', 3800);
        }
      }
      if (callback) { callback(result.source === 'github'); }
    });
  }

  function bindEvents() {
    var ratings = document.querySelectorAll('[data-rating]');
    var i;

    element('revealButton').addEventListener('click', reveal, false);
    element('speakButton').addEventListener('click', speak, false);
    element('skipButton').addEventListener('click', skip, false);
    element('restartButton').addEventListener('click', function () {
      startSession();
    }, false);
    element('newSessionButton').addEventListener('click', function () {
      startSession();
    }, false);
    element('repeatButton').addEventListener('click', function () {
      startSession(session && session.originalDeck ? session.originalDeck : null);
    }, false);
    element('undoButton').addEventListener('click', function () {
      if (!window.HanziDrawing.undo()) {
        toast('Chưa có nét nào để hoàn tác.');
      }
    }, false);
    element('clearButton').addEventListener('click', function () {
      window.HanziDrawing.clear();
    }, false);

    for (i = 0; i < ratings.length; i += 1) {
      ratings[i].addEventListener('click', function () {
        rate(this.getAttribute('data-rating'));
      }, false);
    }

    element('lessonSelect').addEventListener('change', onControlChange, false);
    element('modeSelect').addEventListener('change', onControlChange, false);
    element('orderSelect').addEventListener('change', onControlChange, false);
    element('limitSelect').addEventListener('change', onControlChange, false);
    element('actionSelect').addEventListener('change', onActionChange, false);

    element('settingsToggleButton').addEventListener('click', function () {
      var controls = document.querySelector('.control-panel');
      var stats = document.querySelector('.stats-grid');
      var open = !controls.classList.contains('mobile-open');
      controls.classList.toggle('mobile-open', open);
      stats.classList.toggle('mobile-open', open);
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
      this.textContent = open ? 'Đóng' : 'Thiết lập';
    }, false);

    element('helpButton').addEventListener('click', openHelp, false);
    element('closeHelpButton').addEventListener('click', closeHelp, false);
    element('helpModal').addEventListener('click', function (event) {
      if (event.target === element('helpModal')) {
        closeHelp();
      }
    }, false);

    document.addEventListener('keydown', function (event) {
      var tag = document.activeElement ? document.activeElement.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return;
      }
      if (event.key === 'Escape') {
        if (!element('helpModal').hidden) {
          closeHelp();
        }
        if (!element('dataModal').hidden) {
          window.HanziDataManager.close();
        }
      } else if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault();
        reveal();
      } else if (event.key === '1') {
        rate('again');
      } else if (event.key === '2') {
        rate('hard');
      } else if (event.key === '3') {
        rate('good');
      } else if (event.key === '4') {
        rate('easy');
      } else if (String(event.key || '').toLowerCase() === 's') {
        speak();
      }
    }, false);
  }

  function registerServiceWorker() {
    var protocol = window.location.protocol;
    if (!('serviceWorker' in window.navigator)) {
      return;
    }
    if (protocol !== 'https:' && !(protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname))) {
      return;
    }
    window.addEventListener('load', function () {
      window.navigator.serviceWorker.register('sw.js?v=8').then(function (registration) {
      registration.update();
    }).catch(function () {
        /* Không chặn ứng dụng nếu service worker không đăng ký được. */
      });
    }, false);
  }

  function exposeTestApi() {
    window.HanziTrainer = {
      isReady: true,
      getDatabase: function () {
        return db;
      },
      getDefaultDatabase: function () {
        return defaultDb;
      },
      getRemoteStatus: function () {
        return remoteStatus;
      },
      syncFromGitHub: function (callback) {
        syncFromGitHub(false, callback);
      },
      getSession: function () {
        return session;
      },
      getCurrentWord: currentWord,
      getCardMode: function () {
        return cardMode;
      },
      reveal: reveal,
      rate: rate,
      startSession: startSession,
      openDataManager: function () {
        window.HanziDataManager.open();
      },
      closeDataManager: function () {
        window.HanziDataManager.close();
      },
      setTestSession: function (keys) {
        var controls = {
          scope: '__all__',
          mode: 'cueToHanzi',
          order: 'original',
          limit: 'all'
        };
        session = window.HanziReview.createSession(keys, controls);
        saveSession();
        renderCurrent(true);
      },
      drawing: window.HanziDrawing,
      dictionary: window.HanziDictionary,
      studyReference: window.HanziStudyReference,
      githubNotebookSync: window.HanziGithubNotebookSync
    };
  }

  function completeInit(result) {
    var restored;

    remoteStatus = result || { source: 'fallback', error: null, syncedAt: new Date().getTime(), metadata: {} };
    defaultDb = remoteStatus.db || window.HANZI_DEFAULT_DB;
    if (!defaultDb) {
      throw new Error('Không tìm thấy dữ liệu mặc định.');
    }

    progress = window.HanziStorage.readJSON(PROGRESS_KEY, {}) || {};
    settings = loadSettings();
    db = loadDatabase();

    window.HanziDrawing.init(element('padGrid'), element('padHint'));
    applySettingsToControls();
    bindEvents();

    window.HanziDataManager.init({
      db: db,
      defaultDb: defaultDb,
      onChange: onDatabaseChanged,
      onSync: function (done) {
        syncFromGitHub(true, done);
      },
      toast: toast
    });
    if (window.HanziDictionary && window.HanziDictionary.init) {
      window.HanziDictionary.init({
        getDatabase: function () { return db; },
        toast: toast
      });
    }
    if (window.HanziStudyReference && window.HanziStudyReference.init) {
      window.HanziStudyReference.init({
        toast: toast
      });
    }
    if (window.HanziGithubNotebookSync && window.HanziGithubNotebookSync.init) {
      window.HanziGithubNotebookSync.init({
        toast: toast
      });
    }
    updateSyncStatus();

    restored = window.HanziStorage.readJSON(SESSION_KEY, null);
    if (sessionCanRestore(restored)) {
      session = restored;
      if (!session.outstanding) {
        session.outstanding = {};
      }
      element('lessonSelect').value = session.scope;
      if (!element('lessonSelect').value) {
        element('lessonSelect').selectedIndex = 0;
      }
      element('modeSelect').value = session.mode || settings.mode;
      element('orderSelect').value = session.order || settings.order;
      element('limitSelect').value = session.limit || settings.limit;
      renderCurrent(true);
    } else {
      startSession();
    }

    updateRuntimeStatus();
    registerServiceWorker();
    exposeTestApi();
  }

  function init() {
    window.HanziTrainer = { isReady: false };
    element('lessonBadge').textContent = 'Đang đồng bộ';
    element('promptLabel').textContent = 'Đang tải dữ liệu bài học…';
    element('promptNote').textContent = 'Ứng dụng sẽ tự kiểm tra bài mới trên GitHub.';
    if (window.HanziRemoteData && window.HanziRemoteData.load) {
      window.HanziRemoteData.load(completeInit);
    } else {
      completeInit({
        db: window.HANZI_DEFAULT_DB,
        source: 'fallback',
        error: new Error('Không tìm thấy bộ đồng bộ GitHub.'),
        syncedAt: new Date().getTime(),
        metadata: window.HANZI_DEFAULT_DB ? window.HANZI_DEFAULT_DB.metadata : {}
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, false);
  } else {
    init();
  }
})(window, document);
