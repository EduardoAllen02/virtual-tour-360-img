// hotspots.js — Matterport-style info hotspots. Language via lang.js
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { lonLatToVec3 } from './overlays.js';
import { t, getLang } from './lang.js';

let _items  = [];
let _openId = null;

export function initHotspots(scene, hotspots) {
  hotspots.forEach(hs => {
    const el  = _buildMarker(hs);
    const obj = new CSS2DObject(el);
    obj.visible = false;
    obj.position.copy(lonLatToVec3(hs.lon, hs.lat));
    scene.add(obj);
    _items.push({ obj, config: hs });
  });

  document.addEventListener('langchange', () => _refreshOpenPanel());
}

export function updateHotspots(currentFrame) {
  _items.forEach(({ obj, config }) => {
    const start = config.frameStart ?? 0;
    const end   = config.frameEnd   ?? Infinity;
    obj.visible = currentFrame >= start && currentFrame <= end;
  });
}

function _buildMarker(hs) {
  const wrap = document.createElement('div');
  wrap.className = 'hs-marker';

  const btn = document.createElement('button');
  btn.className = 'hs-btn';
  btn.setAttribute('aria-label', 'Info');
  btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
    <circle cx="11" cy="11" r="10" stroke="white" stroke-width="1.8"/>
    <path d="M11 10v5.5" stroke="white" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="11" cy="7" r="1.1" fill="white"/>
  </svg>`;

  const stem = document.createElement('div');
  stem.className = 'hs-stem';
  const dot = document.createElement('div');
  dot.className = 'hs-dot';

  wrap.appendChild(btn);
  wrap.appendChild(stem);
  wrap.appendChild(dot);

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const panel = document.getElementById('hotspot-panel');
    if (_openId === hs.id && panel && panel.classList.contains('hs-visible')) {
      closeHotspotPanel();
    } else {
      _openPanel(hs);
    }
  });

  return wrap;
}

function _openPanel(hs) {
  const panel = document.getElementById('hotspot-panel');
  if (!panel) return;
  _openId = hs.id;

  const imgEl   = document.getElementById('hs-img');
  const titleEl = document.getElementById('hs-title');
  const descEl  = document.getElementById('hs-desc');
  const linkEl  = document.getElementById('hs-link');

  if (hs.image) {
    imgEl.src = hs.image;
    imgEl.style.display = 'block';
  } else {
    imgEl.style.display = 'none';
  }

  titleEl.textContent = t(hs.label);
  descEl.textContent  = t(hs.description);
  linkEl.textContent  = getLang() === 'it' ? 'Vedi altro →' : 'See more →';
  linkEl.href = hs.link || '#';

  panel.classList.remove('hs-hidden');
  panel.classList.add('hs-visible');
}

function _refreshOpenPanel() {
  if (!_openId) return;
  const hs = _items.find(i => i.config.id === _openId)?.config;
  if (hs) _openPanel(hs);
}

export function closeHotspotPanel() {
  const panel = document.getElementById('hotspot-panel');
  if (panel) {
    panel.classList.remove('hs-visible');
    panel.classList.add('hs-hidden');
  }
  _openId = null;
}
