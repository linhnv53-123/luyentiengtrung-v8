(function (window, document) {
  'use strict';

  var config = null;
  var db = null;
  var words = [];
  var characterMap = {};
  var characterMetadata = {};
  var initialized = false;
  var currentWord = null;
  var activeView = 'practice';
  var searchTimer = null;

  function element(id) {
    return document.getElementById(id);
  }

  function clear(node) {
    while (node && node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function textNode(tag, className, value) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    node.textContent = value === null || typeof value === 'undefined' ? '' : String(value);
    return node;
  }

  function stripMarks(value) {
    var text = String(value || '').toLowerCase();
    try {
      text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch (ignore) {
      /* Safari hiện đại hỗ trợ normalize; nhánh này dành cho trình duyệt rất cũ. */
    }
    return text.replace(/đ/g, 'd').replace(/[^a-z0-9\u3400-\u9fff]+/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  function compact(value) {
    return stripMarks(value).replace(/\s+/g, '');
  }

  function isHan(char) {
    var code;
    if (!char) {
      return false;
    }
    code = char.charCodeAt(0);
    return (code >= 0x3400 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff);
  }

  function splitHan(text) {
    var result = [];
    var seen = {};
    var i;
    var char;
    text = String(text || '');
    for (i = 0; i < text.length; i += 1) {
      char = text.charAt(i);
      if (isHan(char) && !seen[char]) {
        seen[char] = true;
        result.push(char);
      }
    }
    return result;
  }

  function allWords(database) {
    var result = [];
    var i;
    var j;
    var lesson;
    var word;
    if (!database || !database.lessons) {
      return result;
    }
    for (i = 0; i < database.lessons.length; i += 1) {
      lesson = database.lessons[i];
      for (j = 0; j < lesson.words.length; j += 1) {
        word = lesson.words[j];
        result.push({
          h: word.h,
          p: word.p,
          m: word.m,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          orderIndex: i * 10000 + j,
          searchHanzi: String(word.h || '').toLowerCase(),
          searchPinyin: compact(word.p),
          searchMeaning: stripMarks(word.m),
          searchMeaningCompact: compact(word.m)
        });
      }
    }
    return result;
  }

  function refreshDatabase(database) {
    db = database || (config && config.getDatabase ? config.getDatabase() : null);
    words = allWords(db);
    if (initialized) {
      renderSearch();
      if (currentWord) {
        renderWordDetail(currentWord);
      }
      renderAnalysis(element('analysisInput') ? element('analysisInput').value : '');
    }
  }

  function scoreWord(word, query) {
    var raw = String(query || '').replace(/^\s+|\s+$/g, '');
    var normalized = stripMarks(raw);
    var normalizedCompact = compact(raw);
    var score = 0;
    var hanziIndex;
    var pinyinIndex;
    var meaningIndex;

    if (!raw) {
      return 1;
    }

    hanziIndex = word.searchHanzi.indexOf(raw.toLowerCase());
    if (word.searchHanzi === raw) {
      score = Math.max(score, 1000);
    } else if (hanziIndex === 0) {
      score = Math.max(score, 900 - word.h.length);
    } else if (hanziIndex > -1) {
      score = Math.max(score, 820 - hanziIndex);
    }

    pinyinIndex = word.searchPinyin.indexOf(normalizedCompact);
    if (normalizedCompact && word.searchPinyin === normalizedCompact) {
      score = Math.max(score, 760);
    } else if (normalizedCompact && pinyinIndex === 0) {
      score = Math.max(score, 700);
    } else if (normalizedCompact && pinyinIndex > -1) {
      score = Math.max(score, 640 - pinyinIndex);
    }

    meaningIndex = word.searchMeaning.indexOf(normalized);
    if (normalized && word.searchMeaning === normalized) {
      score = Math.max(score, 780);
    } else if (normalized && meaningIndex === 0) {
      score = Math.max(score, 720);
    } else if (normalized && meaningIndex > -1) {
      score = Math.max(score, 660 - meaningIndex);
    } else if (normalizedCompact && word.searchMeaningCompact.indexOf(normalizedCompact) > -1) {
      score = Math.max(score, 610);
    }

    return score;
  }

  function searchWords(query) {
    var results = [];
    var i;
    var score;
    for (i = 0; i < words.length; i += 1) {
      score = scoreWord(words[i], query);
      if (score > 0) {
        results.push({ word: words[i], score: score });
      }
    }
    results.sort(function (a, b) {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      return a.word.orderIndex - b.word.orderIndex;
    });
    return results.slice(0, 100);
  }

  function speak(text) {
    var utterance;
    var voices;
    var i;
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      if (config && config.toast) {
        config.toast('Thiết bị này không hỗ trợ phát âm.');
      }
      return;
    }
    window.speechSynthesis.cancel();
    utterance = new window.SpeechSynthesisUtterance(String(text || ''));
    utterance.lang = 'zh-CN';
    voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
    for (i = 0; i < voices.length; i += 1) {
      if (/^zh(-|_)/i.test(voices[i].lang || '')) {
        utterance.voice = voices[i];
        break;
      }
    }
    window.speechSynthesis.speak(utterance);
  }

  function createWordCard(word) {
    var card = document.createElement('article');
    var main = document.createElement('button');
    var actions = document.createElement('div');
    var speakButton = document.createElement('button');
    var analyzeButton = document.createElement('button');

    card.className = 'dictionary-card';
    main.type = 'button';
    main.className = 'dictionary-card-main';
    main.appendChild(textNode('strong', 'dictionary-hanzi', word.h));
    main.appendChild(textNode('span', 'dictionary-pinyin', word.p));
    main.appendChild(textNode('span', 'dictionary-meaning', word.m));
    main.appendChild(textNode('span', 'dictionary-lesson', word.lessonTitle));
    main.addEventListener('click', function () {
      currentWord = word;
      renderWordDetail(word);
    }, false);

    actions.className = 'dictionary-card-actions';
    speakButton.type = 'button';
    speakButton.className = 'mini-action';
    speakButton.textContent = '🔊';
    speakButton.setAttribute('aria-label', 'Phát âm ' + word.h);
    speakButton.addEventListener('click', function () {
      speak(word.h);
    }, false);

    analyzeButton.type = 'button';
    analyzeButton.className = 'mini-action';
    analyzeButton.textContent = 'Phân tích';
    analyzeButton.addEventListener('click', function () {
      element('analysisInput').value = word.h;
      openView('analysis');
      renderAnalysis(word.h);
    }, false);

    actions.appendChild(speakButton);
    actions.appendChild(analyzeButton);
    card.appendChild(main);
    card.appendChild(actions);
    return card;
  }

  function renderSearch() {
    var input = element('dictionarySearchInput');
    var list = element('dictionaryResults');
    var count = element('dictionaryResultCount');
    var query = input ? input.value : '';
    var results;
    var i;
    if (!list || !count) {
      return;
    }
    results = searchWords(query);
    clear(list);
    count.textContent = query ? String(results.length) + ' kết quả phù hợp' : String(words.length) + ' mục từ trong dữ liệu';
    if (!results.length) {
      list.appendChild(textNode('div', 'empty-state', 'Không tìm thấy từ phù hợp. Thử nhập chữ Hán, pinyin hoặc nghĩa tiếng Việt khác.'));
      return;
    }
    for (i = 0; i < results.length; i += 1) {
      list.appendChild(createWordCard(results[i].word));
    }
  }

  function wordsContaining(character) {
    var result = [];
    var i;
    for (i = 0; i < words.length; i += 1) {
      if (String(words[i].h || '').indexOf(character) > -1) {
        result.push(words[i]);
      }
    }
    return result.slice(0, 12);
  }

  function renderWordDetail(word) {
    var panel = element('dictionaryDetail');
    var header;
    var body;
    var buttonRow;
    var speakButton;
    var analyzeButton;
    if (!panel) {
      return;
    }
    clear(panel);
    if (!word) {
      panel.appendChild(textNode('div', 'empty-state', 'Chọn một kết quả để xem chi tiết.'));
      return;
    }

    header = document.createElement('div');
    header.className = 'dictionary-detail-head';
    header.appendChild(textNode('div', 'dictionary-detail-hanzi', word.h));
    body = document.createElement('div');
    body.className = 'dictionary-detail-body';
    body.appendChild(textNode('div', 'dictionary-detail-pinyin', word.p));
    body.appendChild(textNode('div', 'dictionary-detail-meaning', word.m));
    body.appendChild(textNode('div', 'dictionary-detail-lesson', word.lessonTitle + ' · ' + word.lessonId));
    header.appendChild(body);

    buttonRow = document.createElement('div');
    buttonRow.className = 'dictionary-detail-actions';
    speakButton = document.createElement('button');
    speakButton.type = 'button';
    speakButton.className = 'button button-secondary';
    speakButton.textContent = '🔊 Phát âm';
    speakButton.addEventListener('click', function () { speak(word.h); }, false);
    analyzeButton = document.createElement('button');
    analyzeButton.type = 'button';
    analyzeButton.className = 'button button-primary';
    analyzeButton.textContent = 'Phân tích các chữ';
    analyzeButton.addEventListener('click', function () {
      element('analysisInput').value = word.h;
      openView('analysis');
      renderAnalysis(word.h);
    }, false);
    buttonRow.appendChild(speakButton);
    buttonRow.appendChild(analyzeButton);

    panel.appendChild(header);
    panel.appendChild(buttonRow);
  }

  function requestJSON(url, callback) {
    var xhr = new window.XMLHttpRequest();
    var done = false;
    function finish(error, data) {
      if (done) { return; }
      done = true;
      callback(error, data);
    }
    xhr.open('GET', url + (url.indexOf('?') > -1 ? '&' : '?') + '_sync=' + String(new Date().getTime()), true);
    xhr.timeout = 15000;
    xhr.onreadystatechange = function () {
      var parsed;
      if (xhr.readyState !== 4) { return; }
      if ((xhr.status >= 200 && xhr.status < 300) || (xhr.status === 0 && xhr.responseText)) {
        try {
          parsed = JSON.parse(xhr.responseText);
          finish(null, parsed);
        } catch (error) {
          finish(new Error('Dữ liệu phân tích chữ không hợp lệ.'));
        }
      } else {
        finish(new Error('Không tải được dữ liệu phân tích chữ.'));
      }
    };
    xhr.onerror = function () { finish(new Error('Không kết nối được dữ liệu phân tích chữ.')); };
    xhr.ontimeout = function () { finish(new Error('Hết thời gian tải dữ liệu phân tích chữ.')); };
    xhr.send(null);
  }

  function loadCharacters() {
    var status = element('characterDataStatus');
    if (status) {
      status.textContent = 'Đang tải dữ liệu bộ thủ và thành phần…';
    }
    requestJSON('data/characters.json', function (error, data) {
      var items;
      var i;
      characterMap = {};
      characterMetadata = data && data.metadata ? data.metadata : {};
      items = data && Object.prototype.toString.call(data.characters) === '[object Array]' ? data.characters : [];
      for (i = 0; i < items.length; i += 1) {
        if (items[i] && items[i].character) {
          characterMap[items[i].character] = items[i];
        }
      }
      if (status) {
        if (error) {
          status.textContent = 'Chưa tải được dữ liệu phân tích. Tra từ vẫn hoạt động bình thường.';
          status.setAttribute('data-state', 'error');
        } else {
          status.textContent = 'Đã có dữ liệu cho ' + String(characterMetadata.available_count || 0) + '/' + String(characterMetadata.character_count || Object.keys(characterMap).length) + ' chữ.';
          status.setAttribute('data-state', 'ready');
        }
      }
      if (activeView === 'analysis') {
        renderAnalysis(element('analysisInput').value);
      }
    });
  }

  function addFact(grid, label, value) {
    var item;
    if (!value) {
      return;
    }
    item = document.createElement('div');
    item.className = 'character-fact';
    item.appendChild(textNode('span', 'character-fact-label', label));
    item.appendChild(textNode('strong', 'character-fact-value', value));
    grid.appendChild(item);
  }

  function renderCharacterCard(character) {
    var data = characterMap[character] || {};
    var card = document.createElement('article');
    var top = document.createElement('div');
    var facts = document.createElement('div');
    var components = document.createElement('div');
    var componentList = data.components || [];
    var related = wordsContaining(character);
    var relatedBox;
    var i;
    var chip;

    card.className = 'character-card';
    top.className = 'character-card-top';
    top.appendChild(textNode('div', 'character-glyph', character));
    top.appendChild(textNode('div', 'character-availability', data.available ? 'Có dữ liệu phân tích' : 'Chưa có dữ liệu phân tích chi tiết'));
    facts.className = 'character-facts';
    addFact(facts, 'Bộ thủ chính', data.radical || 'Chưa xác định');
    addFact(facts, 'Cấu trúc', data.structure || 'Chưa xác định');
    addFact(facts, 'IDS', data.decomposition || 'Chưa có');
    addFact(facts, 'Loại cấu tạo', data.formation || 'Chưa xác định');
    addFact(facts, 'Gợi nghĩa', data.semantic || '');
    addFact(facts, 'Gợi âm', data.phonetic || '');

    components.className = 'component-section';
    components.appendChild(textNode('h3', '', 'Thành phần đồ họa'));
    if (componentList.length) {
      for (i = 0; i < componentList.length; i += 1) {
        chip = textNode('span', 'component-chip', componentList[i]);
        components.appendChild(chip);
      }
    } else {
      components.appendChild(textNode('p', 'muted-copy', 'Nguồn chưa có cách tách đáng tin cậy cho chữ này, hoặc đây là chữ đơn.'));
    }

    relatedBox = document.createElement('div');
    relatedBox.className = 'related-words';
    relatedBox.appendChild(textNode('h3', '', 'Từ trong bài học có chữ này'));
    if (related.length) {
      for (i = 0; i < related.length; i += 1) {
        chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'related-chip';
        chip.textContent = related[i].h + ' · ' + related[i].p + ' · ' + related[i].m;
        (function (word) {
          chip.addEventListener('click', function () {
            element('dictionarySearchInput').value = word.h;
            openView('dictionary');
            renderSearch();
            currentWord = word;
            renderWordDetail(word);
          }, false);
        })(related[i]);
        relatedBox.appendChild(chip);
      }
    } else {
      relatedBox.appendChild(textNode('p', 'muted-copy', 'Không tìm thấy từ liên quan trong dữ liệu hiện tại.'));
    }

    card.appendChild(top);
    card.appendChild(facts);
    card.appendChild(components);
    card.appendChild(relatedBox);
    return card;
  }

  function renderAnalysis(value) {
    var output = element('analysisResults');
    var chars = splitHan(value);
    var i;
    if (!output) {
      return;
    }
    clear(output);
    if (!String(value || '').replace(/^\s+|\s+$/g, '')) {
      output.appendChild(textNode('div', 'empty-state', 'Nhập một chữ hoặc từ Hán để xem bộ thủ, cấu trúc và các thành phần.'));
      return;
    }
    if (!chars.length) {
      output.appendChild(textNode('div', 'empty-state', 'Nội dung chưa có chữ Hán để phân tích.'));
      return;
    }
    for (i = 0; i < chars.length; i += 1) {
      output.appendChild(renderCharacterCard(chars[i]));
    }
  }

  function openView(viewName) {
    var views = document.querySelectorAll('.app-view');
    var tabs = document.querySelectorAll('[data-view-target]');
    var i;
    activeView = viewName;
    for (i = 0; i < views.length; i += 1) {
      views[i].hidden = views[i].getAttribute('data-view') !== viewName;
      views[i].classList.toggle('is-active', !views[i].hidden);
    }
    for (i = 0; i < tabs.length; i += 1) {
      tabs[i].classList.toggle('is-active', tabs[i].getAttribute('data-view-target') === viewName);
      tabs[i].setAttribute('aria-selected', tabs[i].classList.contains('is-active') ? 'true' : 'false');
    }
    if (viewName === 'dictionary') {
      window.setTimeout(function () { element('dictionarySearchInput').focus(); }, 0);
      renderSearch();
    } else if (viewName === 'analysis') {
      renderAnalysis(element('analysisInput').value);
    }
    window.scrollTo(0, 0);
  }

  function bindEvents() {
    var tabs = document.querySelectorAll('[data-view-target]');
    var i;
    for (i = 0; i < tabs.length; i += 1) {
      tabs[i].addEventListener('click', function () {
        openView(this.getAttribute('data-view-target'));
      }, false);
    }
    element('dictionarySearchInput').addEventListener('input', function () {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(renderSearch, 90);
    }, false);
    element('dictionaryClearButton').addEventListener('click', function () {
      element('dictionarySearchInput').value = '';
      renderSearch();
      element('dictionarySearchInput').focus();
    }, false);
    element('analysisButton').addEventListener('click', function () {
      renderAnalysis(element('analysisInput').value);
    }, false);
    element('analysisInput').addEventListener('input', function () {
      renderAnalysis(this.value);
    }, false);
    element('analysisInput').addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        renderAnalysis(this.value);
      }
    }, false);
  }

  function init(options) {
    if (initialized) {
      refreshDatabase(options && options.getDatabase ? options.getDatabase() : null);
      return;
    }
    config = options || {};
    db = config.getDatabase ? config.getDatabase() : null;
    words = allWords(db);
    bindEvents();
    renderSearch();
    renderWordDetail(null);
    renderAnalysis('');
    loadCharacters();
    initialized = true;
  }

  window.HanziDictionary = {
    init: init,
    setDatabase: refreshDatabase,
    openView: openView,
    analyze: function (value) {
      if (element('analysisInput')) {
        element('analysisInput').value = value || '';
      }
      openView('analysis');
      renderAnalysis(value || '');
    },
    search: function (value) {
      if (element('dictionarySearchInput')) {
        element('dictionarySearchInput').value = value || '';
      }
      openView('dictionary');
      renderSearch();
    },
    reloadCharacterData: loadCharacters,
    getCharacterData: function () { return characterMap; },
    __test: {
      stripMarks: stripMarks,
      compact: compact,
      splitHan: splitHan,
      scoreWord: scoreWord,
      searchWords: searchWords
    }
  };
})(window, document);
