// viewer.js — Image-based 360° viewer
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { initTimeline } from './timeline.js';
import { initOverlays, updateOverlays } from './overlays.js';

const CONFIG_PATH = '../tour-config.json';

// ── State ─────────────────────────────────────────────
let frames = [];           // resolved URL list
let currentIdx = 0;
const textureCache = new Map(); // idx → THREE.Texture
const PRELOAD_AHEAD  = 3;
const PRELOAD_BEHIND = 2;

// ── DOM ───────────────────────────────────────────────
const viewerEl   = document.getElementById('viewer');
const filePicker = document.getElementById('file-picker');

// ── Three.js Setup ────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
viewerEl.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = 'label-renderer';
labelRenderer.domElement.style.pointerEvents = 'none';
viewerEl.appendChild(labelRenderer.domElement);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1100);

// 360° sphere (texture swapped per frame)
const sphereGeo = new THREE.SphereGeometry(500, 64, 32);
sphereGeo.scale(-1, 1, 1);
const sphereMat = new THREE.MeshBasicMaterial({ color: 0x111122 });
const sphere    = new THREE.Mesh(sphereGeo, sphereMat);
scene.add(sphere);

// ── Camera Control ────────────────────────────────────
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

// Drag
renderer.domElement.addEventListener('pointerdown', e => {
  isDragging = true; dragX = e.clientX; dragY = e.clientY;
  viewerEl.classList.add('dragging');
});
document.addEventListener('pointermove', e => {
  if (!isDragging) return;
  lon -= (e.clientX - dragX) * 0.18;
  lat  = Math.max(-85, Math.min(85, lat + (e.clientY - dragY) * 0.18));
  dragX = e.clientX; dragY = e.clientY;
  updateCamera();
});
document.addEventListener('pointerup', () => {
  isDragging = false; viewerEl.classList.remove('dragging');
});

// Scroll = zoom
renderer.domElement.addEventListener('wheel', e => {
  e.preventDefault();
  fov = THREE.MathUtils.clamp(fov + e.deltaY * 0.04, 30, 100);
  camera.fov = fov; camera.updateProjectionMatrix();
}, { passive: false });

// Keyboard navigation
document.addEventListener('keydown', e => {
  if (!frames.length) return;
  if (e.key === 'ArrowRight') goToFrame(currentIdx + 1);
  if (e.key === 'ArrowLeft')  goToFrame(currentIdx - 1);
});

// ── Resize ────────────────────────────────────────────
function onResize() {
  const w = viewerEl.clientWidth, h = viewerEl.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
}
window.addEventListener('resize', onResize);

// ── Render loop ───────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  updateCamera();
  updateOverlays(currentIdx);
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

// ── Texture loading & cache ───────────────────────────
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
        resolve(tex);
      },
      undefined,
      reject
    );
  });
}

function preloadAround(idx) {
  for (let i = idx - PRELOAD_BEHIND; i <= idx + PRELOAD_AHEAD; i++) {
    if (i >= 0 && i < frames.length && !textureCache.has(i)) {
      loadTexture(i).catch(() => {});
    }
  }
  // Evict textures far from current to keep memory reasonable
  for (const [key, tex] of textureCache) {
    if (Math.abs(key - idx) > PRELOAD_AHEAD + PRELOAD_BEHIND + 6) {
      tex.dispose();
      textureCache.delete(key);
    }
  }
}

// ── Frame navigation ──────────────────────────────────
export function goToFrame(idx) {
  if (!frames.length) return;
  idx = Math.max(0, Math.min(frames.length - 1, idx));
  currentIdx = idx;

  loadTexture(idx).then(tex => {
    sphere.material = new THREE.MeshBasicMaterial({ map: tex });
    preloadAround(idx);
    if (window._timelineOnFrame) window._timelineOnFrame(idx);
  }).catch(() => {});
}

// ── Init ──────────────────────────────────────────────
async function init() {
  onResize();

  try {
    const res = await fetch(CONFIG_PATH);
    const config = await res.json();

    // Frame paths in config are relative to project root → prepend '../' for viewer
    frames = (config.frames || []).map(f =>
      f.startsWith('http') || f.startsWith('blob') ? f : '../' + f
    );

    if (!frames.length) throw new Error('no frames');

    initTimeline(frames.length, config.pois || [], goToFrame, animateCameraTo);
    initOverlays(scene, config.overlays || []);
    filePicker.style.display = 'none';
    goToFrame(0);

  } catch {
    // No config or no frames — show picker
    initTimeline(0, [], goToFrame, animateCameraTo);
    initOverlays(scene, []);
  }

  animate();
}

init();
