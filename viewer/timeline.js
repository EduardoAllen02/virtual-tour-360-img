// timeline.js — Frame scrubber with IT/EN language support
import { t, getLang } from './lang.js';

let _totalFrames = 0;
let _goToFrame   = null;
let _isDragging  = false;
let _counter     = null;
let _currentIdx  = 0;
let _poiRefs     = [];

function _frameLabel(idx, total) {
  const word = getLang() === 'it' ? 'Fotogramma' : 'Frame';
  return `${word} ${idx + 1} / ${total}`;
}

export function initTimeline(totalFrames, pois, goToFrame, onPOIClick) {
  _totalFrames = totalFrames;
  _goToFrame   = goToFrame;

  const track    = document.getElementById('tl-track');
  const fill     = document.getElementById('tl-fill');
  const handle   = document.getElementById('tl-handle');
  const ticks    = document.getElementById('tl-ticks');
  const poiLayer = document.getElementById('tl-pois');
  _counter       = document.getElementById('tl-counter');

  if (totalFrames > 0) {
    drawTicks(ticks, totalFrames);
    _poiRefs = renderPOIs(poiLayer, pois, totalFrames, goToFrame, onPOIClick);
    if (_counter) _counter.textContent = _frameLabel(0, totalFrames);
  }

  document.addEventListener('langchange', () => {
    if (_counter) _counter.textContent = _frameLabel(_currentIdx, _totalFrames);
    _poiRefs.forEach(({ labelEl, markerEl, poi }) => {
      const txt = t(poi.label);
      labelEl.textContent = txt;
      markerEl.title = txt;
    });
  });

  window._timelineOnFrame = (idx) => {
    _currentIdx = idx;
    syncScrubber(fill, handle, idx, _totalFrames);
    if (_counter) _counter.textContent = _frameLabel(idx, _totalFrames);
  };

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (_totalFrames) drawTicks(ticks, _totalFrames);
    }, 200);
  });

  function pctFromEvent(e) {
    const rect = track.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }

  function seekToPct(pct) {
    if (!_totalFrames) return;
    const idx = Math.round(pct * (_totalFrames - 1));
    syncScrubber(fill, handle, idx, _totalFrames);
    _goToFrame(idx);
  }

  track.addEventListener('mousedown', e => { _isDragging = true; seekToPct(pctFromEvent(e)); });
  document.addEventListener('mousemove', e => { if (!_isDragging) return; seekToPct(pctFromEvent(e)); });
  document.addEventListener('mouseup', () => { _isDragging = false; });

  track.addEventListener('touchstart', e => { _isDragging = true; seekToPct(pctFromEvent(e.touches[0])); }, { passive: true });
  document.addEventListener('touchmove', e => { if (!_isDragging) return; seekToPct(pctFromEvent(e.touches[0])); }, { passive: true });
  document.addEventListener('touchend', () => { _isDragging = false; });
}

function syncScrubber(fill, handle, idx, total) {
  if (!total || total <= 1) return;
  const pct = idx / (total - 1);
  fill.style.width  = (pct * 100) + '%';
  handle.style.left = (pct * 100) + '%';
}

function drawTicks(canvas, totalFrames) {
  const dpr = window.devicePixelRatio || 1;
  const w   = canvas.offsetWidth;
  const h   = canvas.offsetHeight;
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const cy = h / 2;

  const micro = Math.max(1, Math.ceil(totalFrames / 120));
  const minor = Math.max(5, Math.ceil(totalFrames / 20));
  const major = Math.max(10, Math.ceil(totalFrames / 5));

  for (let i = 0; i <= totalFrames - 1; i += micro) {
    const x = (i / Math.max(1, totalFrames - 1)) * w;
    let tickH = 4, alpha = 0.18, lw = 0.8;
    if (i % major === 0) { tickH = 14; alpha = 0.55; lw = 1.5; }
    else if (i % minor === 0) { tickH = 8; alpha = 0.30; lw = 1; }
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth   = lw;
    ctx.beginPath();
    ctx.moveTo(x, cy - tickH / 2);
    ctx.lineTo(x, cy + tickH / 2);
    ctx.stroke();
  }
}

function renderPOIs(container, pois, totalFrames, goToFrame, onPOIClick) {
  container.innerHTML = '';
  const refs = [];
  pois.forEach(poi => {
    const pct = (poi.frame / Math.max(1, totalFrames - 1)) * 100;
    const label = t(poi.label);

    const marker = document.createElement('div');
    marker.className = 'poi-marker';
    marker.style.left = pct + '%';
    marker.title = label;

    const circle = document.createElement('div');
    circle.className = 'poi-circle';
    const labelEl = document.createElement('span');
    labelEl.className = 'poi-label';
    labelEl.textContent = label;

    marker.appendChild(circle);
    marker.appendChild(labelEl);

    marker.addEventListener('click', e => {
      e.stopPropagation();
      goToFrame(poi.frame);
      if (onPOIClick && poi.cameraAngle) onPOIClick(poi.cameraAngle.lon, poi.cameraAngle.lat);
    });

    container.appendChild(marker);
    refs.push({ labelEl, markerEl: marker, poi });
  });
  return refs;
}
