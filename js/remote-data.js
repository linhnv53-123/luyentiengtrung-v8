(function (window) {
  'use strict';

  var DATA_URL = 'data/lessons.json';

  function clone(value) {
    if (window.HanziStorage && window.HanziStorage.clone) {
      return window.HanziStorage.clone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function normalize(value) {
    if (window.HanziReview && window.HanziReview.normalizeDatabase) {
      return window.HanziReview.enrichDatabase(window.HanziReview.normalizeDatabase(value));
    }
    return value;
  }

  function requestJSON(url, callback) {
    var xhr = new window.XMLHttpRequest();
    var finished = false;

    function finish(error, data) {
      if (finished) {
        return;
      }
      finished = true;
      callback(error, data);
    }

    xhr.open('GET', url, true);
    xhr.timeout = 12000;
    try {
      xhr.setRequestHeader('Cache-Control', 'no-cache');
      xhr.setRequestHeader('Pragma', 'no-cache');
    } catch (ignore) {
      /* Một số trình duyệt không cho đặt header cache cho XHR cục bộ. */
    }
    xhr.onreadystatechange = function () {
      var parsed;
      if (xhr.readyState !== 4) {
        return;
      }
      if ((xhr.status >= 200 && xhr.status < 300) || (xhr.status === 0 && xhr.responseText)) {
        try {
          parsed = JSON.parse(xhr.responseText);
          finish(null, parsed);
        } catch (error) {
          finish(new Error('Dữ liệu GitHub không phải JSON hợp lệ.'));
        }
      } else {
        finish(new Error('Không tải được dữ liệu GitHub (HTTP ' + String(xhr.status || 0) + ').'));
      }
    };
    xhr.onerror = function () {
      finish(new Error('Không thể kết nối tới dữ liệu GitHub.'));
    };
    xhr.ontimeout = function () {
      finish(new Error('Hết thời gian chờ dữ liệu GitHub.'));
    };
    xhr.send(null);
  }

  function load(callback) {
    var fallback = window.HANZI_DEFAULT_DB ? clone(window.HANZI_DEFAULT_DB) : null;
    var separator = DATA_URL.indexOf('?') >= 0 ? '&' : '?';
    var url = DATA_URL + separator + '_sync=' + String(new Date().getTime());

    requestJSON(url, function (error, data) {
      var db;
      if (!error && data) {
        try {
          db = normalize(data);
          callback({
            db: db,
            source: 'github',
            error: null,
            syncedAt: new Date().getTime(),
            metadata: data.metadata || {}
          });
          return;
        } catch (normalizeError) {
          error = normalizeError;
        }
      }

      if (fallback) {
        callback({
          db: normalize(fallback),
          source: 'fallback',
          error: error || new Error('Đang dùng dữ liệu dự phòng.'),
          syncedAt: new Date().getTime(),
          metadata: fallback.metadata || {}
        });
        return;
      }

      callback({
        db: { version: 3, metadata: {}, lessons: [] },
        source: 'empty',
        error: error || new Error('Không có dữ liệu bài học.'),
        syncedAt: new Date().getTime(),
        metadata: {}
      });
    });
  }

  window.HanziRemoteData = {
    load: load,
    requestJSON: requestJSON,
    dataUrl: DATA_URL
  };
})(window);
