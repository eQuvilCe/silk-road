// Trees, palms, shrubs and rocks along the whole road. Every canopy is built
// from hundreds of alpha-cut leaf cards with normals pointing out of the crown,
// so it shades like a soft volume, and the whole thing sways in the wind.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CITIES } from './data.js';
import { heightAt, seaMask } from './world.js';
import { townBlocks, courtyardTrees } from './landmarks.js';
import { pbrSet, SETS } from './pbr.js';
import { fbm } from './noise.js';

export const wind = { value: 0 };

// deterministic random so the world is the same on every visit
let seed = 1337;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const range = (a, b) => a + (b - a) * rnd();

// ---------------------------------------------------------------- textures
function canvasTex(draw, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// a cluster of small leaves on a transparent background
function leafTex(hue, sat, light, { long = 1, count = 90 } = {}) {
  return canvasTex((g, s) => {
    g.strokeStyle = `hsla(${hue + 10}, 25%, 22%, 0.9)`;
    g.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo(s / 2, s * 0.95);
      g.quadraticCurveTo(s * range(0.3, 0.7), s * 0.6, s * range(0.1, 0.9), s * range(0.1, 0.5));
      g.stroke();
    }
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * s * 0.42;
      const x = s / 2 + Math.cos(a) * r;
      const y = s / 2 + Math.sin(a) * r * 0.95;
      const l = light + range(-12, 10) - (r / s) * 8;
      g.fillStyle = `hsl(${hue + range(-6, 6)}, ${sat + range(-8, 8)}%, ${l}%)`;
      g.save();
      g.translate(x, y);
      g.rotate(rnd() * Math.PI * 2);
      g.beginPath();
      g.ellipse(0, 0, s * 0.022 * long, s * 0.045 * long, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  });
}

// one palm frond: a midrib with long drooping leaflets
function frondTex() {
  return canvasTex((g, s) => {
    g.translate(0, s / 2);
    g.strokeStyle = 'hsl(60, 25%, 30%)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(s, 0);
    g.stroke();
    for (let i = 0; i < 46; i++) {
      const x = 6 + (i / 46) * (s - 10);
      const len = s * 0.42 * Math.sin(Math.PI * (0.15 + 0.85 * (i / 46)));
      for (const side of [-1, 1]) {
        g.strokeStyle = `hsl(${range(70, 88)}, ${range(30, 42)}%, ${range(34, 48)}%)`;
        g.lineWidth = range(2.5, 4);
        g.beginPath();
        g.moveTo(x, 0);
        g.quadraticCurveTo(x + len * 0.35, side * len * 0.5, x + len * 0.55, side * len * 0.95);
        g.stroke();
      }
    }
  }, 256);
}

function barkTex(base) {
  const t = canvasTex((g, s) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      g.strokeStyle = `rgba(${rnd() < 0.5 ? '20,12,6' : '255,240,220'}, ${range(0.05, 0.22)})`;
      g.lineWidth = range(1, 3);
      const x = rnd() * s;
      g.beginPath();
      g.moveTo(x, rnd() * s);
      g.lineTo(x + range(-4, 4), rnd() * s);
      g.stroke();
    }
  }, 128);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------- geometry helpers
// leaf cards scattered through a volume; normals point away from the crown centre
function cards(n, sample, size, center, { up = 0.35, sway = 1 } = {}) {
  const geos = [];
  const p = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    sample(p);
    const s = size * range(0.75, 1.25);
    const g = new THREE.PlaneGeometry(s, s);
    g.rotateZ(rnd() * Math.PI * 2);
    g.rotateX(range(-1.2, 1.2));
    g.rotateY(rnd() * Math.PI * 2);
    g.translate(p.x, p.y, p.z);
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const sw = new Float32Array(pos.count);
    for (let k = 0; k < pos.count; k++) {
      nrm.set(pos.getX(k) - center.x, (pos.getY(k) - center.y) * 0.8, pos.getZ(k) - center.z).normalize();
      nrm.y += up;
      nrm.normalize();
      nor.setXYZ(k, nrm.x, nrm.y, nrm.z);
      sw[k] = sway * Math.max(0, pos.getY(k)) ;
    }
    g.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
    geos.push(g);
  }
  return mergeGeometries(geos);
}

function withSway(g, k = 0.15) {
  const pos = g.attributes.position;
  const sw = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) sw[i] = Math.max(0, pos.getY(i)) * k;
  g.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
  return g;
}

// a tapered, slightly bent limb from a to b
function limb(a, b, r0, r1, seg = 7) {
  const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(range(-0.15, 0.15), 0, range(-0.15, 0.15)));
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  const g = new THREE.TubeGeometry(curve, 6, 1, seg, false);
  // taper the radius along the tube
  const pos = g.attributes.position;
  const pts = curve.getPoints(6);
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.floor(i / (seg + 1));
    const t = ring / 6;
    const c = pts[ring];
    const r = r0 + (r1 - r0) * t;
    pos.setXYZ(i, c.x + (pos.getX(i) - c.x) * r, c.y + (pos.getY(i) - c.y) * r, c.z + (pos.getZ(i) - c.z) * r);
  }
  g.computeVertexNormals();
  return withSway(g, 0.03);
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- species
function poplar(narrow = 1) {
  const H = 7.4;
  const wood = [limb(V(0, -0.3, 0), V(0, H * 0.8, 0), 0.24, 0.05)];
  for (let i = 0; i < 7; i++) {
    const y = range(1.6, H * 0.7);
    const a = rnd() * 6.28;
    wood.push(limb(V(0, y, 0), V(Math.cos(a) * 0.5 * narrow, y + 1.6, Math.sin(a) * 0.5 * narrow), 0.06, 0.02, 5));
  }
  const center = V(0, H * 0.55, 0);
  const leaves = cards(
    170,
    (p) => {
      const t = rnd();
      const y = 1.3 + t * (H - 1.1);
      const r = 0.95 * narrow * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.05)), 0.75) * Math.sqrt(rnd());
      const a = rnd() * 6.28;
      p.set(Math.cos(a) * r, y, Math.sin(a) * r);
    },
    1.05,
    center,
    { up: 0.2, sway: 0.03 }
  );
  return { wood: mergeGeometries(wood), leaves };
}

function broadleaf() {
  // mulberry / elm / apricot: short trunk, a few big limbs, clumped crown
  const wood = [limb(V(0, -0.3, 0), V(range(-0.2, 0.2), 2.2, range(-0.2, 0.2)), 0.26, 0.17)];
  const clumps = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 6.28 + range(-0.4, 0.4);
    const c = V(Math.cos(a) * range(0.9, 1.5), range(3.0, 4.0), Math.sin(a) * range(0.9, 1.5));
    clumps.push(c);
    wood.push(limb(V(0, 2.0, 0), c.clone().multiplyScalar(0.8), 0.13, 0.05, 6));
  }
  clumps.push(V(0, 4.4, 0));
  const center = V(0, 3.4, 0);
  const leaves = cards(
    200,
    (p) => {
      const c = clumps[Math.floor(rnd() * clumps.length)];
      const r = Math.cbrt(rnd()) * 1.25;
      const u = rnd() * 2 - 1;
      const a = rnd() * 6.28;
      const s = Math.sqrt(1 - u * u);
      p.set(c.x + Math.cos(a) * s * r, c.y + u * r * 0.75, c.z + Math.sin(a) * s * r);
    },
    1.15,
    center,
    { up: 0.3, sway: 0.025 }
  );
  return { wood: mergeGeometries(wood), leaves };
}

function cypress() {
  const H = 7;
  const wood = [limb(V(0, -0.3, 0), V(0, H * 0.7, 0), 0.16, 0.05)];
  const center = V(0, H * 0.5, 0);
  const leaves = cards(
    150,
    (p) => {
      const t = rnd();
      const y = 0.6 + t * (H - 0.4);
      const r = 0.62 * Math.pow(1 - t, 0.8) * Math.sqrt(rnd()) + 0.08;
      const a = rnd() * 6.28;
      p.set(Math.cos(a) * r, y, Math.sin(a) * r);
    },
    0.75,
    center,
    { up: 0.15, sway: 0.02 }
  );
  return { wood: mergeGeometries(wood), leaves };
}

function shrub() {
  const center = V(0, 0.45, 0);
  const leaves = cards(
    46,
    (p) => {
      const a = rnd() * 6.28;
      const r = Math.sqrt(rnd()) * 0.9;
      p.set(Math.cos(a) * r, range(0.15, 0.85) * (1 - r * 0.4), Math.sin(a) * r);
    },
    0.75,
    center,
    { up: 0.45, sway: 0.08 }
  );
  const wood = [];
  for (let i = 0; i < 5; i++) {
    const a = rnd() * 6.28;
    wood.push(limb(V(0, -0.1, 0), V(Math.cos(a) * 0.6, 0.7, Math.sin(a) * 0.6), 0.05, 0.015, 4));
  }
  return { wood: mergeGeometries(wood), leaves };
}

function palm() {
  const H = range(5.5, 6.5);
  const lean = V(range(-0.6, 0.6), H, range(-0.6, 0.6));
  const curve = new THREE.QuadraticBezierCurve3(V(0, -0.3, 0), V(lean.x * 0.2, H * 0.5, lean.z * 0.2), lean);
  const trunk = new THREE.TubeGeometry(curve, 16, 1, 9, false);
  const pos = trunk.attributes.position;
  const pts = curve.getPoints(16);
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.floor(i / 10);
    const t = ring / 16;
    // ringed trunk, wider at the base
    const r = (0.26 - t * 0.08) * (1 + (ring % 2) * 0.08) + (t < 0.08 ? 0.12 * (1 - t / 0.08) : 0);
    const c = pts[ring];
    pos.setXYZ(i, c.x + (pos.getX(i) - c.x) * r, c.y + (pos.getY(i) - c.y) * r, c.z + (pos.getZ(i) - c.z) * r);
  }
  trunk.computeVertexNormals();
  withSway(trunk, 0.01);

  // fronds: bent ribbons that arch out and droop
  const fronds = [];
  const N = 16;
  for (let f = 0; f < N; f++) {
    const a = (f / N) * 6.28 + range(-0.2, 0.2);
    const len = range(2.6, 3.4);
    const rise = range(0.2, 1.0);
    const g = new THREE.PlaneGeometry(len, 1.5, 8, 1);
    g.translate(len / 2, 0, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const t = x / len;
      const w = p.getY(i);
      // arc: up first, then droop; the blade folds into a shallow V
      const y = Math.sin(t * Math.PI * 0.9) * rise - t * t * 1.9 + Math.abs(w) * 0.25;
      p.setXYZ(i, x, y, w);
    }
    g.rotateY(-a);
    g.translate(lean.x, lean.y, lean.z);
    g.computeVertexNormals();
    const nor = g.attributes.normal;
    const sw = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      const dx = p.getX(i) - lean.x;
      const dz = p.getZ(i) - lean.z;
      const d = Math.hypot(dx, dz);
      nor.setXYZ(i, dx / (d + 1e-3) * 0.5, 0.85, dz / (d + 1e-3) * 0.5);
      sw[i] = 0.05 + d * 0.06;
    }
    g.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
    fronds.push(g);
  }
  return { wood: trunk, leaves: mergeGeometries(fronds) };
}

function rockGeo() {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const sx = range(0.8, 1.4);
  const sz = range(0.7, 1.2);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fbm(v.x * 1.7 + seed * 1e-6, v.z * 1.7 + v.y);
    v.multiplyScalar(0.75 + n * 0.55);
    v.y *= 0.62;
    p.setXYZ(i, v.x * sx, v.y, v.z * sz);
  }
  g.computeVertexNormals();
  return withSway(g, 0);
}

// ---------------------------------------------------------------- materials
function swayMaterial(params, { flutter = 1 } = {}) {
  const mat = new THREE.MeshStandardMaterial(params);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSway;\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float ph = ip.x * 0.37 + ip.z * 0.53;
          float gust = 0.65 + 0.35 * sin(uWind * 0.45 + ip.x * 0.05);
          transformed.x += sin(uWind * 1.3 + ph) * aSway * gust * 1.2;
          transformed.z += cos(uWind * 1.05 + ph * 1.3) * aSway * gust * 0.8;
          transformed += objectNormal * sin(uWind * 5.0 + ph * 4.0 + position.x * 3.1 + position.y * 2.3) * aSway * ${(0.35 * flutter).toFixed(2)};
        }`
      );
    // leaves glow a little when the sun is behind them
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 0.07;'
    );
  };
  return mat;
}

// ---------------------------------------------------------------- placement
const ZONES = {
  changan: ['broad', 'poplar', 'broad', 'poplar'],
  dunhuang: ['poplar', 'poplar', 'broad', 'shrub'],
  kashgar: ['poplar', 'broad', 'poplar', 'broad'],
  samarkand: ['poplar', 'broad', 'broad', 'poplar', 'cypress'],
  bukhara: ['broad', 'poplar', 'broad', 'poplar'],
  baghdad: ['palm', 'palm', 'palm', 'broad'],
  constantinople: ['cypress', 'cypress', 'broad', 'broad'],
  venice: ['cypress', 'broad', 'cypress'],
};

// what grows between the cities, by longitude
function wildAt(x) {
  if (x > 245) return { kinds: ['broad', 'poplar', 'shrub'], density: 0.5 };
  if (x > 120) return { kinds: ['shrub', 'shrub', 'shrub', 'rock'], density: 0.35 }; // Gobi & Taklamakan: saxaul, tamarisk
  if (x > 62) return { kinds: ['rock', 'rock', 'rock', 'shrub'], density: 0.9 }; // Pamir: boulder fields
  if (x > -40) return { kinds: ['shrub', 'broad', 'rock', 'shrub'], density: 0.35 };
  if (x > -120) return { kinds: ['shrub', 'palm', 'rock'], density: 0.25 };
  return { kinds: ['broad', 'cypress', 'shrub'], density: 0.45 };
}

export function createFlora({ hi = true } = {}) {
  seed = 1337;
  const group = new THREE.Group();

  const leafMat = (tex, color = '#ffffff') =>
    swayMaterial({ map: tex, color, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.82, metalness: 0 });
  const bark = (c) => swayMaterial({ map: barkTex(c), roughness: 0.95 }, { flutter: 0 });

  const SPECIES = {
    poplar: { make: () => poplar(), wood: bark('#7d7466'), leaf: leafMat(leafTex(88, 38, 34, { long: 0.9 })), variants: 3, scale: [0.85, 1.25] },
    broad: { make: broadleaf, wood: bark('#5e4a38'), leaf: leafMat(leafTex(95, 40, 33)), variants: 3, scale: [0.8, 1.2] },
    cypress: { make: cypress, wood: bark('#4a3a2c'), leaf: leafMat(leafTex(120, 30, 22, { long: 0.7, count: 120 })), variants: 2, scale: [0.85, 1.2] },
    shrub: { make: shrub, wood: bark('#6b5a48'), leaf: leafMat(leafTex(70, 22, 40, { long: 0.6, count: 120 })), variants: 3, scale: [0.6, 1.3] },
    palm: { make: palm, wood: bark('#8a7258'), leaf: leafMat(frondTex()), variants: 3, scale: [0.85, 1.15] },
    rock: { make: () => ({ wood: rockGeo() }), wood: new THREE.MeshStandardMaterial({ ...pbrSet(SETS.rock), color: '#c9b49a', roughness: 1 }), variants: 4, scale: [0.4, 1.6] },
  };

  // spots per species, filled below, then turned into instanced meshes
  const spots = Object.fromEntries(Object.keys(SPECIES).map((k) => [k, []]));
  const color = new THREE.Color();

  const ok = (x, z, minRoad, city) => {
    const { h, d } = heightAt(x, z);
    if (d < minRoad || seaMask(x, z) > 0.05) return null;
    for (const c of CITIES) {
      // keep landmark pads clear and the camera's side of the road open near cities
      if (Math.hypot(x - c.x, z - (c.z + c.side * 14)) < 15) return null;
      if (Math.abs(x - c.x) < 34 && Math.sign(z - c.z) === -c.side && d < 18) return null;
    }
    if (city && h > 6) return null;
    for (const b of townBlocks) if (Math.hypot(x - b.x, z - b.z) < b.r) return null;
    return h;
  };

  // groves around the cities
  for (const city of CITIES) {
    const kinds = ZONES[city.id];
    if (!kinds) continue;
    let placed = 0;
    for (let tries = 0; placed < (hi ? 64 : 36) && tries < 2400; tries++) {
      // clumped: orchards and lines of poplars along canals
      const a = rnd() * 6.28;
      const r = 9 + Math.pow(rnd(), 0.6) * 34;
      const x = city.x + Math.cos(a) * r;
      const z = city.z + Math.sin(a) * r * 0.9;
      const h = ok(x, z, 7, city);
      if (h == null) continue;
      const kind = kinds[Math.floor(rnd() * kinds.length)];
      spots[kind].push([x, h, z]);
      placed++;
      // poplars come in rows
      if (kind === 'poplar' && rnd() < 0.4) {
        const dir = rnd() * 6.28;
        for (let j = 1; j < 4; j++) {
          const px = x + Math.cos(dir) * j * 1.6;
          const pz = z + Math.sin(dir) * j * 1.6;
          const ph = ok(px, pz, 7, city);
          if (ph != null) spots.poplar.push([px, ph, pz]);
        }
      }
    }
  }

  // shade trees in the courtyards of town blocks
  for (const [x, h, z] of courtyardTrees) spots[rnd() < 0.7 ? 'broad' : 'poplar'].push([x, h, z]);

  // the wild in between
  for (let x = 300; x > -262; x -= 0.9) {
    const { kinds, density } = wildAt(x);
    for (let k = 0; k < 3; k++) {
      if (rnd() > density) continue;
      const z = range(-70, 70);
      const h = ok(x + range(-0.5, 0.5), z, 3.5, null);
      if (h == null) continue;
      const kind = kinds[Math.floor(rnd() * kinds.length)];
      spots[kind].push([x, h, z]);
    }
  }

  const dummy = new THREE.Object3D();
  for (const [name, sp] of Object.entries(SPECIES)) {
    const list = spots[name];
    if (!list.length) continue;
    // a few shape variants per species, instances spread between them
    for (let v = 0; v < sp.variants; v++) {
      const geo = sp.make();
      const mine = list.filter((_, i) => i % sp.variants === v);
      if (!mine.length) continue;
      const parts = [[geo.wood, sp.wood]];
      if (geo.leaves) parts.push([geo.leaves, sp.leaf]);
      for (const [g, mat] of parts) {
        const im = new THREE.InstancedMesh(g, mat, mine.length);
        mine.forEach(([x, y, z], i) => {
          const s = range(...sp.scale);
          dummy.position.set(x, y - (name === 'rock' ? 0.25 * s : 0), z);
          dummy.rotation.set(name === 'rock' ? range(-0.3, 0.3) : range(-0.04, 0.04), rnd() * 6.28, 0);
          dummy.scale.set(s, s * (name === 'rock' ? range(0.6, 1.2) : range(0.9, 1.1)), s);
          dummy.updateMatrix();
          im.setMatrixAt(i, dummy.matrix);
          // seasonal / dry variation: some crowns lighter, some more golden
          const dry = name === 'shrub' ? range(0.85, 1.15) : 1;
          im.setColorAt(i, color.setHSL(0.1 * rnd() * (name === 'rock' ? 0.2 : 1), 0.12, range(0.82, 1.0) * dry));
        });
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = name !== 'shrub' || hi;
        im.receiveShadow = true;
        group.add(im);
      }
    }
  }

  return {
    group,
    update(time) {
      wind.value = time;
    },
  };
}
