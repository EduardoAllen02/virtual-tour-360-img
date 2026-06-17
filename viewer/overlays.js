// overlays.js — Spatial overlays with multilang support
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { t } from './lang.js';

const _objects = [];

export function initOverlays(scene, overlays) {
  overlays.forEach(ov => {
    const { el, refs } = _buildElement(ov);
    const obj = new CSS2DObject(el);
    obj.visible = false;
    obj.position.copy(lonLatToVec3(ov.lon, ov.lat));
    scene.add(obj);
    _objects.push({ obj, config: ov, refs });
  });

  document.addEventListener('langchange', () => {
    _objects.forEach(({ config, refs }) => {
      const d = config.data || {};
      if (refs.title)  refs.title.textContent  = t(d.title);
      if (refs.desc)   refs.desc.textContent   = t(d.description);
      if (refs.action) refs.action.textContent = t(d.action);
    });
  });
}

export function updateOverlays(currentFrame) {
  _objects.forEach(({ obj, config }) => {
    obj.visible = currentFrame >= config.frameStart && currentFrame <= config.frameEnd;
  });
}

export function lonLatToVec3(lon, lat, r = 490) {
  const lonRad = THREE.MathUtils.degToRad(lon);
  const latRad = THREE.MathUtils.degToRad(lat);
  return new THREE.Vector3(
    r * Math.cos(latRad) * Math.sin(lonRad),
    r * Math.sin(latRad),
    r * Math.cos(latRad) * Math.cos(lonRad)
  );
}

function _buildElement(ov) {
  const anchor = document.createElement('div');
  anchor.className = 'ov-anchor';
  const card = document.createElement('div');
  card.className = 'ov-card';
  const dot = document.createElement('div');
  dot.className = 'ov-dot';
  const d = ov.data || {};

  const titleEl = document.createElement('div');
  titleEl.className = 'ov-title';
  titleEl.textContent = t(d.title);

  const descEl = d.description ? document.createElement('div') : null;
  if (descEl) { descEl.className = 'ov-desc'; descEl.textContent = t(d.description); }

  const actionEl = d.action ? document.createElement('div') : null;
  if (actionEl) { actionEl.className = 'ov-action'; actionEl.textContent = t(d.action); }

  if (ov.type === 'price' && d.price) {
    const priceEl = document.createElement('div');
    priceEl.className = 'ov-price';
    priceEl.textContent = d.price;
    card.appendChild(titleEl);
    card.appendChild(priceEl);
  } else {
    card.appendChild(titleEl);
  }
  if (descEl)   card.appendChild(descEl);
  if (actionEl) card.appendChild(actionEl);

  anchor.appendChild(dot);
  anchor.appendChild(card);
  card.addEventListener('click', () => console.log('Overlay:', ov.id));

  return { el: anchor, refs: { title: titleEl, desc: descEl, action: actionEl } };
}
