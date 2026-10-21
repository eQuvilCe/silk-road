import * as THREE from 'three';

// Procedural, seamlessly tiling normal maps (no image files needed).

function hash(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

// value noise that wraps every `period` cells
function pnoise(x, y, period) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const w = (v) => ((v % period) + period) % period;
  const a = hash(w(xi), w(yi));
  const b = hash(w(xi + 1), w(yi));
  const c = hash(w(xi), w(yi + 1));
  const d = hash(w(xi + 1), w(yi + 1));
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function heightToNormalTexture(size, heightFn, strength) {
  const hgt = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) hgt[y * size + x] = heightFn(x / size, y / size);
  }
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => hgt[((y + size) % size) * size + ((x + size) % size)];
  const n = new THREE.Vector3();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      n.set(-dx, -dy, 1).normalize();
      const i = (y * size + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export function makeSandNormal() {
  return heightToNormalTexture(
    256,
    (u, v) => {
      const warp = pnoise(u * 6, v * 6, 6) * 1.6 + pnoise(u * 12, v * 12, 12) * 0.5;
      const ripples = Math.sin((u * 9 + v * 3 + warp) * Math.PI * 2) * 0.5 + 0.5;
      const grain = pnoise(u * 64, v * 64, 64) * 0.35;
      return ripples * ripples * 0.9 + grain;
    },
    5
  );
}

export function makeWaterNormal() {
  return heightToNormalTexture(
    256,
    (u, v) => {
      const T = Math.PI * 2;
      return (
        Math.sin(T * (3 * u + 2 * v)) * 0.35 +
        Math.sin(T * (-5 * u + 4 * v) + 1.3) * 0.25 +
        Math.sin(T * (7 * u - 9 * v) + 2.1) * 0.12 +
        pnoise(u * 16, v * 16, 16) * 0.5
      );
    },
    6
  );
}

// fine fur / hide grain for animals
export function makeFurNormal() {
  return heightToNormalTexture(
    256,
    (u, v) => pnoise(u * 90, v * 90, 90) * 0.7 + pnoise(u * 30, v * 30, 30) * 0.5 + pnoise(u * 12, v * 12, 12) * 0.4,
    3.2
  );
}
