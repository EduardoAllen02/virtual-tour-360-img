// viewer.js — Image-based 360° viewer with full preload
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { initTimeline } from './timeline.js';
import { initOverlays, updateOverlays } from './overlays.js';
import { initHotspots, updateHotspots, closeHotspotPanel } from './hotspots.js';
import { setLang } from './lang.js';

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

// ── Full parallel preload (all frames → HTTP cache) ───────────
async function prefetchAllParallel(onProgress) {
  const BATCH = 30;  // concurrent HTTP requests per batch
  let done = 0;
  for (let i = 0; i < frames.length; i += BATCH) {
    const end   = Math.min(i + BATCH, frames.length);
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
    if (onProgress) onProgress(done / frames.length);
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

  try {
    const res    = await fetch(CONFIG_PATH);
    const config = await res.json();

    frames = (config.frames || []).map(f =>
      f.startsWith('http') || f.startsWith('blob') ? f : '../' + f
    );
    if (!frames.length) throw new Error('no frames');

    // Update loading screen to show frame count
    const loaderTitle = document.getElementById('loader-title');
    if (loaderTitle) loaderTitle.textContent = `Caricamento ${frames.length} frame...`;

    // Full parallel preload — ALL frames before showing tour
    const fillEl = document.getElementById('loader-fill');
    const pctEl  = document.getElementById('loader-pct');
    function updateLoadUI(ratio) {
      const p = Math.min(100, Math.round(ratio * 100));
      if (fillEl) fillEl.style.width = p + '%';
      if (pctEl)  pctEl.textContent  = p + '%';
    }

    await prefetchAllParallel(updateLoadUI);

    // All frames in HTTP cache — start tour
    initTimeline(frames.length, config.pois || [], goToFrame, animateCameraTo);
    initOverlays(scene, config.overlays || []);
    initHotspots(scene, config.hotspots || []);

    // Smooth fade-out of loading screen
    if (filePicker) {
      filePicker.style.transition = 'opacity 0.5s ease';
      filePicker.style.opacity = '0';
      setTimeout(() => { filePicker.style.display = 'none'; }, 520);
    }
    goToFrame(0);

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
