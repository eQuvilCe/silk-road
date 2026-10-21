import * as THREE from 'three';
import { CITIES } from './data.js';
import { heightAt, seaMask, WATER_Y } from './world.js';
import { pbrSet, SETS, worldScaleBoxUV, weather } from './pbr.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const P = {
  brick: '#c08455',
  sand: '#e0c49a',
  stone: '#d6c3a2',
  turq: '#1f9aa3',
  blue: '#1d5a91',
  white: '#efe7d6',
  red: '#962a2a',
  roof: '#45534a',
  copper: '#5d9c80',
  gold: '#d6a23e',
  dark: '#1c130d',
  pink: '#d7a28a',
};

const cache = {};
// real PBR surfaces for walls, stone and roofs; tinted by the old palette colour
const SURFACE = {
  [P.brick]: SETS.plaster,
  [P.sand]: SETS.plaster,
  [P.pink]: SETS.plaster,
  [P.white]: SETS.plaster,
  [P.stone]: SETS.stone,
  [P.roof]: SETS.roof,
};
const m = (c, extra) => {
  const key = c + JSON.stringify(extra || {});
  if (cache[key]) return cache[key];
  const set = !extra && SURFACE[c];
  const pbr = set ? { ...pbrSet(set), roughness: 1, normalScale: new THREE.Vector2(1.1, 1.1) } : {};
  const mat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.82, ...pbr, ...extra });
  if (set === SETS.plaster) mat.color.multiplyScalar(1.9); // the plaster map is dark, lift it back to the palette
  if (set === SETS.roof) mat.color.multiplyScalar(1.6);
  if (set) weather(mat);
  return (cache[key] = mat);
};
const TILE = { roughness: 0.32, metalness: 0.05 };
const GOLD = { roughness: 0.28, metalness: 0.9 };

// windows that light up at night
export const nightLights = [];
function lamp(color = '#ffcf7a') {
  const mat = new THREE.MeshStandardMaterial({ color: '#2a1c12', emissive: color, emissiveIntensity: 0 });
  nightLights.push(mat);
  return mat;
}

const asMat = (c) => (typeof c === 'string' ? m(c) : c);

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const geo = new THREE.BoxGeometry(w, h, d);
  worldScaleBoxUV(geo, w, h, d);
  const mesh = new THREE.Mesh(geo, asMat(color));
  mesh.position.set(x, y + h / 2, z);
  return mesh;
}
function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 24) {
  const geo = new THREE.CylinderGeometry(rt, rb, h, seg);
  const uv = geo.attributes.uv;
  const circ = Math.PI * 2 * Math.max(rt, rb) * 0.25;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ, uv.getY(i) * h * 0.25);
  const mesh = new THREE.Mesh(geo, asMat(color));
  mesh.position.set(x, y + h / 2, z);
  return mesh;
}
function cone(r, h, color, x = 0, y = 0, z = 0, seg = 24) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), asMat(color));
  mesh.position.set(x, y + h / 2, z);
  return mesh;
}

// Smooth dome. `ribs` > 0 gives the melon-ribbed Timurid look.
function dome(r, color, x = 0, y = 0, z = 0, stretch = 1.15, ribs = 0) {
  const geo = new THREE.SphereGeometry(r, ribs ? 64 : 40, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  if (ribs) {
    const p = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const a = Math.atan2(v.z, v.x);
      const k = 1 + Math.abs(Math.sin(a * ribs * 0.5)) * 0.06 * (1 - v.y / r);
      p.setXYZ(i, v.x * k, v.y, v.z * k);
    }
    geo.computeVertexNormals();
  }
  const mesh = new THREE.Mesh(geo, asMat(color));
  mesh.scale.y = stretch;
  mesh.position.set(x, y, z);
  const g = new THREE.Group();
  g.add(mesh);
  // little golden finial on top
  const f = new THREE.Mesh(new THREE.SphereGeometry(r * 0.07, 12, 8), m(P.gold, GOLD));
  f.position.set(x, y + r * stretch + r * 0.05, z);
  g.add(f);
  return g;
}

// Pointed (Persian) arch niche, extruded.
function archGeo(w, h, depth) {
  const s = new THREE.Shape();
  const hw = w / 2;
  s.moveTo(-hw, 0);
  s.lineTo(-hw, h - hw);
  s.quadraticCurveTo(-hw, h - hw * 0.15, 0, h + hw * 0.2);
  s.quadraticCurveTo(hw, h - hw * 0.15, hw, h - hw);
  s.lineTo(hw, 0);
  s.lineTo(-hw, 0);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 12 });
}
function arch(w, h, color, x = 0, y = 0, z = 0, depth = 0.1) {
  const mesh = new THREE.Mesh(archGeo(w, h, depth), asMat(color));
  mesh.position.set(x + w / 2, y, z); // x is the left edge
  return mesh;
}

function minaret(x, z, h, color = P.sand, cap = P.turq, r = 0.42) {
  const g = new THREE.Group();
  g.add(cyl(r * 0.78, r, h, color, x, 0, z));
  // tile bands
  for (let i = 1; i < 4; i++) g.add(cyl(r * (1 - i * 0.055) + 0.02, r * (1 - i * 0.055) + 0.02, 0.22, m(P.blue, TILE), x, (h * i) / 4, z));
  g.add(cyl(r * 1.3, r * 0.95, 0.55, color, x, h, z));
  g.add(cyl(r * 0.9, r * 0.9, 0.5, m(P.dark), x, h + 0.55, z, 12));
  g.add(dome(r * 1.05, m(cap, TILE), x, h + 1.05, z, 1.3));
  return g;
}

// crenellated wall
function wall(len, h, color, x = 0, z = 0, ry = 0, merlons = true) {
  const g = new THREE.Group();
  g.add(box(len, h, 0.9, color, 0, 0, 0));
  if (merlons) {
    const n = Math.floor(len / 0.9);
    for (let i = 0; i < n; i++) g.add(box(0.45, 0.45, 0.9, color, -len / 2 + 0.45 + i * 0.9, h, 0));
  }
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return g;
}

// ---------------------------------------------------------------- landmarks
const BUILD = {
  changan() {
    const g = new THREE.Group();
    // Giant Wild Goose Pagoda – square brick tiers
    let y = 0;
    g.add(box(6.4, 0.8, 6.4, P.stone, 0, 0, 0));
    y = 0.8;
    for (let i = 0; i < 7; i++) {
      const w = 3.5 - i * 0.28;
      g.add(box(w, 1.2, w, P.brick, 0, y, 0));
      g.add(arch(0.42, 0.55, lamp(), -0.21 + 0, y + 0.25, w / 2 - 0.05, 0.08));
      y += 1.2;
      g.add(box(w + 0.6, 0.12, w + 0.6, P.stone, 0, y, 0));
      g.add(box(w + 0.35, 0.1, w + 0.35, P.stone, 0, y + 0.12, 0));
      y += 0.22;
    }
    g.add(cyl(0.3, 0.5, 0.6, P.stone, 0, y, 0, 8));
    g.add(cone(0.35, 2, m(P.gold, GOLD), 0, y + 0.6, 0, 8));

    // city gate with a sweeping roof
    const gate = new THREE.Group();
    gate.add(wall(22, 2.8, P.brick, 0, 0, 0));
    gate.add(box(5, 1.2, 2.4, P.stone, 0, 2.8, 0));
    gate.add(box(4.4, 1.6, 2, P.red, 0, 4, 0));
    for (let i = 0; i < 2; i++) {
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 3.7 - i * 0.9, 1.1, 4, 1), m(P.roof, { roughness: 0.6 }));
      roof.rotation.y = Math.PI / 4;
      roof.scale.z = 0.6;
      roof.position.y = 6.1 + i * 1.1;
      gate.add(roof);
    }
    gate.add(arch(1.6, 1.8, m(P.dark), -0.8, 0, 0.46, 0.05));
    gate.position.set(-11, 0, 5);
    gate.rotation.y = 0.12;
    g.add(gate);
    return g;
  },

  dunhuang() {
    const g = new THREE.Group();
    // Mogao cliff with cave mouths
    const cliffGeo = new THREE.BoxGeometry(32, 8, 5, 24, 8, 2);
    const cp = cliffGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const x = cp.getX(i);
      const yv = cp.getY(i);
      if (cp.getZ(i) > 0) cp.setZ(i, cp.getZ(i) + Math.sin(x * 0.7) * 0.2 + Math.sin(yv * 2.1 + x) * 0.12);
      if (yv > 3.9) cp.setY(i, yv + Math.sin(x * 0.4) * 0.8);
    }
    cliffGeo.computeVertexNormals();
    const cliffUV = cliffGeo.attributes.uv;
    for (let i = 0; i < cliffUV.count; i++) cliffUV.setXY(i, cliffUV.getX(i) * 8, cliffUV.getY(i) * 2);
    const cliff = new THREE.Mesh(cliffGeo, m('#ffe0b4', { ...pbrSet(SETS.stone), roughness: 1, normalScale: new THREE.Vector2(1.6, 1.6) }));
    cliff.position.set(0, 4, -2.5);
    g.add(cliff);
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 10; i++) {
        if ((i + r) % 3 === 2) continue;
        g.add(arch(0.9, 0.9, m(P.dark), -13 + i * 2.7 + (r % 2) * 1.1, 0.8 + r * 2.3, 0.02, 0.06));
      }
    }
    // the red nine-storey facade
    let y = 0;
    for (let i = 0; i < 7; i++) {
      const w = 4.6 - i * 0.45;
      g.add(box(w, 1.05, 1.8, P.red, 3, y, 0.8));
      for (let k = -1; k <= 1; k++) g.add(box(0.5, 0.6, 0.05, lamp(), 3 + k * w * 0.3, y + 0.25, 1.72));
      y += 1.05;
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.45, w * 0.8, 0.35, 4), m(P.roof, { roughness: 0.6 }));
      roof.rotation.y = Math.PI / 4;
      roof.scale.z = 0.55;
      roof.position.set(3, y + 0.17, 0.8);
      g.add(roof);
      y += 0.35;
    }
    // beacon tower of the old frontier
    g.add(box(2.4, 5, 2.4, '#b88d5b', -19, 0, 7));
    g.add(box(1.4, 0.8, 1.4, '#b88d5b', -19, 5, 7));
    return g;
  },

  taklamakan() {
    const g = new THREE.Group();
    const w = '#c79a61';
    g.add(wall(12, 2.4, w, 0, -5, 0));
    g.add(wall(7, 1.4, w, -2.5, 5, 0, false));
    g.add(wall(10, 2, w, -6, 0, Math.PI / 2));
    g.add(box(2.2, 4.2, 2.2, w, -6, 0, -5));
    g.add(box(1.6, 3.2, 1.6, w, 6, 0, -5));
    g.add(arch(1, 1.4, m(P.dark), -0.5, 0, -4.53, 0.05));
    // a dead poplar
    const trunk = cyl(0.1, 0.25, 3.6, '#5b4632', 7, 0, 4, 8);
    trunk.rotation.z = 0.18;
    g.add(trunk);
    for (const [a, h] of [[-0.9, 2.4], [0.8, 2.9], [-0.4, 3.3]]) {
      const br = cyl(0.04, 0.08, 1.4, '#5b4632', 7, h, 4, 6);
      br.rotation.z = a;
      g.add(br);
    }
    // bleached bones of a camel that didn't make it
    for (let i = 0; i < 6; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.03, 6, 16, Math.PI), m('#efe6d6'));
      rib.position.set(3 + i * 0.25, 0.05, 7);
      rib.rotation.y = Math.PI / 2;
      g.add(rib);
    }
    return g;
  },

  kashgar() {
    const g = new THREE.Group();
    // Id Kah style mosque front
    const facade = '#e7c47c';
    g.add(box(16, 3.6, 5, facade, 0, 0, -1.5));
    g.add(box(5.4, 5.6, 1.2, '#f0d496', 0, 0, 1.3));
    g.add(arch(2.4, 3.4, m(P.dark), -1.2, 0, 1.92, 0.05));
    g.add(arch(3.2, 4.2, m('#3c8a7a', TILE), -1.6, 0, 1.9, 0.04));
    for (let i = -3; i <= 3; i++) if (i) g.add(arch(0.9, 1.6, lamp(), Math.sign(i) * 3.2 + i * 1.3 - 0.45, 0.7, 1.02, 0.05));
    g.add(minaret(-3.6, 1.3, 7.5, '#f0d496', P.copper, 0.55));
    g.add(minaret(3.6, 1.3, 7.5, '#f0d496', P.copper, 0.55));
    g.add(cyl(1.6, 1.6, 0.8, facade, 0, 3.6, -1.5, 32));
    g.add(dome(1.6, m(P.copper, TILE), 0, 4.4, -1.5));
    // bazaar awnings
    const tents = ['#b5122e', '#1f6f78', '#d39b33', '#6c2f6f', '#e6d9bf', '#24477a'];
    for (let i = 0; i < 10; i++) {
      const x = -12 + i * 2.6;
      const z = 7 + (i % 2) * 2.6;
      const cloth = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.3, 4, 1, true), m(tents[i % tents.length], { side: THREE.DoubleSide, roughness: 0.95 }));
      cloth.rotation.y = Math.PI / 4;
      cloth.position.set(x, 2.2, z);
      g.add(cloth);
      for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) g.add(cyl(0.05, 0.05, 1.6, '#5a3d22', x + dx, 0, z + dz, 6));
      g.add(box(1.5, 0.5, 1.2, '#7a5634', x, 0, z));
      g.add(cone(0.35, 0.35, tents[(i + 2) % tents.length], x - 0.3, 0.5, z, 12));
    }
    return g;
  },

  pamir() {
    const g = new THREE.Group();
    // stone caravanserai (like Tash Rabat)
    const st = m('#8f877b', { roughness: 0.95 });
    g.add(box(10, 2.8, 10, st, 0, 0, 0));
    g.add(cyl(2.4, 2.4, 0.7, st, 0, 2.8, 0, 32));
    g.add(dome(2.4, st, 0, 3.5, 0, 0.95));
    for (const [x, z] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
      g.add(cyl(1, 1.1, 3.4, st, x, 0, z, 20));
      g.add(dome(1, st, x, 3.4, z, 0.7));
    }
    g.add(arch(2, 2.4, m(P.dark), -1, 0, 5.0, 0.05));
    g.add(arch(0.6, 0.6, lamp(), -0.3, 2.8, 5.02, 0.04));
    // cairn + yurt
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75 - i * 0.12, 1), m('#7c736a', { roughness: 1 }));
      s.position.set(9, 0.5 + i * 0.8, 6);
      s.rotation.set(i, i * 2, 0);
      g.add(s);
    }
    g.add(cyl(2, 2, 1.6, '#e9e1d0', -10, 0, 5, 32));
    g.add(cone(2.2, 1.2, '#cfc4ad', -10, 1.6, 5, 32));
    g.add(box(0.8, 1.2, 0.1, P.red, -10, 0, 7));
    return g;
  },

  samarkand() {
    // The Registan: three madrasas around a square
    const g = new THREE.Group();
    g.add(box(34, 0.3, 30, '#d8bd92', 0, -0.3, 0));
    // brick paving pattern
    for (let i = -3; i <= 3; i++) g.add(box(30, 0.02, 0.15, '#b89a70', 0, 0.01, i * 3));
    const madrasa = (x, z, ry, domes, ribbed) => {
      const b = new THREE.Group();
      b.add(box(13, 5.5, 5, P.sand, 0, 0, -2.5));
      // tiled band + side arcades
      b.add(box(13.05, 0.45, 5.05, m(P.turq, TILE), 0, 4.6, -2.5));
      for (let r = 0; r < 2; r++) {
        for (let i = -2; i <= 2; i++) {
          if (i === 0) continue;
          b.add(arch(1.1, 1.4, r ? m(P.blue, TILE) : lamp('#ffd58a'), i * 2.4 - 0.55, 0.6 + r * 2.2, -0.02, 0.04));
        }
      }
      // pishtaq portal
      b.add(box(6, 9.4, 1.6, P.sand, 0, 0, 0.8));
      b.add(arch(4.6, 7, m(P.blue, TILE), -2.3, 0.3, 1.62, 0.04));
      b.add(arch(3.8, 6.4, m('#e7dcc6', TILE), -1.9, 0.3, 1.64, 0.04));
      b.add(arch(3.2, 5.9, m(P.dark), -1.6, 0.3, 1.66, 0.04));
      b.add(box(5.2, 0.6, 0.06, m(P.turq, TILE), 0, 8.2, 1.62));
      b.add(minaret(-6.6, 0.3, 11, P.sand, P.turq, 0.55));
      b.add(minaret(6.6, 0.3, 11, P.sand, P.turq, 0.55));
      for (const dx of domes) {
        b.add(cyl(1.7, 1.7, 1.5, m(P.blue, TILE), dx, 5.5, -2.8, 32));
        b.add(dome(1.85, m(P.turq, TILE), dx, 7, -2.8, 1.45, ribbed ? 24 : 0));
      }
      b.position.set(x, 0, z);
      b.rotation.y = ry;
      return b;
    };
    g.add(madrasa(-11.5, 0, Math.PI / 2, [0], true));
    g.add(madrasa(11.5, 0, -Math.PI / 2, [-3, 3], true));
    g.add(madrasa(0, -11.5, 0, [0], false));
    return g;
  },

  bukhara() {
    const g = new THREE.Group();
    // Kalyan minaret, with patterned brick bands
    g.add(cyl(0.95, 1.4, 15, P.brick, 0, 0, 0, 32));
    for (let i = 1; i < 7; i++) g.add(cyl(1.42 - i * 0.065, 1.44 - i * 0.065, 0.22, P.stone, 0, i * 2.1, 0, 32));
    g.add(cyl(1.3, 0.98, 1.6, P.stone, 0, 15, 0, 32));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const w = arch(0.35, 0.6, lamp(), 0, 15.4, 0, 0.05);
      w.position.set(Math.sin(a) * 1.18, 15.4, Math.cos(a) * 1.18);
      w.rotation.y = a;
      g.add(w);
    }
    g.add(dome(1, P.brick, 0, 16.6, 0, 0.8));
    // Kalyan mosque and Mir-i-Arab madrasa
    g.add(box(13, 3.8, 8, P.sand, -10, 0, -2.5));
    g.add(cyl(2, 2, 1, P.sand, -10, 3.8, -3, 32));
    g.add(dome(2.2, m(P.turq, TILE), -10, 4.8, -3, 1.35, 20));
    g.add(box(4.6, 6, 1.2, P.sand, -10, 0, 1.8));
    g.add(arch(3, 4.4, m(P.blue, TILE), -1.5 - 10, 0.2, 2.42, 0.04));
    g.add(arch(2.4, 3.8, m(P.dark), -1.2 - 10, 0.2, 2.44, 0.04));
    g.add(box(10, 3.4, 6, P.sand, 10, 0, -3));
    g.add(dome(1.6, m(P.blue, TILE), 7.5, 3.4, -3.5, 1.4, 16));
    g.add(dome(1.6, m(P.blue, TILE), 12.5, 3.4, -3.5, 1.4, 16));
    g.add(box(4, 5, 1, P.sand, 10, 0, 0.5));
    g.add(arch(2.2, 3.4, m(P.dark), 8.9, 0.2, 1.02, 0.04));
    return g;
  },

  baghdad() {
    const g = new THREE.Group();
    const R = 11;
    const ringMat = new THREE.MeshStandardMaterial({ color: '#c69a64', roughness: 0.9, side: THREE.DoubleSide });
    for (const [r, h] of [[R, 2.4], [R - 1.8, 3]]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 96, 1, true), ringMat);
      ring.position.y = h / 2;
      g.add(ring);
      // merlons
      const n = Math.floor(r * 4);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const mm = box(0.4, 0.4, 0.4, '#c69a64', Math.cos(a) * r, h, Math.sin(a) * r);
        mm.rotation.y = -a;
        g.add(mm);
      }
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const gx = Math.cos(a) * (R - 0.9);
      const gz = Math.sin(a) * (R - 0.9);
      const gate = box(2.6, 4, 2.6, '#b88a55', gx, 0, gz);
      gate.rotation.y = -a;
      g.add(gate);
      g.add(dome(1.1, m(P.copper, TILE), gx, 4, gz));
    }
    // houses inside the ring
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const rr = 5.8 + (i % 3) * 1.1;
      const h = box(1.3, 1 + (i % 4) * 0.35, 1.3, i % 5 ? '#dcc196' : '#e9d6b4', Math.cos(a) * rr, 0, Math.sin(a) * rr);
      h.rotation.y = -a;
      g.add(h);
    }
    // green dome palace in the centre
    g.add(box(4.4, 2.8, 4.4, P.sand, 0, 0, 0));
    g.add(cyl(1.8, 1.8, 1.2, P.sand, 0, 2.8, 0, 32));
    g.add(dome(2, m('#2f7d52', TILE), 0, 4, 0, 1.45));
    g.add(minaret(3.2, 3.2, 8, P.sand, P.gold, 0.34));
    for (const [x, z] of [[0, 2.22], [2.22, 0], [0, -2.22], [-2.22, 0]]) {
      const ar = arch(1.2, 1.6, lamp(), 0, 0.3, 0, 0.04);
      ar.position.set(x, 0.3, z);
      ar.rotation.y = Math.atan2(x, z);
      g.add(ar);
    }
    return g;
  },

  constantinople() {
    const g = new THREE.Group();
    // Hagia Sophia
    const pink = P.pink;
    g.add(box(10, 4.4, 9, pink, 0, 0, 0));
    g.add(box(6, 6, 6, pink, 0, 0, 0));
    g.add(cyl(3.1, 3.3, 1.2, pink, 0, 6, 0, 40));
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const w = arch(0.3, 0.5, lamp(), 0, 0, 0, 0.04);
      w.position.set(Math.sin(a) * 3.16, 6.3, Math.cos(a) * 3.16);
      w.rotation.y = a;
      g.add(w);
    }
    g.add(dome(3.3, m('#7f8c8e', { roughness: 0.45, metalness: 0.4 }), 0, 7.2, 0, 0.62));
    g.add(dome(2.4, m('#7f8c8e', { roughness: 0.45, metalness: 0.4 }), 0, 4.4, 3.6, 0.6));
    g.add(dome(2.4, m('#7f8c8e', { roughness: 0.45, metalness: 0.4 }), 0, 4.4, -3.6, 0.6));
    for (const [x, z] of [[-5.6, -5], [5.6, -5], [-5.6, 5], [5.6, 5]]) {
      g.add(cyl(0.3, 0.36, 10, P.white, x, 0, z, 16));
      g.add(cyl(0.48, 0.48, 0.3, P.white, x, 7, z, 16));
      g.add(cone(0.36, 2, '#6c7778', x, 10, z, 16));
    }
    for (let i = -1; i <= 1; i++) g.add(arch(1, 1.8, lamp(), i * 2.6 - 0.5, 1, 4.52, 0.04));
    // Theodosian walls with towers
    for (let i = 0; i < 7; i++) {
      g.add(wall(3.6, 2.6, '#c9b18d', 15, -12.6 + i * 3.6, Math.PI / 2));
      g.add(box(2, 4, 2, '#bda580', 15, 0, -10.8 + i * 3.6));
    }
    return g;
  },

  venice() {
    const g = new THREE.Group();
    // Campanile of San Marco
    g.add(box(2, 12.5, 2, '#a9563b', 0, 0, 0));
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const w = arch(0.9, 1.2, lamp('#ffcf7a'), -0.45, 12.6, 1.01, 0.05);
      const holder = new THREE.Group();
      holder.add(w);
      holder.rotation.y = a;
      g.add(holder);
    }
    g.add(box(2.2, 2, 2.2, P.white, 0, 12.5, 0).translateY(0));
    const spire = cone(1.6, 3.6, m(P.copper, { roughness: 0.5, metalness: 0.3 }), 0, 14.5, 0, 4);
    spire.rotation.y = Math.PI / 4;
    g.add(spire);
    g.add(cone(0.16, 0.9, m(P.gold, GOLD), 0, 18.1, 0, 8));
    // Doge's palace: arcades below, pink wall above
    g.add(box(13, 2.2, 3.6, P.white, -9, 0, 2));
    g.add(box(13, 3.4, 3.6, '#e2bca8', -9, 2.2, 2));
    for (let i = 0; i < 11; i++) {
      g.add(arch(0.8, 1.6, m(P.dark), -14.6 + i * 1.12, 0, 3.81, 0.04));
      g.add(arch(0.55, 1, lamp(), -14.5 + i * 1.12, 3.2, 3.81, 0.04));
    }
    // canal houses
    const cols = ['#d48a5e', '#e2b25d', '#c46d56', '#e8d2b0', '#b4775a', '#d9a18e'];
    for (let i = 0; i < 10; i++) {
      const h = 3.2 + (i % 3) * 1.2;
      const x = 4 + i * 2.4;
      g.add(box(2.3, h, 2.6, cols[i % cols.length], x, 0, -4));
      g.add(box(2.5, 0.2, 2.8, '#8f4a35', x, h, -4));
      for (let f = 0; f < Math.floor(h / 1.4); f++) g.add(arch(0.45, 0.7, lamp(), x - 0.225, 0.6 + f * 1.4, -2.68, 0.04));
    }
    // gondola
    const gond = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 3, 4, 10), m('#111'));
    gond.rotation.z = Math.PI / 2;
    gond.scale.set(1, 1, 0.5);
    gond.position.set(6, -0.2, 3.5);
    g.add(gond);
    return g;
  },
};

// ---------------------------------------------------------------- scatter
// ---- detailed town houses: parapets, doors, shutters, roof beams, domes, upper storeys
function houseGeo(kind, w, h, d) {
  const parts = [];
  const add = (geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    let g = geo.index ? geo.toNonIndexed() : geo;
    g.deleteAttribute('uv2');
    const mtx = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(1, 1, 1)
    );
    g.applyMatrix4(mtx);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    parts.push(g);
  };
  // hand-built mud brick: walls bulge a little, top edges are worn round
  const boxG = (bw, bh, bd, density = 0.5, soft = 1) => {
    const g = new THREE.BoxGeometry(bw, bh, bd, 3, 3, 3);
    worldScaleBoxUV(g, bw, bh, bd, density);
    if (soft) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const ex = Math.abs(Math.abs(x) - bw / 2) < 1e-4;
        const ez = Math.abs(Math.abs(z) - bd / 2) < 1e-4;
        const top = Math.abs(y - bh / 2) < 1e-4;
        const j = Math.sin(x * 13.1 + y * 7.7 + z * 5.3 + w) * 0.018 * soft;
        let dy = 0;
        if (top && (ex || ez)) dy -= 0.045 * soft;
        if (top && ex && ez) dy -= 0.04 * soft;
        p.setXYZ(i, x + (ex ? Math.sign(x) * j : 0), y + dy, z + (ez ? Math.sign(z) * j : 0));
      }
      g.computeVertexNormals();
    }
    return g;
  };
  const WOOD = '#5a3a22';
  const DARK = '#1c1410';
  const BODY = '#ffffff';

  // main mass, sitting slightly sunk into the ground, with a darker dirt-splashed footing
  add(boxG(w, h, d), BODY, 0, h / 2 - 0.1, 0);
  add(boxG(w + 0.06, 0.32, d + 0.06, 0.5, 0.6), '#b59b7c', 0, 0.06, 0);
  // rooftop life: clay jars, a hay pile, a ladder leaning on the wall
  const JAR = '#a0532f';
  for (let i = 0; i < 2 + (kind % 3); i++) {
    const jx = -w / 2 + 0.3 + ((i * 0.37 + kind * 0.21) % 1) * (w - 0.6);
    const jz = -d / 2 + 0.3 + ((i * 0.61 + kind * 0.13) % 1) * (d - 0.6);
    const jar = new THREE.SphereGeometry(0.09, 10, 8);
    jar.scale(1, 1.25, 1);
    add(jar, JAR, jx, h + 0.0, jz);
  }
  if (kind % 2 === 0) {
    const hay = new THREE.SphereGeometry(0.32, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    hay.scale(1.2, 0.7, 1);
    add(hay, '#c9a85a', w * 0.22, h - 0.1, -d * 0.2);
  }
  {
    const LAD = '#6a4a2c';
    const lx = (kind % 2 ? 1 : -1) * (w / 2 - 0.25);
    for (const off of [-0.12, 0.12]) add(new THREE.CylinderGeometry(0.022, 0.022, h * 1.15, 5), LAD, lx + off, h * 0.5, d / 2 + 0.22, -0.2, 0, 0);
    for (let r = 0; r < 5; r++) add(new THREE.CylinderGeometry(0.015, 0.015, 0.26, 4), LAD, lx, 0.2 + r * (h * 0.2), d / 2 + 0.3 - r * 0.045 * h, 0, 0, Math.PI / 2);
  }
  // packed-earth roof, darker than the walls
  add(boxG(w - 0.06, 0.06, d - 0.06, 0.5, 0), '#9a8468', 0, h - 0.07, 0);
  // thick parapet lip around a flat roof
  const lip = 0.12;
  add(boxG(w + 0.1, lip, 0.1), BODY, 0, h - 0.1 + lip / 2, d / 2);
  add(boxG(w + 0.1, lip, 0.1), BODY, 0, h - 0.1 + lip / 2, -d / 2);
  add(boxG(0.1, lip, d), BODY, w / 2, h - 0.1 + lip / 2, 0);
  add(boxG(0.1, lip, d), BODY, -w / 2, h - 0.1 + lip / 2, 0);
  // door with a wooden lintel
  const dw = Math.min(0.42, w * 0.3);
  const dx = (kind % 2 ? -1 : 1) * w * 0.18;
  add(boxG(dw, h * 0.55, 0.05), DARK, dx, h * 0.275 - 0.1, d / 2 + 0.01);
  add(boxG(dw + 0.12, 0.07, 0.08), WOOD, dx, h * 0.55 - 0.08, d / 2 + 0.03);
  // window with shutters
  const wx = -dx * 0.9;
  add(boxG(0.26, 0.3, 0.05), DARK, wx, h * 0.68, d / 2 + 0.01);
  add(boxG(0.1, 0.3, 0.05), WOOD, wx - 0.2, h * 0.68, d / 2 + 0.02);
  add(boxG(0.1, 0.3, 0.05), WOOD, wx + 0.2, h * 0.68, d / 2 + 0.02);
  // side window
  add(boxG(0.05, 0.28, 0.24), DARK, w / 2 + 0.01, h * 0.62, 0);
  // protruding roof beams (vigas) on the front wall
  for (let i = 0; i < 4; i++) {
    const g = new THREE.CylinderGeometry(0.035, 0.035, 0.28, 8);
    add(g, WOOD, -w / 2 + 0.25 + (i * (w - 0.5)) / 3, h - 0.18, d / 2, Math.PI / 2, 0, 0);
  }
  if (kind === 1 || kind === 4) {
    // smaller second storey
    add(boxG(w * 0.6, h * 0.55, d * 0.6), BODY, -w * 0.12, h - 0.1 + h * 0.275, -d * 0.1);
    add(boxG(w * 0.2, 0.26, 0.05), DARK, -w * 0.12, h + h * 0.28, d * 0.2 + 0.015);
  }
  if (kind === 2 || kind === 5) {
    // small dome on a drum
    const drum = new THREE.CylinderGeometry(Math.min(w, d) * 0.28, Math.min(w, d) * 0.3, 0.22, 20);
    add(drum, BODY, 0, h - 0.1 + lip + 0.11, 0);
    const dome = new THREE.SphereGeometry(Math.min(w, d) * 0.3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    add(dome, BODY, 0, h - 0.1 + lip + 0.22, 0);
  }
  if (kind === 3) {
    // wooden awning on posts
    add(boxG(w * 0.9, 0.05, 0.55, 1.2), WOOD, 0, h * 0.62, d / 2 + 0.3);
    add(new THREE.CylinderGeometry(0.03, 0.03, h * 0.6, 6), WOOD, -w * 0.4, h * 0.3, d / 2 + 0.55);
    add(new THREE.CylinderGeometry(0.03, 0.03, h * 0.6, 6), WOOD, w * 0.4, h * 0.3, d / 2 + 0.55);
  }
  const merged = mergeGeometries(parts, false);
  merged.computeBoundingSphere();
  return merged;
}

let houseKinds = null;
let houseMat = null;
let wallGeo = null;

// spots taken by town blocks (flora keeps clear of them) and courtyard trees
export const townBlocks = [];
export const courtyardTrees = [];

// Towns grow as mahallas: tight blocks of flat-roofed houses sharing walls,
// with courtyards, narrow lanes between blocks and a mud wall with a gate.
function scatterHouses(group, city) {
  houseKinds ||= [
    houseGeo(0, 1.8, 1.3, 1.5),
    houseGeo(1, 2.2, 1.5, 1.7),
    houseGeo(2, 1.9, 1.5, 1.8),
    houseGeo(3, 2.4, 1.4, 1.6),
    houseGeo(4, 1.7, 1.7, 1.4),
    houseGeo(5, 2.1, 1.3, 2.0),
  ];
  houseMat ||= new THREE.MeshStandardMaterial({
    vertexColors: true,
    color: new THREE.Color(1.55, 1.5, 1.45),
    ...pbrSet(SETS.plaster),
    roughness: 1,
    normalScale: new THREE.Vector2(1.3, 1.3),
  });
  weather(houseMat);
  if (!wallGeo) {
    wallGeo = new THREE.BoxGeometry(1, 0.95, 0.22, 4, 2, 1);
    worldScaleBoxUV(wallGeo, 1, 0.95, 0.22, 0.5);
    const p = wallGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      // eroded, uneven mud wall top
      if (p.getY(i) > 0.4) p.setY(i, p.getY(i) - Math.abs(Math.sin(p.getX(i) * 9.1 + p.getZ(i) * 3.3)) * 0.06);
    }
    wallGeo.translate(0, 0.475, 0);
    wallGeo.computeVertexNormals();
  }
  const N = 90;
  const meshes = houseKinds.map((g) => {
    const im = new THREE.InstancedMesh(g, houseMat, N);
    im.count = 0;
    im.castShadow = true;
    im.receiveShadow = true;
    group.add(im);
    return im;
  });
  const wallMat = m(P.sand);
  const walls = new THREE.InstancedMesh(wallGeo, wallMat, 160);
  walls.count = 0;
  walls.castShadow = walls.receiveShadow = true;
  group.add(walls);

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  // sun-dried brick and clay plaster: warm greys and dusty beiges, never orange
  const tones = ['#cbb497', '#bfa585', '#d6c4a6', '#b89c7a', '#c9b08c', '#d2bb98', '#ad9373'];
  const CELL = 2.55;

  const free = (x, z) => {
    const { h, d } = heightAt(x, z);
    if (d < 6.5 || seaMask(x, z) > 0.05 || h > 5) return null;
    if (Math.sign(z - city.z) === -city.side && d < 15) return null;
    if (Math.hypot(x - city.x, z - (city.z + city.side * 14)) < 17) return null;
    return h;
  };

  let blocks = 0;
  for (let tries = 0; blocks < 6 && tries < 300; tries++) {
    const a = Math.random() * Math.PI * 2;
    const r = 12 + Math.random() * 26;
    const cx = city.x + Math.cos(a) * r;
    const cz = city.z + Math.sin(a) * r;
    const nx = 3 + Math.floor(Math.random() * 2);
    const nz = 2 + Math.floor(Math.random() * 2);
    const rot = (city.side > 0 ? Math.PI : 0) + (Math.random() - 0.5) * 0.5;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const at = (lx, lz) => [cx + lx * cos + lz * sin, cz - lx * sin + lz * cos];
    const halfX = (nx * CELL) / 2;
    const halfZ = (nz * CELL) / 2;
    // the whole block must sit on usable ground, away from other blocks
    const corners = [[-halfX, -halfZ], [halfX, -halfZ], [-halfX, halfZ], [halfX, halfZ], [0, 0]];
    if (corners.some(([lx, lz]) => free(...at(lx, lz)) == null)) continue;
    const rad = Math.hypot(halfX, halfZ) + 1.2;
    if (townBlocks.some((b) => Math.hypot(b.x - cx, b.z - cz) < b.r + rad + 1.5)) continue;
    townBlocks.push({ x: cx, z: cz, r: rad });
    blocks++;

    const yard = Math.floor(Math.random() * nx * nz);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const lx = -halfX + CELL * (i + 0.5);
        const lz = -halfZ + CELL * (j + 0.5);
        const [x, z] = at(lx, lz);
        const h = heightAt(x, z).h;
        if (i * nz + j === yard) {
          // courtyard: a shade tree (planted by flora) behind the walls
          courtyardTrees.push([x, h, z]);
          continue;
        }
        const kind = Math.floor(Math.random() * meshes.length);
        const im = meshes[kind];
        if (im.count >= N) continue;
        const sx = 1.05 + Math.random() * 0.12;
        dummy.position.set(x, h, z);
        dummy.rotation.set(0, rot + (Math.random() < 0.5 ? 0 : Math.PI), 0);
        dummy.scale.set(sx, 0.85 + Math.random() * 0.45, sx);
        dummy.updateMatrix();
        im.setMatrixAt(im.count, dummy.matrix);
        im.setColorAt(im.count, color.set(tones[Math.floor(Math.random() * tones.length)]));
        im.count++;
      }
    }
    // perimeter wall, with a gate gap on the road side
    const segs = [];
    const edge = (x0, z0, x1, z1, gate) => {
      const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.3));
      for (let k = 0; k < n; k++) {
        if (gate && k === Math.floor(n / 2)) continue;
        const t0 = k / n;
        const t1 = (k + 1) / n;
        segs.push([x0 + (x1 - x0) * t0, z0 + (z1 - z0) * t0, x0 + (x1 - x0) * t1, z0 + (z1 - z0) * t1]);
      }
    };
    const W = halfX + 0.55;
    const D = halfZ + 0.55;
    edge(-W, D, W, D, true);
    edge(-W, -D, W, -D, false);
    edge(-W, -D, -W, D, false);
    edge(W, -D, W, D, false);
    for (const [ax, az, bx, bz] of segs) {
      if (walls.count >= 160) break;
      const [x0, z0] = at(ax, az);
      const [x1, z1] = at(bx, bz);
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      dummy.position.set(mx, heightAt(mx, mz).h - 0.05, mz);
      dummy.rotation.set(0, Math.atan2(-(z1 - z0), x1 - x0), 0);
      dummy.scale.set(Math.hypot(x1 - x0, z1 - z0) + 0.05, 0.8 + Math.random() * 0.25, 1);
      dummy.updateMatrix();
      walls.setMatrixAt(walls.count++, dummy.matrix);
    }
  }
  meshes.forEach((im) => {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  });
  walls.instanceMatrix.needsUpdate = true;
}

export function createLandmarks() {
  const root = new THREE.Group();
  const anchors = {};
  for (const city of CITIES) {
    const lm = BUILD[city.id]();
    const x = city.x;
    const z = city.z + city.side * 14;
    let y = heightAt(x, z).h;
    if (city.id === 'venice') y = Math.max(y, WATER_Y + 0.2);
    // plinth so buildings never float on slopes
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m('#b49870', { roughness: 0.95 }));
    lm.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(lm);
    plinth.scale.set(bb.max.x - bb.min.x + 1, 3, bb.max.z - bb.min.z + 1);
    plinth.position.set((bb.max.x + bb.min.x) / 2, -1.45, (bb.max.z + bb.min.z) / 2);
    lm.add(plinth);

    lm.position.set(x, y, z);
    if (city.side > 0) lm.rotation.y = Math.PI; // face the road
    lm.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = o !== plinth;
        o.receiveShadow = true;
      }
    });
    root.add(lm);
    anchors[city.id] = new THREE.Vector3(x, y + 4, z);

    if (!['pamir', 'taklamakan', 'venice', 'constantinople'].includes(city.id)) {
      scatterHouses(root, city);
    }
  }
  return { group: root, anchors };
}
