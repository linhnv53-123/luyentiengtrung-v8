(function (window) {
  'use strict';

  var PREFIX = 'hanzi_trainer_v6_';
  var memory = {};
  var localAvailable = false;

  function testLocalStorage() {
    try {
      var key = PREFIX + 'test';
      window.localStorage.setItem(key, '1');
      window.localStorage.removeItem(key);
      localAvailable = true;
    } catch (error) {
      localAvailable = false;
    }
  }

  function getRaw(key) {
    var fullKey = PREFIX + key;
    if (localAvailable) {
      try {
        return window.localStorage.getItem(fullKey);
      } catch (error) {
        localAvailable = false;
      }
    }
    return Object.prototype.hasOwnProperty.call(memory, fullKey) ? memory[fullKey] : null;
  }

  function setRaw(key, value) {
    var fullKey = PREFIX + key;
    if (localAvailable) {
      try {
        window.localStorage.setItem(fullKey, value);
        return true;
      } catch (error) {
        localAvailable = false;
      }
    }
    memory[fullKey] = value;
    return false;
  }

  function remove(key) {
    var fullKey = PREFIX + key;
    if (localAvailable) {
      try {
        window.localStorage.removeItem(fullKey);
      } catch (error) {
        localAvailable = false;
      }
    }
    delete memory[fullKey];
  }

  function readJSON(key, fallback) {
    var raw = getRaw(key);
    if (!raw) {
      return fallback;
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    return setRaw(key, JSON.stringify(value));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  testLocalStorage();

  window.HanziStorage = {
    getRaw: getRaw,
    setRaw: setRaw,
    remove: remove,
    readJSON: readJSON,
    writeJSON: writeJSON,
    clone: clone,
    isPersistent: function () {
      return localAvailable;
    }
  };
})(window);
