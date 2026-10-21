import * as THREE from 'three';
import { fbm, ridged, lerp, smoothstep, clamp } from './noise.js';
import { ROUTE_POINTS, CITIES } from './data.js';
import { makeWaterNormal } from './textures.js';
import { pbrSet, SETS } from './pbr.js';

const gauss = (x, mu, s) => Math.exp(-((x - mu) ** 2) / (2 * s * s));

export const WATER_Y = 0.1;

// ---------------------------------------------------------------- route (2D)
const flatCurve = new THREE.CatmullRomCurve3(
  ROUTE_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  false,
  'centripetal'
);
const routeSamples = flatCurve.getSpacedPoints(500);

function distToRoute(x, z) {
  let best = Infinity;
  for (let i = 0; i < routeSamples.length; i++) {
    const p = routeSamples[i];
    const dx = p.x - x;
    if (dx > 40 || dx < -40) continue;
    const dz = p.z - z;
    const d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export function seaMask(x, z) {
  const xw = x + (fbm(z * 0.04 + 3, 7.1) - 0.5) * 16;
  return smoothstep(-174, -188, xw) * smoothstep(-240, -228, xw);
}

// Height of the road itself (it climbs over the Pamir pass).
export function roadY(x, z) {
  const land = 0.5 + gauss(x, 82, 18) * 4.5;
  return lerp(land, WATER_Y, seaMask(x, z));
}

function rawHeight(x, z) {
  const n = fbm(x * 0.03 + 50, z * 0.03 + 20);
  const r = ridged(x * 0.022 + 10, z * 0.022 - 4);

  const mountains =
    gauss(x, 82, 20) * 30 +
    gauss(x, 252, 16) * 7 +
    gauss(x, -132, 24) * 8 +
    gauss(x, -272, 14) * 10;

  // the far edges of the map rise a little so the world feels framed
  const edge = smoothstep(55, 110, Math.abs(z)) * 9;

  const desert =
    smoothstep(238, 214, x) * smoothstep(96, 126, x) + gauss(x, -25, 26) * 0.7;
  // real dunes are asymmetric: a long gentle windward slope and a short steep slip face,
  // with crests that wander and break into crescents
  const ph = x * 0.055 + z * 0.022 + fbm(x * 0.03, z * 0.03) * 2.2;
  const u = ph - Math.floor(ph);
  const prof = u < 0.78 ? Math.pow(u / 0.78, 1.35) : Math.pow((1 - u) / 0.22, 1.6);
  const crest = 0.55 + 0.45 * fbm(x * 0.045 + 7, z * 0.08 - 3);
  const small = Math.sin(x * 0.42 + z * 0.19 + fbm(x * 0.09, z * 0.09) * 5) * 0.5 + 0.5;
  const dunes = desert * (prof * crest * 4.2 + small * 0.6);

  // gullies and scree give the mountains a weathered surface
  const erosion = ridged(x * 0.09 + 3, z * 0.09 - 8) * (mountains + edge) * 0.12;
  // small crags and boulders on the high ground
  const crags = ridged(x * 0.27 - 11, z * 0.27 + 5, 3) * smoothstep(3, 12, mountains + edge) * 1.6;
  return 0.5 + n * 3.2 + r * (mountains + edge) + erosion + crags + dunes;
}

// flat building pads where the landmarks stand
const PADS = CITIES.map((c) => ({ x: c.x, z: c.z + c.side * 14, r: c.id === 'samarkand' || c.id === 'baghdad' ? 19 : 15 }));

export function heightAt(x, z) {
  const d = distToRoute(x, z);
  let h = rawHeight(x, z);
  for (const pad of PADS) {
    const pd = Math.hypot(x - pad.x, z - pad.z);
    if (pd < pad.r * 1.6) h = lerp(roadY(pad.x, pad.z) + 0.15, h, smoothstep(pad.r * 0.75, pad.r * 1.6, pd));
  }
  h = lerp(roadY(x, z), h, smoothstep(2.2, 12, d));
  h = lerp(h, -2.5, seaMask(x, z));
  return { h, d };
}

// ---------------------------------------------------------------- colours
const GROUND_STOPS = [
  [320, '#9d9b5d'],
  [280, '#b1a467'],
  [235, '#d4ab6c'],
  [175, '#e4bb7b'],
  [120, '#cfa66b'],
  [82, '#8f8070'],
  [45, '#b5a463'],
  [10, '#c9a76d'],
  [-40, '#d3aa75'],
  [-80, '#bfa268'],
  [-130, '#a29a69'],
  [-170, '#949c64'],
  [-300, '#8b9b5f'],
].map(([x, c]) => [x, new THREE.Color(c)]);

function groundColor(x, out) {
  for (let i = 0; i < GROUND_STOPS.length - 1; i++) {
    const [x0, c0] = GROUND_STOPS[i];
    const [x1, c1] = GROUND_STOPS[i + 1];
    if (x <= x0 && x >= x1) {
      return out.copy(c0).lerp(c1, (x0 - x) / (x0 - x1));
    }
  }
  return out.copy(x > 0 ? GROUND_STOPS[0][1] : GROUND_STOPS.at(-1)[1]);
}

const OASES = CITIES.filter((c) =>
  ['dunhuang', 'kashgar', 'samarkand', 'bukhara', 'baghdad', 'changan'].includes(c.id)
);

// ---------------------------------------------------------------- terrain
export function createTerrain({ hi = true } = {}) {
  const W = 640;
  const D = 260;
  const res = hi ? 1 : 1.6;
  const geo = new THREE.PlaneGeometry(W, D, Math.round(W / res), Math.round(D / res));
  geo.rotateX(-Math.PI / 2);
  geo.translate(10, 0, 0);

  const pos = geo.attributes.position;
  const dists = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const { h, d } = heightAt(pos.getX(i), pos.getZ(i));
    pos.setY(i, h);
    dists[i] = d;
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;

  const colors = new Float32Array(pos.count * 3);
  const ripple = new Float32Array(pos.count);
  const surf = new Float32Array(pos.count * 2);
  const c = new THREE.Color();
  const road = new THREE.Color('#e3c999');
  const rut = new THREE.Color('#b99a6c');
  const oasis = new THREE.Color('#6f8f3f');
  const oasisDark = new THREE.Color('#4f6e2c');
  const rock = new THREE.Color('#7a6b5c');
  const rockDark = new THREE.Color('#5a4e44');
  const snow = new THREE.Color('#f6f4ef');
  const wet = new THREE.Color('#bba57a');

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = pos.getY(i);
    const d = dists[i];
    const slope = 1 - nrm.getY(i);

    groundColor(x, c);
    const v = fbm(x * 0.06, z * 0.06, 4) - 0.5;
    c.offsetHSL(v * 0.02, v * 0.08, v * 0.16);

    for (const o of OASES) {
      const od = Math.hypot(x - o.x, z - o.z);
      const k = smoothstep(30, 8, od) * (0.45 + fbm(x * 0.15, z * 0.15, 3) * 0.8);
      if (k > 0) c.lerp(fbm(x * 0.4, z * 0.4, 2) > 0.5 ? oasis : oasisDark, clamp(k * 0.85));
    }

    // steep slopes show bare rock; high ground is stony everywhere, with grass only in hollows
    const alpine = smoothstep(3.5, 9, h) * smoothstep(1.5, 7, d);
    const r = Math.max(smoothstep(0.12, 0.38, slope), alpine * (0.55 + fbm(x * 0.2, z * 0.2, 3) * 0.6));
    if (r > 0) c.lerp(fbm(x * 0.3, z * 0.3, 2) > 0.5 ? rock : rockDark, r * 0.9);
    // scree: pale broken stone where the slope eases out at the foot of cliffs
    const scree = smoothstep(0.06, 0.16, slope) * (1 - r) * smoothstep(4, 9, h);
    if (scree > 0) c.lerp(rock, scree * 0.45).offsetHSL(0, -0.02, 0.05 * scree);
    // ragged snow line that lingers in gullies
    const snowLine = 13 + fbm(x * 0.08 + 9, z * 0.08, 3) * 5;
    if (h > snowLine - 2) c.lerp(snow, smoothstep(snowLine - 2, snowLine + 2.5, h) * smoothstep(0.62, 0.22, slope));

    // the road: pale dust with darker wheel/hoof ruts
    const rk = smoothstep(2.8, 0.8, d);
    if (rk > 0) {
      c.lerp(road, rk * 0.8);
      const ruts = Math.abs(d - 0.9) < 0.35 ? 0.35 : 0;
      c.lerp(rut, ruts * rk);
    }

    if (h < 0.35) c.lerp(wet, 0.7);
    // alpine meadows in the hollows of the Pamir
    const meadow = alpine * smoothstep(0.08, 0.02, slope) * smoothstep(0.45, 0.65, fbm(x * 0.12 + 4, z * 0.12, 3));
    if (meadow > 0) c.lerp(oasisDark, meadow * 0.55);

    // sand ripples only on flat, sandy ground
    ripple[i] = (1 - r) * smoothstep(15, 12, h) * (1 - smoothstep(2.5, 0.5, d) * 0.6);

    surf[i * 2] = r;
    surf[i * 2 + 1] = rk;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('ripple', new THREE.BufferAttribute(ripple, 1));
  geo.setAttribute('surf', new THREE.BufferAttribute(surf, 2));

  const sand = pbrSet(SETS.sand);
  const ground = pbrSet(SETS.ground);
  const rockSet = pbrSet(SETS.rock);
  sand.normalMap.repeat.set(W / 7, D / 7);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    normalMap: sand.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    envMapIntensity: 0.6,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSand = { value: sand.map };
    shader.uniforms.uGround = { value: ground.map };
    shader.uniforms.uRock = { value: rockSet.map };
    shader.uniforms.uRockN = { value: rockSet.normalMap };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float ripple;\nattribute vec2 surf;\nvarying float vRipple;\nvarying vec2 vSurf;\nvarying vec2 vWXZ;\nvarying vec3 vWP;\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRipple = ripple;\nvSurf = surf;\nvWXZ = position.xz;\nvWP = position;\nvWN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vRipple;
        varying vec2 vSurf;
        varying vec2 vWXZ;
        varying vec3 vWP;
        varying vec3 vWN;
        uniform sampler2D uSand;
        uniform sampler2D uGround;
        uniform sampler2D uRock;
        uniform sampler2D uRockN;
        float th(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float tn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(th(i), th(i + vec2(1,0)), f.x), mix(th(i + vec2(0,1)), th(i + vec2(1,1)), f.x), f.y); }
        // rock seen from three sides, so cliffs are not smeared
        vec3 triRock(vec3 p, vec3 n){
          vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
          vec3 a = texture2D(uRock, p.zy * 0.11).rgb;
          vec3 b = texture2D(uRock, p.xz * 0.11).rgb;
          vec3 c = texture2D(uRock, p.xy * 0.11).rgb;
          return a * w.x + b * w.y + c * w.z;
        }
        // wind ripples on sand: a height field and its slope along the wind
        float ripH(vec2 p){
          float warp = tn(p * 0.35) * 3.0 + tn(p * 1.3) * 0.6;
          return sin(dot(p, vec2(0.93, 0.36)) * 5.5 + warp * 3.0);
        }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // two scales of each texture break up visible tiling
          vec3 s = mix(texture2D(uSand, vWXZ * 0.09).rgb, texture2D(uSand, vWXZ * 0.017).rgb, 0.5);
          vec3 g = mix(texture2D(uGround, vWXZ * 0.11).rgb, texture2D(uGround, vWXZ * 0.021).rgb, 0.5);
          vec3 r = mix(triRock(vWP, normalize(vWN)), texture2D(uRock, vWXZ * 0.013).rgb, 0.35);
          // sedimentary layers banded by height, bent by noise
          float band = sin(vWP.y * 2.1 + tn(vWXZ * 0.05) * 6.0) * 0.5 + 0.5;
          r *= mix(vec3(0.86, 0.8, 0.74), vec3(1.08, 1.0, 0.92), band);
          vec3 detail = mix(mix(s, g, clamp(vSurf.y, 0.0, 1.0)), r, clamp(vSurf.x, 0.0, 1.0));
          float dl = dot(detail, vec3(0.3333));
          diffuseColor.rgb *= mix(vec3(1.0), detail / 0.5, 0.75) * 0.9 + 0.1 * dl;
        }`
      )
      .replace(
        '#include <normal_fragment_maps>',
        THREE.ShaderChunk.normal_fragment_maps.replace(
          'mapN.xy *= normalScale;',
          `// on rock, swap the sand normals for chiselled stone at two scales
          vec3 rn = mix(texture2D(uRockN, vWXZ * 0.11).xyz, texture2D(uRockN, vWXZ * 0.37).xyz, 0.45) * 2.0 - 1.0;
          float rk = clamp(vSurf.x * 1.3, 0.0, 1.0);
          mapN = normalize(mix(mapN, rn, rk));
          mapN.xy *= normalScale * (0.45 + vRipple * 0.55 + rk * 1.4);`
        ) +
          `
        {
          // fine wind ripples tilt the sand normal; they fade on slopes, rock and road
          float e = 0.04;
          float h0 = ripH(vWXZ);
          float hx = ripH(vWXZ + vec2(e, 0.0));
          float hz = ripH(vWXZ + vec2(0.0, e));
          vec3 g = vec3(-(hx - h0) / e, 0.0, -(hz - h0) / e) * 0.035 * vRipple * (1.0 - clamp(vSurf.x * 2.0, 0.0, 1.0));
          normal = normalize(normal + (viewMatrix * vec4(g, 0.0)).xyz);
        }`
      );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

export function createWater() {
  const geo = new THREE.PlaneGeometry(700, 320, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const normalMap = makeWaterNormal();
  normalMap.repeat.set(70, 32);
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#163f57',
    roughness: 0.34,
    metalness: 0,
    normalMap,
    normalScale: new THREE.Vector2(0.35, 0.35),
    clearcoat: 1,
    clearcoatRoughness: 0.25,
    transparent: true,
    opacity: 0.94,
    envMapIntensity: 0.8,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(10, WATER_Y, 0);
  mesh.receiveShadow = true;
  mesh.userData.update = (time) => {
    normalMap.offset.set(time * 0.012, time * 0.007);
  };
  return mesh;
}

// ---------------------------------------------------------------- 3D route
export function createRoute() {
  const pts = flatCurve.getSpacedPoints(900).map((p) => {
    return new THREE.Vector3(p.x, roadY(p.x, p.z), p.z);
  });
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  return curve;
}

// The caravan's trail: hoofprints pressed into the dust and a string of small oil lamps
// that light up behind it. From above, at the end, the lamps draw the whole road in gold.
export function createSilkThread(curve) {
  const group = new THREE.Group();
  const p = new THREE.Vector3();
  const tan = new THREE.Vector3();

  // ---- lamps
  const N = 2400;
  const pos = new Float32Array(N * 3);
  const at = new Float32Array(N);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    curve.getPointAt(t, p);
    curve.getTangentAt(t, tan);
    // alternate sides of the road, a little scattered
    const side = (i % 2 ? 1 : -1) * (1.25 + Math.random() * 0.35);
    pos[i * 3] = p.x - tan.z * side;
    pos[i * 3 + 1] = p.y + 0.35;
    pos[i * 3 + 2] = p.z + tan.x * side;
    at[i] = t;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aT', new THREE.BufferAttribute(at, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const U = { uProgress: { value: 0 }, uTime: { value: 0 }, uGlow: { value: 0.2 }, uOutro: { value: 0 }, uScale: { value: innerHeight * 0.5 } };
  const lamps = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: `
        attribute float aT; attribute float aSeed;
        uniform float uProgress; uniform float uTime; uniform float uGlow; uniform float uOutro; uniform float uScale;
        varying float vA; varying float vS;
        void main(){
          // lamps behind the caravan are lit; the newest ones flare up as they catch
          float lit = step(aT, uProgress);
          float fresh = exp(-(uProgress - aT) * 900.0) * lit;
          float flicker = 0.75 + 0.25 * sin(uTime * (6.0 + aSeed * 5.0) + aSeed * 40.0);
          vA = lit * (uGlow * flicker + fresh * 1.5 + uOutro * 0.9);
          vS = aSeed;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (0.38 + fresh * 0.5 + uOutro * 1.4) * uScale / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA; varying float vS;
        void main(){
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float core = smoothstep(1.0, 0.0, d);
          float a = pow(core, 2.2) * vA;
          if (a < 0.01) discard;
          vec3 col = mix(vec3(1.0, 0.72, 0.32), vec3(1.0, 0.9, 0.62), vS);
          gl_FragColor = vec4(col * a * 2.2, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  lamps.frustumCulled = false;

  // ---- hoofprints: little dark ovals in pairs along the middle of the road
  const H = 3600;
  const printGeo = new THREE.CircleGeometry(0.09, 10);
  printGeo.scale(0.75, 1, 1);
  printGeo.rotateX(-Math.PI / 2);
  const prints = new THREE.InstancedMesh(
    printGeo,
    new THREE.MeshBasicMaterial({ color: '#6e5233', transparent: true, opacity: 0.38, depthWrite: false }),
    H
  );
  const dummy = new THREE.Object3D();
  const printT = new Float32Array(H);
  for (let i = 0; i < H; i++) {
    const t = i / (H - 1);
    curve.getPointAt(t, p);
    curve.getTangentAt(t, tan);
    const off = (i % 2 ? 0.22 : -0.22) + (Math.random() - 0.5) * 0.15;
    dummy.position.set(p.x - tan.z * off, p.y + 0.06, p.z + tan.x * off);
    dummy.rotation.set(0, Math.atan2(tan.x, tan.z) + (Math.random() - 0.5) * 0.4, 0);
    dummy.updateMatrix();
    prints.setMatrixAt(i, dummy.matrix);
    printT[i] = t;
  }
  prints.count = 0;
  prints.frustumCulled = false;

  group.add(prints, lamps);
  return {
    group,
    setProgress(t) {
      U.uProgress.value = clamp(t);
      U.uTime.value = performance.now() / 1000;
      U.uScale.value = innerHeight * 0.5;
      prints.count = Math.floor(clamp(t) * (H - 1));
    },
    setGlow(v, outro = 0) {
      U.uGlow.value = 0.15 + v * 1.2;
      U.uOutro.value = outro;
      prints.material.opacity = 0.38 * (1 - outro);
    },
  };
}

export function createGhostRoute(curve) {
  const pts = curve.getSpacedPoints(1400).map((p) => p.clone().setY(p.y + 0.1));
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineDashedMaterial({
    color: '#3a2414',
    dashSize: 0.9,
    gapSize: 0.9,
    transparent: true,
    opacity: 0.45,
  });
  const line = new THREE.Line(geo, mat);
  line.computeLineDistances();
  return line;
}

// ---------------------------------------------------------------- sky things
export function createStars() {
  const n = 1800;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random();
    const v = Math.random() * 0.9 + 0.05;
    const th = u * Math.PI * 2;
    const ph = Math.acos(v);
    const r = 700;
    arr[i * 3] = Math.sin(ph) * Math.cos(th) * r;
    arr[i * 3 + 1] = Math.cos(ph) * r;
    arr[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.PointsMaterial({
    color: '#fff6e6',
    size: 1.6,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    fog: false,
    depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

function softDot() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

export function createDust() {
  const n = 2200;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = (Math.random() - 0.5) * 80;
    arr[i * 3 + 1] = Math.random() * 10;
    arr[i * 3 + 2] = (Math.random() - 0.5) * 80;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.PointsMaterial({
    color: '#e9c995',
    map: softDot(),
    size: 0.3,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  return {
    points,
    update(dt, center, strength) {
      mat.opacity = strength * 0.85;
      points.visible = strength > 0.01;
      if (!points.visible) return;
      const a = geo.attributes.position;
      for (let i = 0; i < n; i++) {
        let x = a.array[i * 3] + dt * (6 + strength * 14);
        let y = a.array[i * 3 + 1] + Math.sin(x * 0.3 + i) * dt * 0.6;
        if (x > 40) x -= 80;
        if (y > 10) y -= 10;
        if (y < 0) y += 10;
        a.array[i * 3] = x;
        a.array[i * 3 + 1] = y;
      }
      a.needsUpdate = true;
      points.position.set(center.x, center.y, center.z);
    },
  };
}
