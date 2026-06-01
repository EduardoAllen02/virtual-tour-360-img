// overlays.js — Spatial overlays using frameStart / frameEnd
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const _objects = [];

export function initOverlays(scene, overlays) {
  overlays.forEach(ov => {
    const el = buildOverlayElement(ov);

    const obj = new CSS2DObject(el);
    obj.visible = false;
    obj.position.copy(lonLatToVec3(ov.lon, ov.lat));
    scene.add(obj);
    _objects.push({ obj, config: ov, el });
  });
}

// Called every render frame — show/hide based on current frame index
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

function buildOverlayElement(ov) {
  const anchor = document.createElement('div');
  anchor.className = 'ov-anchor';
  const card = document.createElement('div');
  card.className = 'ov-card';
  const dot = document.createElement('div');
  dot.className = 'ov-dot';
  const d = ov.data || {};

  if (ov.type === 'price') {
    card.innerHTML = `
      <div class="ov-title">${d.title || ''}</div>
      <div class="ov-price">${d.price || ''}</div>
      ${d.description ? `<div class="ov-desc">${d.description}</div>` : ''}
      ${d.action      ? `<div class="ov-action">${d.action}</div>`      : ''}
    `;
  } else {
    card.innerHTML = `
      <div class="ov-title">${d.title || ''}</div>
      ${d.description ? `<div class="ov-desc">${d.description}</div>` : ''}
      ${d.action      ? `<div class="ov-action">${d.action}</div>`      : ''}
    `;
  }

  anchor.appendChild(dot);
  anchor.appendChild(card);
  card.addEventListener('click', () => console.log('Overlay clicked:', ov.id, d));
  return anchor;
}
