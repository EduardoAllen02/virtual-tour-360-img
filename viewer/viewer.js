// viewer.js — Image-based 360° viewer with lazy loading for 900+ frames
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { initTimeline } from './timeline.js';
import { initOverlays, updateOverlays } from './overlays.js';
import { initHotspots, updateHotspots, closeHotspotPanel } from './hotspots.js';
import { setLang } from './lang.js';

const CONFIG_PATH = '../tour-config.json';

// ── Lazy Loading Config ────────────────────────────────────────
const INITIAL_PREFETCH = 50;  // HTTP-prefetch on startup before showing tour
const AHEAD_PREFETCH   = 20;  // HTTP-prefetch window ahead of current
const BEHIND_PREFETCH  = 10;  // HTTP-prefetch window behind current
const CHUNK_SIZE       = 40;  // frames per background idle chunk
const TEX_AHEAD        = 5;   // THREE.Texture preload ahead (GPU)
const TEX_BEHIND       = 2;   // THREE.Texture keep behind (GPU)
const MAX_TEX_CACHE    = 20;  // max GPU textures in memory

// ── State ─────────────────────────────────────────────────────
let frames     = [];
let currentIdx = 0;
const textureCache   = new Map();  // idx → THREE.Texture (GPU)
const httpPrefetched = new Set();  // idx → already HTTP-fetched
let   bgQueue        = [];         // background prefetch queue
let   bgActive       = false;

// ── DOM ───────────────────────────────────────────────────────
const viewerEl   = document.getElementById('viewer');
const filePicker = document.getElementById('file-picker');

// ── Loading bar ───────────────────────────────────────────────
const loadBar = document.createElement('div');
loadBar.id = 'lazy-load-bar';
Object.assign(loadBar.style, {
  position: 'fixed', bottom: '0', left: '0', height: '3px',
  background: 'linear-gradient(90deg,#6366f1,#8b5cf6)',
  width: '0%', zIndex: '9999', transition: 'width 0.3s ease',
  pointerEvents: 'none',
});
document.body.appendChild(loadBar);

function setLoadBar(pct) {
  loadBar.style.width = pct + '%';
  if (pct >= 100) setTimeout(() => { loadBar.style.opacity = '0'; }, 600);
}

// ── Three.js Setup ────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
viewerEl.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = 'label-renderer';
labelRenderer.domElement.style.pointerEvents = 'none';
viewerEl.appendChild(labelRenderer.domElement);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1100);

const sphereGeo = new THREE.SphereGeometry(500, 64, 32);
sphereGeo.scale(-1, 1, 1);
const sphereMat = new THREE.MeshBasicMaterial({ color: 0x111122 });
const sphere    = new THREE.Mesh(sphereGeo, sphereMat);
scene.add(sphere);

// ── Camera Control ────────────────────────────────────────────
let lon = 0, lat = 0, fov = 75;
let isDragging = false, dragX = 0, dragY = 0;

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
  isDragging = true; dragX = e.clientX; dragY = e.clientY;
  viewerEl.classList.add('dragging');
});
document.addEventListener('pointermove', e => {
  if (!isDragging) return;
  lon += (e.clientX - dragX) * 0.18;
  lat  = Math.max(-85, Math.min(85, lat + (e.clientY - dragY) * 0.18));
  dragX = e.clientX; dragY = e.clientY;
  updateCamera();
});
document.addEventListener('pointerup', () => {
  isDragging = false; viewerEl.classList.remove('dragging');
});

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

// ── HTTP Prefetch (browser cache, no GPU) ─────────────────────
function prefetchHTTP(idx) {
  if (httpPrefetched.has(idx) || idx < 0 || idx >= frames.length) return;
  httpPrefetched.add(idx);
  const img = new Image();
  img.src = frames[idx];
}

function prefetchWindow(centerIdx) {
  const start = Math.max(0, centerIdx - BEHIND_PREFETCH);
  const end   = Math.min(frames.length - 1, centerIdx + AHEAD_PREFETCH);
  for (let i = start; i <= end; i++) prefetchHTTP(i);
}

// ── Background idle loader ────────────────────────────────────
function scheduleBackground(fromIdx) {
  bgQueue = [];
  for (let i = fromIdx; i < frames.length; i++) {
    if (!httpPrefetched.has(i)) bgQueue.push(i);
  }
  if (!bgActive) processBackground();
}

function processBackground() {
  if (!bgQueue.length) { bgActive = false; return; }
  bgActive = true;

  const work = (deadline) => {
    let processed = 0;
    const hasTime = deadline
      ? () => deadline.timeRemaining() > 10
      : () => processed < CHUNK_SIZE;

    while (bgQueue.length && hasTime()) {
      prefetchHTTP(bgQueue.shift());
      processed++;
    }

    const pct = Math.round((httpPrefetched.size / frames.length) * 100);
    setLoadBar(Math.min(pct, 99));

    if (bgQueue.length) {
      const schedule = 'requestIdleCallback' in window
        ? (fn) => requestIdleCallback(fn, { timeout: 4000 })
        : (fn) => setTimeout(fn, 150);
      schedule(work);
    } else {
      bgActive = false;
      setLoadBar(100);
    }
  };

  if ('requestIdleCallback' in window) {
    requestIdleCallback(work, { timeout: 4000 });
  } else {
    setTimeout(() => work(null), 500);
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
  currentIdx = idx;

  loadTexture(idx).then(tex => {
    sphere.material = new THREE.MeshBasicMaterial({ map: tex });
    preloadGPU(idx);
    prefetchWindow(idx);
    // On big jumps: rebuild background queue from new position
    if (bgQueue.length && Math.abs(bgQueue[0] - idx) > CHUNK_SIZE * 2) {
      scheduleBackground(idx + AHEAD_PREFETCH);
    }
    if (window._timelineOnFrame) window._timelineOnFrame(idx);
  }).catch(() => {});
}

// ── Init ──────────────────────────────────────────────────────
async function init() {
  onResize();

  try {
    const res = await fetch(CONFIG_PATH);
    const config = await res.json();

    frames = (config.frames || []).map(f =>
      f.startsWith('http') || f.startsWith('blob') ? f : '../' + f
    );
    if (!frames.length) throw new Error('no frames');

    // Phase 1: HTTP-prefetch first INITIAL_PREFETCH frames, show bar
    setLoadBar(2);
    const initEnd = Math.min(INITIAL_PREFETCH, frames.length);
    for (let i = 0; i < initEnd; i++) prefetchHTTP(i);
    setLoadBar(Math.round((initEnd / frames.length) * 100));

    initTimeline(frames.length, config.pois || [], goToFrame, animateCameraTo);
    initOverlays(scene, config.overlays || []);
    initHotspots(scene, config.hotspots || []);
    filePicker.style.display = 'none';
    goToFrame(0);

    // Phase 2: Background idle load for remaining frames
    scheduleBackground(initEnd);

  } catch {
    initTimeline(0, [], goToFrame, animateCameraTo);
    initOverlays(scene, []);
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
