// timeline.js — Frame-index based scrubber

let _totalFrames = 0;
let _goToFrame   = null;
let _isDragging  = false;

export function initTimeline(totalFrames, pois, goToFrame, onPOIClick) {
  _totalFrames = totalFrames;
  _goToFrame   = goToFrame;

  const track    = document.getElementById('tl-track');
  const fill     = document.getElementById('tl-fill');
  const handle   = document.getElementById('tl-handle');
  const ticks    = document.getElementById('tl-ticks');
  const poiLayer = document.getElementById('tl-pois');
  const counter  = document.getElementById('tl-counter');

  if (totalFrames > 0) {
    drawTicks(ticks, totalFrames);
    renderPOIs(poiLayer, pois, totalFrames, goToFrame, onPOIClick);
    if (counter) counter.textContent = `Frame 1 / ${totalFrames}`;
  }

  // Viewer calls this on every frame change
  window._timelineOnFrame = (idx) => {
    syncScrubber(fill, handle, idx, _totalFrames);
    if (counter) counter.textContent = `Frame ${idx + 1} / ${_totalFrames}`;
  };

  // Resize → redraw ticks
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (_totalFrames) drawTicks(ticks, _totalFrames);
    }, 200);
  });

  // ── Drag ────────────────────────────────────────────
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

  track.addEventListener('mousedown', e => {
    _isDragging = true;
    seekToPct(pctFromEvent(e));
  });
  document.addEventListener('mousemove', e => {
    if (!_isDragging) return;
    seekToPct(pctFromEvent(e));
  });
  document.addEventListener('mouseup', () => { _isDragging = false; });

  track.addEventListener('touchstart', e => {
    _isDragging = true;
    seekToPct(pctFromEvent(e.touches[0]));
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!_isDragging) return;
    seekToPct(pctFromEvent(e.touches[0]));
  }, { passive: true });
  document.addEventListener('touchend', () => { _isDragging = false; });
}

function syncScrubber(fill, handle, idx, total) {
  if (!total || total <= 1) return;
  const pct = idx / (total - 1);
  fill.style.width  = (pct * 100) + '%';
  handle.style.left = (pct * 100) + '%';
}

// ── Tick marks drawn on canvas ────────────────────────
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

  // Adapt tick density to frame count
  const micro = Math.max(1, Math.ceil(totalFrames / 120));
  const minor = Math.max(5, Math.ceil(totalFrames / 20));
  const major = Math.max(10, Math.ceil(totalFrames / 5));

  for (let i = 0; i <= totalFrames - 1; i += micro) {
    const x = (i / Math.max(1, totalFrames - 1)) * w;
    let tickH = 4, alpha = 0.28, lw = 0.8;
    if (i % major === 0) { tickH = 14; alpha = 0.75; lw = 1.5; }
    else if (i % minor === 0) { tickH = 8; alpha = 0.5; lw = 1; }
    ctx.strokeStyle = `rgba(10, 36, 99, ${alpha})`;
    ctx.lineWidth   = lw;
    ctx.beginPath();
    ctx.moveTo(x, cy - tickH / 2);
    ctx.lineTo(x, cy + tickH / 2);
    ctx.stroke();
  }
}

// ── POI markers ───────────────────────────────────────
function renderPOIs(container, pois, totalFrames, goToFrame, onPOIClick) {
  container.innerHTML = '';
  pois.forEach(poi => {
    const pct = (poi.frame / Math.max(1, totalFrames - 1)) * 100;

    const marker = document.createElement('div');
    marker.className = 'poi-marker';
    marker.style.left = pct + '%';
    marker.title = poi.label;

    const circle = document.createElement('div');
    circle.className = 'poi-circle';
    const label = document.createElement('span');
    label.className = 'poi-label';
    label.textContent = poi.label;

    marker.appendChild(circle);
    marker.appendChild(label);

    marker.addEventListener('click', e => {
      e.stopPropagation();
      goToFrame(poi.frame);
      if (onPOIClick && poi.cameraAngle) {
        onPOIClick(poi.cameraAngle.lon, poi.cameraAngle.lat);
      }
    });

    container.appendChild(marker);
  });
}
