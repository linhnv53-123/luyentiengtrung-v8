(function (window, document) {
  'use strict';

  var container = null;
  var hint = null;
  var pads = [];
  var history = [];
  var resizeTimer = null;
  var mouseOwner = null;
  var supportsPassive = false;

  try {
    var passiveOptions = {};
    Object.defineProperty(passiveOptions, 'passive', {
      get: function () {
        supportsPassive = true;
        return false;
      }
    });
    window.addEventListener('hanzi-passive-test', function () {}, passiveOptions);
    window.removeEventListener('hanzi-passive-test', function () {}, passiveOptions);
  } catch (error) {
    supportsPassive = false;
  }

  function touchOptions() {
    return supportsPassive ? { passive: false } : false;
  }

  function splitCharacters(text) {
    var chars = [];
    var i;
    text = String(text || '');
    for (i = 0; i < text.length; i += 1) {
      if (!/\s/.test(text.charAt(i))) {
        chars.push(text.charAt(i));
      }
    }
    return chars;
  }

  function createLine(className) {
    var line = document.createElement('i');
    line.className = 'grid-line ' + className;
    return line;
  }

  function createPad(index) {
    var box = document.createElement('div');
    var inner = document.createElement('div');
    var label = document.createElement('span');
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    var pad;

    box.className = 'char-box';
    inner.className = 'char-box-inner';
    label.className = 'char-index';
    label.textContent = String(index + 1);
    canvas.className = 'write-canvas';
    canvas.setAttribute('aria-label', 'Ô viết chữ số ' + String(index + 1));

    inner.appendChild(label);
    inner.appendChild(canvas);
    inner.appendChild(createLine('grid-v'));
    inner.appendChild(createLine('grid-h'));
    inner.appendChild(createLine('grid-d1'));
    inner.appendChild(createLine('grid-d2'));
    box.appendChild(inner);

    pad = {
      box: box,
      canvas: canvas,
      context: context,
      strokes: [],
      activeStroke: null,
      activeTouchId: null,
      mouseDown: false
    };

    bindPadEvents(pad, index);
    return pad;
  }

  function bindPadEvents(pad, index) {
    pad.canvas.addEventListener('mousedown', function (event) {
      startMouse(event, pad, index);
    }, false);
    pad.canvas.addEventListener('mousemove', function (event) {
      moveMouse(event, pad);
    }, false);
    pad.canvas.addEventListener('mouseup', function (event) {
      endMouse(event, pad);
    }, false);
    pad.canvas.addEventListener('mouseleave', function (event) {
      endMouse(event, pad);
    }, false);

    pad.canvas.addEventListener('touchstart', function (event) {
      startTouch(event, pad, index);
    }, touchOptions());
    pad.canvas.addEventListener('touchmove', function (event) {
      moveTouch(event, pad);
    }, touchOptions());
    pad.canvas.addEventListener('touchend', function (event) {
      endTouch(event, pad);
    }, touchOptions());
    pad.canvas.addEventListener('touchcancel', function (event) {
      endTouch(event, pad);
    }, touchOptions());
  }

  function pointFromClient(clientX, clientY, pad) {
    var rect = pad.canvas.getBoundingClientRect();
    var width = rect.width || 1;
    var height = rect.height || 1;
    var x = (clientX - rect.left) / width;
    var y = (clientY - rect.top) / height;
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));
    return { x: x, y: y };
  }

  function startStroke(pad, index, point) {
    var stroke = [point];
    pad.activeStroke = stroke;
    pad.strokes.push(stroke);
    history.push({ padIndex: index, stroke: stroke });
    redrawPad(pad);
  }

  function addPoint(pad, point) {
    var previous;
    if (!pad.activeStroke) {
      return;
    }
    previous = pad.activeStroke[pad.activeStroke.length - 1];
    pad.activeStroke.push(point);
    drawSegment(pad, previous, point);
  }

  function startMouse(event, pad, index) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    mouseOwner = pad;
    pad.mouseDown = true;
    startStroke(pad, index, pointFromClient(event.clientX, event.clientY, pad));
  }

  function moveMouse(event, pad) {
    if (!pad.mouseDown || mouseOwner !== pad) {
      return;
    }
    event.preventDefault();
    addPoint(pad, pointFromClient(event.clientX, event.clientY, pad));
  }

  function endMouse(event, pad) {
    if (!pad.mouseDown) {
      return;
    }
    if (event && event.preventDefault) {
      event.preventDefault();
    }
    pad.mouseDown = false;
    pad.activeStroke = null;
    if (mouseOwner === pad) {
      mouseOwner = null;
    }
  }

  function findTouchById(touchList, id) {
    var i;
    for (i = 0; i < touchList.length; i += 1) {
      if (touchList[i].identifier === id) {
        return touchList[i];
      }
    }
    return null;
  }

  function startTouch(event, pad, index) {
    var touch;
    if (pad.activeTouchId !== null || !event.changedTouches || !event.changedTouches.length) {
      return;
    }
    event.preventDefault();
    touch = event.changedTouches[0];
    pad.activeTouchId = touch.identifier;
    startStroke(pad, index, pointFromClient(touch.clientX, touch.clientY, pad));
  }

  function moveTouch(event, pad) {
    var touch;
    if (pad.activeTouchId === null) {
      return;
    }
    touch = findTouchById(event.touches, pad.activeTouchId);
    if (!touch) {
      return;
    }
    event.preventDefault();
    addPoint(pad, pointFromClient(touch.clientX, touch.clientY, pad));
  }

  function endTouch(event, pad) {
    var touch;
    if (pad.activeTouchId === null) {
      return;
    }
    touch = findTouchById(event.changedTouches || [], pad.activeTouchId);
    if (!touch && event.type !== 'touchcancel') {
      return;
    }
    event.preventDefault();
    pad.activeTouchId = null;
    pad.activeStroke = null;
  }

  function lineWidth(pad) {
    var size = Math.min(pad.canvas.clientWidth || 1, pad.canvas.clientHeight || 1);
    return Math.max(4, size / 34);
  }

  function drawSegment(pad, from, to) {
    var context = pad.context;
    var width = pad.canvas.clientWidth || 1;
    var height = pad.canvas.clientHeight || 1;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#0f172a';
    context.lineWidth = lineWidth(pad);
    context.beginPath();
    context.moveTo(from.x * width, from.y * height);
    context.lineTo(to.x * width, to.y * height);
    context.stroke();
  }

  function redrawPad(pad) {
    var context = pad.context;
    var width = pad.canvas.clientWidth || 1;
    var height = pad.canvas.clientHeight || 1;
    var i;
    var j;
    var stroke;

    context.clearRect(0, 0, width, height);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#0f172a';
    context.fillStyle = '#0f172a';
    context.lineWidth = lineWidth(pad);

    for (i = 0; i < pad.strokes.length; i += 1) {
      stroke = pad.strokes[i];
      if (!stroke.length) {
        continue;
      }
      if (stroke.length === 1) {
        context.beginPath();
        context.arc(stroke[0].x * width, stroke[0].y * height, context.lineWidth / 2, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      context.beginPath();
      context.moveTo(stroke[0].x * width, stroke[0].y * height);
      for (j = 1; j < stroke.length; j += 1) {
        context.lineTo(stroke[j].x * width, stroke[j].y * height);
      }
      context.stroke();
    }
  }

  function resizePad(pad) {
    var rect = pad.box.getBoundingClientRect();
    var cssWidth = Math.max(1, Math.round(rect.width));
    var cssHeight = Math.max(1, Math.round(rect.height));
    var ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    var pixelWidth = Math.round(cssWidth * ratio);
    var pixelHeight = Math.round(cssHeight * ratio);

    if (pad.canvas.width === pixelWidth && pad.canvas.height === pixelHeight) {
      return;
    }

    pad.canvas.width = pixelWidth;
    pad.canvas.height = pixelHeight;
    pad.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    redrawPad(pad);
  }

  function layoutColumns() {
    var count = pads.length;
    var mobile = window.innerWidth < 570;
    var columns;

    if (!container || !count) {
      return;
    }

    container.setAttribute('data-count', String(count));

    if (count === 1) {
      container.style.gridTemplateColumns = mobile ? 'minmax(0, min(100%, 330px))' : 'minmax(0, 380px)';
      container.style.justifyContent = 'center';
      return;
    }

    if (mobile) {
      columns = count === 1 ? 1 : 2;
    } else {
      columns = Math.min(count, 4);
    }
    container.style.gridTemplateColumns = 'repeat(' + String(columns) + ', minmax(0, 1fr))';
    container.style.justifyContent = 'stretch';
  }

  function resizeAll() {
    var i;
    layoutColumns();
    for (i = 0; i < pads.length; i += 1) {
      resizePad(pads[i]);
    }
  }

  function scheduleResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resizeAll, 100);
  }

  function build(text) {
    var chars = splitCharacters(text);
    var i;
    var pad;

    if (!container) {
      return;
    }

    container.innerHTML = '';
    container.removeAttribute('data-count');
    pads = [];
    history = [];

    if (!chars.length) {
      if (hint) {
        hint.textContent = 'Bảng viết sẽ xuất hiện khi bắt đầu lượt học';
      }
      return;
    }

    if (hint) {
      hint.textContent = String(chars.length) + ' chữ · mỗi chữ một ô';
    }

    for (i = 0; i < chars.length; i += 1) {
      pad = createPad(i);
      pads.push(pad);
      container.appendChild(pad.box);
    }

    layoutColumns();
    window.setTimeout(resizeAll, 0);
  }

  function clear() {
    var i;
    for (i = 0; i < pads.length; i += 1) {
      pads[i].strokes = [];
      pads[i].activeStroke = null;
      pads[i].activeTouchId = null;
      pads[i].mouseDown = false;
      redrawPad(pads[i]);
    }
    history = [];
  }

  function undo() {
    var last = history.pop();
    var pad;
    var i;
    if (!last) {
      return false;
    }
    pad = pads[last.padIndex];
    if (!pad) {
      return false;
    }
    for (i = pad.strokes.length - 1; i >= 0; i -= 1) {
      if (pad.strokes[i] === last.stroke) {
        pad.strokes.splice(i, 1);
        break;
      }
    }
    redrawPad(pad);
    return true;
  }

  function init(containerElement, hintElement) {
    container = containerElement;
    hint = hintElement;
    window.addEventListener('resize', scheduleResize, false);
    window.addEventListener('orientationchange', function () {
      window.setTimeout(resizeAll, 260);
    }, false);
  }

  function syntheticStroke(padIndex) {
    var pad = pads[padIndex || 0];
    var stroke;
    if (!pad) {
      return false;
    }
    stroke = [
      { x: 0.2, y: 0.2 },
      { x: 0.5, y: 0.5 },
      { x: 0.8, y: 0.75 }
    ];
    pad.strokes.push(stroke);
    history.push({ padIndex: padIndex || 0, stroke: stroke });
    redrawPad(pad);
    return true;
  }

  window.HanziDrawing = {
    init: init,
    build: build,
    clear: clear,
    undo: undo,
    resizeAll: resizeAll,
    getPadCount: function () {
      return pads.length;
    },
    getStrokeCount: function () {
      var count = 0;
      var i;
      for (i = 0; i < pads.length; i += 1) {
        count += pads[i].strokes.length;
      }
      return count;
    },
    syntheticStroke: syntheticStroke
  };
})(window, document);
