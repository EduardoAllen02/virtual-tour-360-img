// viewer.js — Image-based 360° viewer with full preload
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { initTimeline } from './timeline.js';
import { initOverlays, updateOverlays } from './overlays.js';
import { initHotspots, updateHotspots, closeHotspotPanel } from './hotspots.js';
import { setLang, getLang } from './lang.js';

const CONFIG_PATH = '../tour-config.json';

// GPU texture cache config (HTTP cache is handled by full preload)
const TEX_AHEAD    = 5;
const TEX_BEHIND   = 2;
const MAX_TEX_CACHE = 20;

// ── State ─────────────────────────────────────────────────────
let frames      = [];
let currentIdx  = 0;
let _seekTarget = -1;  // tracks latest seek to discard stale texture loads
const textureCache   = new Map();
const httpPrefetched = new Set();

// ── DOM ───────────────────────────────────────────────────────
const viewerEl   = document.getElementById('viewer');
const filePicker = document.getElementById('file-picker');

// ── Three.js Setup ────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
viewerEl.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = 'label-renderer';
labelRenderer.domElement.style.pointerEvents = 'none';
viewerEl.appendChild(labelRenderer.domElement);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(100, 1, 0.1, 1100);

const sphereGeo = new THREE.SphereGeometry(500, 64, 32);
sphereGeo.scale(-1, 1, 1);
const sphereMat = new THREE.MeshBasicMaterial({ color: 0x111122 });
const sphere    = new THREE.Mesh(sphereGeo, sphereMat);
scene.add(sphere);

// ── Camera Control ────────────────────────────────────────────
let lon = 0, lat = 0, fov = 100;
const _ptrs      = new Map();  // active pointers: id → {x, y}
let   _pinchDist = 0;

function updateCamera() {
  const lonRad = THREE.MathUtils.degToRad(lon);
  const latRad = THREE.MathUtils.degToRad(lat);
  camera.lookAt(
    Math.cos(latRad) * Math.sin(lonRad),
    Math.sin(latRad),
    Math.cos(latRad) * Math.cos(lonRad)
  );
}

export function getCurrentLonLat() { return { lon, lat }; }

export function animateCameraTo(targetLon, targetLat, duration = 700) {
  const startLon = lon, startLat = lat;
  const dLon = ((targetLon - startLon + 540) % 360) - 180;
  const startTime = performance.now();
  function tick() {
    const t = Math.min(1, (performance.now() - startTime) / duration);
    const ease = 1 - Math.pow(1 - t, 3);
    lon = startLon + dLon * ease;
    lat = startLat + (targetLat - startLat) * ease;
    updateCamera();
    if (t < 1) requestAnimationFrame(tick);
  }
  tick();
}

renderer.domElement.addEventListener('pointerdown', e => {
  e.preventDefault();
  _ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  renderer.domElement.setPointerCapture(e.pointerId);
  viewerEl.classList.add('dragging');
}, { passive: false });

renderer.domElement.addEventListener('pointermove', e => {
  if (!_ptrs.has(e.pointerId)) return;
  const prev = _ptrs.get(e.pointerId);
  _ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (_ptrs.size === 1) {
    // Single pointer — rotate sphere
    lon += (e.clientX - prev.x) * 0.18;
    lat  = Math.max(-85, Math.min(85, lat + (e.clientY - prev.y) * 0.18));
    updateCamera();
  } else if (_ptrs.size === 2) {
    // Two pointers — pinch zoom
    const [a, b] = [..._ptrs.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (_pinchDist > 0) {
      fov = THREE.MathUtils.clamp(fov + (_pinchDist - dist) * 0.15, 30, 100);
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    _pinchDist = dist;
  }
});

const _stopPointer = e => {
  _ptrs.delete(e.pointerId);
  if (_ptrs.size < 2) _pinchDist = 0;
  if (_ptrs.size === 0) viewerEl.classList.remove('dragging');
};
renderer.domElement.addEventListener('pointerup',     _stopPointer);
renderer.domElement.addEventListener('pointercancel', _stopPointer);

renderer.domElement.addEventListener('wheel', e => {
  e.preventDefault();
  fov = THREE.MathUtils.clamp(fov + e.deltaY * 0.04, 30, 100);
  camera.fov = fov; camera.updateProjectionMatrix();
}, { passive: false });

document.addEventListener('keydown', e => {
  if (!frames.length) return;
  if (e.key === 'ArrowRight') goToFrame(currentIdx + 1);
  if (e.key === 'ArrowLeft')  goToFrame(currentIdx - 1);
});

// ── Resize ────────────────────────────────────────────────────
function onResize() {
  const w = viewerEl.clientWidth, h = viewerEl.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
}
window.addEventListener('resize', onResize);

// ── Render loop ───────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  updateCamera();
  updateOverlays(currentIdx);
  updateHotspots(currentIdx);
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

// ── Parallel preload range (startIdx → endIdx, HTTP + SW cache) ──
async function prefetchRange(startIdx, endIdx, onProgress) {
  const BATCH = 30;
  let done = 0;
  const total = endIdx - startIdx;
  for (let i = startIdx; i < endIdx; i += BATCH) {
    const end   = Math.min(i + BATCH, endIdx);
    const batch = [];
    for (let j = i; j < end; j++) batch.push(j);

    await Promise.all(batch.map(j =>
      new Promise(resolve => {
        if (httpPrefetched.has(j)) { resolve(); return; }
        httpPrefetched.add(j);
        const img = new Image();
        img.onload = img.onerror = () => resolve();
        img.src = frames[j];
      })
    ));
    done += batch.length;
    if (onProgress) onProgress(done / total);
  }
}

// ── THREE.Texture cache ───────────────────────────────────────
const loader = new THREE.TextureLoader();

function loadTexture(idx) {
  if (textureCache.has(idx)) return Promise.resolve(textureCache.get(idx));
  if (idx < 0 || idx >= frames.length) return Promise.reject('out of range');
  return new Promise((resolve, reject) => {
    loader.load(
      frames[idx],
      tex => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter  = THREE.LinearFilter;
        textureCache.set(idx, tex);
        evictFarTextures(currentIdx);
        resolve(tex);
      },
      undefined,
      reject
    );
  });
}

function evictFarTextures(centerIdx) {
  if (textureCache.size <= MAX_TEX_CACHE) return;
  const sorted = [...textureCache.entries()]
    .sort(([a], [b]) => Math.abs(b - centerIdx) - Math.abs(a - centerIdx));
  const toEvict = sorted.slice(MAX_TEX_CACHE);
  for (const [key, tex] of toEvict) {
    tex.dispose();
    textureCache.delete(key);
  }
}

function preloadGPU(centerIdx) {
  for (let i = centerIdx - TEX_BEHIND; i <= centerIdx + TEX_AHEAD; i++) {
    if (i >= 0 && i < frames.length && !textureCache.has(i)) {
      loadTexture(i).catch(() => {});
    }
  }
}

// ── Frame navigation ──────────────────────────────────────────
export function goToFrame(idx) {
  if (!frames.length) return;
  idx = Math.max(0, Math.min(frames.length - 1, idx));
  currentIdx  = idx;
  _seekTarget = idx;

  // Update timeline position immediately — don't wait for texture
  if (window._timelineOnFrame) window._timelineOnFrame(idx);

  const myTarget = idx;
  loadTexture(idx).then(tex => {
    // Discard if user has already seeked to a different frame
    if (_seekTarget !== myTarget) return;
    sphere.material = new THREE.MeshBasicMaterial({ map: tex });
    preloadGPU(idx);
  }).catch(() => {});
}

// ── Init ──────────────────────────────────────────────────────
async function init() {
  onResize();

  // Register Service Worker for persistent frame caching
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('../sw.js').catch(() => {});
  }

  try {
    const res    = await fetch(CONFIG_PATH);
    const config = await res.json();

    frames = (config.frames || []).map(f =>
      f.startsWith('http') || f.startsWith('blob') ? f : '../' + f
    );
    if (!frames.length) throw new Error('no frames');

    // Loader text reacts to IT/EN toggle
    const loaderTitleEl = document.getElementById('loader-title');
    function syncLoaderText() {
      if (!loaderTitleEl) return;
      loaderTitleEl.textContent = getLang() === 'en' ? 'Loading...' : 'Caricamento...';
    }
    syncLoaderText();
    document.addEventListener('langchange', syncLoaderText);

    // Phase 1: preload first 60% — user waits for this
    const phase1End = Math.ceil(frames.length * 0.6);
    await prefetchRange(0, phase1End, null);

    // Tour is ready — show it
    initTimeline(frames.length, config.pois || [], goToFrame, animateCameraTo);
    initOverlays(scene, config.overlays || []);
    initHotspots(scene, config.hotspots || []);

    if (filePicker) {
      filePicker.style.transition = 'opacity 0.5s ease';
      filePicker.style.opacity = '0';
      setTimeout(() => { filePicker.style.display = 'none'; }, 520);
    }
    goToFrame(0);

    // Phase 2: load remaining 60% silently in background
    prefetchRange(phase1End, frames.length, null).catch(() => {});

  } catch {
    initTimeline(0, [], goToFrame, animateCameraTo);
    initOverlays(scene, []);
    if (filePicker) filePicker.style.display = 'none';
  }

  animate();
}

init();

// Language toggle
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setLang(btn.dataset.lang);
  });
});

// Hotspot panel close
document.getElementById('hs-close')?.addEventListener('click', closeHotspotPanel);
