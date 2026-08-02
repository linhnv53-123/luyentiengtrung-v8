(function (window) {
  'use strict';

  function text(value) {
    return value === null || typeof value === 'undefined' ? '' : String(value).replace(/^\s+|\s+$/g, '');
  }

  function normalizeWord(raw) {
    var word = raw || {};
    if (Object.prototype.toString.call(raw) === '[object Array]') {
      word = { h: raw[0], p: raw[1], m: raw[2] };
    }
    return {
      h: text(word.h || word.hanzi),
      p: text(word.p || word.pinyin),
      m: text(word.m || word.meaning)
    };
  }

  function normalizeDatabase(raw) {
    var source = raw || {};
    var lessons;
    var normalized = [];
    var i;
    var j;
    var lesson;
    var words;
    var word;
    var seenIds = {};
    var id;

    if (Object.prototype.toString.call(source) === '[object Array]') {
      source = { version: 2, lessons: source };
    }

    lessons = source.lessons;
    if (Object.prototype.toString.call(lessons) !== '[object Array]') {
      throw new Error('JSON cần có trường lessons là một danh sách.');
    }

    for (i = 0; i < lessons.length; i += 1) {
      lesson = lessons[i] || {};
      id = text(lesson.id || ('B' + String(i + 1)));
      if (!id) {
        id = 'B' + String(i + 1);
      }
      if (seenIds[id]) {
        throw new Error('Mã bài bị trùng: ' + id);
      }
      seenIds[id] = true;
      words = [];
      if (Object.prototype.toString.call(lesson.words) === '[object Array]') {
        for (j = 0; j < lesson.words.length; j += 1) {
          word = normalizeWord(lesson.words[j]);
          if (word.h) {
            words.push(word);
          }
        }
      }
      if (words.length) {
        normalized.push({
          id: id,
          title: text(lesson.title || id),
          words: words
        });
      }
    }

    if (!normalized.length) {
      throw new Error('Không tìm thấy bài học hợp lệ.');
    }

    return {
      version: 2,
      metadata: source.metadata || {},
      lessons: normalized
    };
  }

  function enrichDatabase(db) {
    var i;
    var j;
    var lesson;
    var word;
    for (i = 0; i < db.lessons.length; i += 1) {
      lesson = db.lessons[i];
      for (j = 0; j < lesson.words.length; j += 1) {
        word = lesson.words[j];
        word.lessonId = lesson.id;
        word.lessonTitle = lesson.title;
        word.orderIndex = i * 10000 + j;
      }
    }
    return db;
  }

  function cleanDatabase(db) {
    var output = { version: 2, metadata: db.metadata || {}, lessons: [] };
    var i;
    var j;
    var lesson;
    var words;
    for (i = 0; i < db.lessons.length; i += 1) {
      lesson = db.lessons[i];
      words = [];
      for (j = 0; j < lesson.words.length; j += 1) {
        words.push({
          h: lesson.words[j].h,
          p: lesson.words[j].p,
          m: lesson.words[j].m
        });
      }
      output.lessons.push({ id: lesson.id, title: lesson.title, words: words });
    }
    return output;
  }

  function wordKey(word) {
    return String(word.lessonId || '') + '::' + String(word.h || '') + '::' + String(word.p || '');
  }

  function allWords(db) {
    var output = [];
    var i;
    var j;
    for (i = 0; i < db.lessons.length; i += 1) {
      for (j = 0; j < db.lessons[i].words.length; j += 1) {
        output.push(db.lessons[i].words[j]);
      }
    }
    return output;
  }

  function findWord(db, key) {
    var words = allWords(db);
    var i;
    for (i = 0; i < words.length; i += 1) {
      if (wordKey(words[i]) === key) {
        return words[i];
      }
    }
    return null;
  }

  function selectedWords(db, scope) {
    var i;
    if (scope === '__all__') {
      return allWords(db);
    }
    for (i = 0; i < db.lessons.length; i += 1) {
      if (db.lessons[i].id === scope) {
        return db.lessons[i].words.slice(0);
      }
    }
    return [];
  }

  function shuffle(array) {
    var i;
    var j;
    var temp;
    for (i = array.length - 1; i > 0; i -= 1) {
      j = Math.floor(Math.random() * (i + 1));
      temp = array[i];
      array[i] = array[j];
      array[j] = temp;
    }
    return array;
  }

  function progressFor(progress, key) {
    return progress[key] || {
      seen: 0,
      correct: 0,
      ease: 2.5,
      intervalDays: 0,
      dueAt: 0,
      lastSeenAt: 0,
      lastRating: ''
    };
  }

  function urgency(progressEntry, now) {
    var p = progressEntry || {};
    var due = Number(p.dueAt || 0);
    var seen = Number(p.seen || 0);
    var correct = Number(p.correct || 0);
    var accuracy = seen ? correct / seen : 0;
    var overdueHours = due ? (now - due) / 3600000 : 9999;
    var newBoost = seen ? 0 : -5000;
    return newBoost - overdueHours * 8 + accuracy * 100 + Number(p.intervalDays || 0) * 0.2;
  }

  function buildDeck(db, scope, order, limit, progress) {
    var words = selectedWords(db, scope);
    var now = new Date().getTime();
    var max;
    var i;

    if (order === 'random') {
      shuffle(words);
    } else if (order === 'due') {
      words.sort(function (a, b) {
        var pa = progressFor(progress, wordKey(a));
        var pb = progressFor(progress, wordKey(b));
        var da = Number(pa.dueAt || 0);
        var dbValue = Number(pb.dueAt || 0);
        if (da === dbValue) {
          return a.orderIndex - b.orderIndex;
        }
        return da - dbValue;
      });
    } else if (order === 'smart') {
      words.sort(function (a, b) {
        var scoreA = urgency(progressFor(progress, wordKey(a)), now);
        var scoreB = urgency(progressFor(progress, wordKey(b)), now);
        if (scoreA === scoreB) {
          return Math.random() < 0.5 ? -1 : 1;
        }
        return scoreA - scoreB;
      });
    } else {
      words.sort(function (a, b) {
        return a.orderIndex - b.orderIndex;
      });
    }

    if (limit !== 'all') {
      max = parseInt(limit, 10);
      if (!isNaN(max) && max > 0 && words.length > max) {
        words = words.slice(0, max);
      }
    }

    for (i = 0; i < words.length; i += 1) {
      words[i] = wordKey(words[i]);
    }
    return words;
  }

  function createSession(keys, settings) {
    return {
      version: 2,
      scope: settings.scope,
      mode: settings.mode,
      order: settings.order,
      limit: settings.limit,
      originalDeck: keys.slice(0),
      deck: keys.slice(0),
      index: 0,
      phase: 'initial',
      reviewRound: 0,
      outstanding: {},
      firstPassKnown: 0,
      initialTotal: keys.length,
      completed: false,
      createdAt: new Date().getTime()
    };
  }

  function isKnownRating(rating) {
    return rating === 'good' || rating === 'easy';
  }

  function rateProgress(existing, rating, now) {
    var p = existing || {};
    var result = {
      seen: Number(p.seen || 0) + 1,
      correct: Number(p.correct || 0),
      ease: Number(p.ease || 2.5),
      intervalDays: Number(p.intervalDays || 0),
      dueAt: Number(p.dueAt || 0),
      lastSeenAt: now,
      lastRating: rating
    };
    var minute = 60000;
    var day = 86400000;

    if (rating === 'again') {
      result.ease = Math.max(1.3, result.ease - 0.2);
      result.intervalDays = 0;
      result.dueAt = now + minute;
    } else if (rating === 'hard') {
      result.correct += 1;
      result.ease = Math.max(1.3, result.ease - 0.08);
      result.intervalDays = Math.max(10 / 1440, result.intervalDays * 1.2);
      result.dueAt = now + 10 * minute;
    } else if (rating === 'easy') {
      result.correct += 1;
      result.ease = Math.min(3.2, result.ease + 0.15);
      result.intervalDays = result.intervalDays > 0 ? Math.max(4, result.intervalDays * 3.5) : 4;
      result.dueAt = now + result.intervalDays * day;
    } else {
      result.correct += 1;
      result.intervalDays = result.intervalDays > 0 ? Math.max(1, result.intervalDays * result.ease) : 1;
      result.dueAt = now + result.intervalDays * day;
    }

    return result;
  }

  function outstandingKeys(session) {
    var keys = [];
    var key;
    for (key in session.outstanding) {
      if (Object.prototype.hasOwnProperty.call(session.outstanding, key) && session.outstanding[key]) {
        keys.push(key);
      }
    }
    return keys;
  }

  function outstandingCount(session) {
    return outstandingKeys(session).length;
  }

  function markRating(session, key, rating) {
    if (isKnownRating(rating)) {
      delete session.outstanding[key];
    } else {
      session.outstanding[key] = true;
    }
    if (session.phase === 'initial' && isKnownRating(rating)) {
      session.firstPassKnown += 1;
    }
  }

  function advancePhase(session) {
    var keys;
    if (!session) {
      return 'none';
    }
    keys = outstandingKeys(session);
    if (keys.length) {
      session.phase = 'review';
      session.reviewRound += 1;
      session.deck = shuffle(keys);
      session.index = 0;
      return 'review';
    }
    session.completed = true;
    return 'complete';
  }

  window.HanziReview = {
    normalizeDatabase: normalizeDatabase,
    enrichDatabase: enrichDatabase,
    cleanDatabase: cleanDatabase,
    normalizeWord: normalizeWord,
    wordKey: wordKey,
    allWords: allWords,
    findWord: findWord,
    selectedWords: selectedWords,
    shuffle: shuffle,
    buildDeck: buildDeck,
    createSession: createSession,
    rateProgress: rateProgress,
    isKnownRating: isKnownRating,
    outstandingKeys: outstandingKeys,
    outstandingCount: outstandingCount,
    markRating: markRating,
    advancePhase: advancePhase
  };
})(window);
