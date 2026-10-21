// Every city celebrates the caravan in its own way: its own fireworks palette and
// shapes, plus one signature effect (lanterns, apsara spirals, sand devils, aurora,
// searchlights, a lighthouse beam, a ring of stars, candles, reflections on water).
import * as THREE from 'three';
import { WATER_Y } from './world.js';
import { sfx } from './sound.js';

const MAX = 9000;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const THEMES = {
  changan: { pal: [['#ff2a3a', '#ffd27a', '#fff3d6'], ['#ffcf5a', '#ff7a2a']], kinds: ['peony', 'peony', 'willow', 'ring'], lanterns: '#ff4a2a', lanternRate: 0.12, fx: [] },
  dunhuang: { pal: [['#ffd27a', '#fff1c9'], ['#2fd3d0', '#ffd27a']], kinds: ['willow', 'willow', 'peony'], lanterns: '#ffb347', lanternRate: 0.35, fx: ['apsara'] },
  taklamakan: { pal: [['#ffb347', '#ffd9a0', '#ff8a3a']], kinds: ['peony', 'crossette'], lanterns: null, fx: ['dust'] },
  kashgar: { pal: [['#ff3b4f', '#ffd27a', '#2fd3d0', '#7aff7a', '#b48cff', '#ffffff']], kinds: ['peony', 'crossette', 'ring'], lanterns: '#ffb347', lanternRate: 0.5, fx: ['confetti'] },
  pamir: { pal: [['#bfe9ff', '#ffffff', '#7fb8ff'], ['#a0ffe6', '#ffffff']], kinds: ['peony', 'ring'], lanterns: null, fx: ['aurora', 'snow'] },
  samarkand: { pal: [['#2fd3d0', '#9ff3ff', '#ffd27a'], ['#2b5bd7', '#2fd3d0', '#ffffff']], kinds: ['ring', 'ring', 'peony', 'willow'], lanterns: '#ffcf7a', lanternRate: 0.4, fx: ['beams'] },
  bukhara: { pal: [['#ffd27a', '#fff1c9', '#ffb347']], kinds: ['willow', 'peony'], lanterns: '#ffb347', lanternRate: 0.5, fx: ['lighthouse'] },
  baghdad: { pal: [['#ffffff', '#9fd4ff', '#ffd27a']], kinds: ['star', 'ring', 'peony'], lanterns: null, fx: ['stars'] },
  constantinople: { pal: [['#b48cff', '#ffd27a', '#ffffff'], ['#7a2cff', '#ffd27a']], kinds: ['crossette', 'peony', 'willow'], lanterns: null, fx: ['candles'] },
  venice: { pal: [['#ff3b4f', '#ffffff', '#2b7bff'], ['#ffd27a', '#7aff9a', '#ff7ad9']], kinds: ['peony', 'ring', 'willow', 'crossette'], lanterns: null, fx: ['reflect'] },
};

function spriteTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// a soft cone of light: bright at the source, fading along its length and at its edges
function beamMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uAlpha: { value: 0 } },
    vertexShader:
      'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float edge = pow(abs(dot(vN, vV)), 1.6);
        float fall = pow(1.0 - vUv.y, 1.4);
        float a = edge * fall * uAlpha;
        gl_FragColor = vec4(uColor * a * 1.6, a);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

// northern lights: tall curtains with moving green/violet bands
function auroraMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } },
    vertexShader:
      'varying vec2 vUv; uniform float uTime; void main(){ vUv = uv; vec3 p = position; p.z += sin(p.x * 0.08 + uTime * 0.4) * 6.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }',
    fragmentShader: `uniform float uTime; uniform float uAlpha; varying vec2 vUv;
      void main(){
        float bands = sin(vUv.x * 40.0 + uTime * 0.8 + sin(vUv.x * 9.0 + uTime * 0.3) * 3.0) * 0.5 + 0.5;
        bands = pow(bands, 3.0);
        float v = smoothstep(0.0, 0.25, vUv.y) * pow(1.0 - vUv.y, 1.6);
        vec3 col = mix(vec3(0.2, 1.0, 0.6), vec3(0.6, 0.3, 1.0), vUv.y);
        float a = (0.35 + bands) * v * uAlpha * smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

export function createCelebration() {
  const group = new THREE.Group();

  // ------------------------------------------------ one big pool of glowing points
  const pos = new Float32Array(MAX * 3);
  const col = new Float32Array(MAX * 3);
  const alpha = new Float32Array(MAX);
  const size = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const tex = spriteTex();
  const makePointsMat = (gain) =>
    new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex }, uScale: { value: 1 }, uGain: { value: gain } },
      vertexShader: `
        attribute vec3 color; attribute float alpha; attribute float size;
        varying vec3 vC; varying float vA;
        uniform float uScale;
        void main(){
          vC = color; vA = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / max(0.5, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uTex; uniform float uGain; varying vec3 vC; varying float vA;
        void main(){
          float a = texture2D(uTex, gl_PointCoord).a * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vC * 2.6 * a * uGain, a * uGain);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  const mat = makePointsMat(1);
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  group.add(points);
  // Venice: the same sparks mirrored in the lagoon
  const mirrorMat = makePointsMat(0.35);
  const mirror = new THREE.Points(geo, mirrorMat);
  mirror.frustumCulled = false;
  mirror.scale.y = -1;
  mirror.position.y = WATER_Y * 2;
  mirror.visible = false;
  group.add(mirror);

  const P = Array.from({ length: MAX }, () => ({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, drag: 1, g: 1, s: 1, kind: 0, trail: 0, burst: 1, twinkle: 0, theme: null }));
  let cursor = 0;
  const tmp = new THREE.Color();
  const spawn = (x, y, z, vx, vy, vz, c, life, sz, o = {}) => {
    const i = cursor;
    cursor = (cursor + 1) % MAX;
    const p = P[i];
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.life = p.max = life;
    p.s = sz;
    p.drag = o.drag ?? 1.6;
    p.g = o.g ?? 5.5;
    p.kind = o.kind ?? 0; // 0 spark, 1 rocket, 2 crossette star
    p.trail = o.trail ?? 0;
    p.burst = o.burst ?? 1;
    p.twinkle = o.twinkle ?? 0;
    p.theme = o.theme ?? null;
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    return p;
  };

  // ------------------------------------------------ firework shapes
  function explode(x, y, z, theme, scale = 1) {
    sfx.pop(scale);
    const pal = pick(theme.pal);
    const kind = pick(theme.kinds);
    spawn(x, y, z, 0, 0, 0, tmp.set('#fff4dc'), 0.1, 1.1 * scale, { g: 0, drag: 0 });
    if (kind === 'star') {
      // a five-pointed star of light, for the astronomers of Baghdad
      const n = 160;
      const tilt = rand(0, Math.PI);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const r = 0.55 + 0.45 * Math.abs(Math.cos((a * 5) / 2));
        const sp = 7 * r * scale;
        tmp.set(pal[k % pal.length]);
        spawn(x, y, z, Math.cos(a) * sp, Math.sin(a) * sp * Math.cos(tilt), Math.sin(a) * sp * Math.sin(tilt), tmp, rand(1.4, 1.9), 0.42 * scale, { drag: 2, g: 2.5, twinkle: 1 });
      }
      return;
    }
    const n = kind === 'ring' ? 110 : Math.round(rand(140, 200));
    const speed = rand(7, 10) * scale * (kind === 'willow' ? 0.7 : 1);
    const tilt = rand(-0.6, 0.6);
    for (let k = 0; k < n; k++) {
      let dx;
      let dy;
      let dz;
      if (kind === 'ring') {
        const a = (k / n) * Math.PI * 2;
        dx = Math.cos(a);
        dy = Math.sin(a) * Math.sin(tilt);
        dz = Math.sin(a) * Math.cos(tilt);
      } else {
        // an even sphere of stars
        const t = (k + 0.5) / n;
        const inc = Math.acos(1 - 2 * t);
        const az = Math.PI * (1 + Math.sqrt(5)) * k;
        dx = Math.sin(inc) * Math.cos(az);
        dy = Math.cos(inc);
        dz = Math.sin(inc) * Math.sin(az);
      }
      const sp = speed * rand(0.88, 1.04);
      tmp.set(kind === 'willow' ? '#ffcf6b' : pal[k % pal.length]);
      spawn(x, y, z, dx * sp, dy * sp, dz * sp, tmp, kind === 'willow' ? rand(2.4, 3.2) : rand(1.3, 1.9), (kind === 'willow' ? 0.42 : 0.5) * scale, {
        drag: kind === 'willow' ? 1.1 : 1.9,
        g: kind === 'willow' ? 3.2 : 4.5,
        trail: kind === 'willow' ? 0.5 : Math.random() < 0.3 ? 0.25 : 0,
        kind: kind === 'crossette' && k % 9 === 0 ? 2 : 0,
        twinkle: kind === 'peony' && Math.random() < 0.3 ? 1 : 0,
      });
    }
  }

  function launch(at, theme, scale) {
    const x = at.x + rand(-10, 10);
    const z = at.z + rand(-8, 8);
    const top = at.y + rand(5, 11);
    // speed needed to coast up to `top` under gravity (with a little drag)
    const vy = Math.sqrt(2 * 9 * (top - at.y + 1)) * 1.05;
    sfx.launch();
    spawn(x, at.y - 2, z, rand(-1, 1), vy, rand(-1, 1), tmp.set('#ffe2a8'), 3, 0.42 * scale, { kind: 1, g: 9, drag: 0.15, trail: 1, burst: scale, theme });
  }

  // ------------------------------------------------ lanterns
  const LN = 70;
  const lanternGeo = new THREE.CylinderGeometry(0.22, 0.17, 0.45, 10, 1, true);
  const lanternMat = new THREE.MeshStandardMaterial({ color: '#ffb35c', emissive: '#ff8a2a', emissiveIntensity: 2.4, roughness: 0.6, side: THREE.DoubleSide });
  const lanterns = new THREE.InstancedMesh(lanternGeo, lanternMat, LN);
  lanterns.frustumCulled = false;
  lanterns.count = 0;
  group.add(lanterns);
  const L = Array.from({ length: LN }, () => ({ x: 0, y: -999, z: 0, vy: 0, ph: Math.random() * 6, t: 0 }));
  const dummy = new THREE.Object3D();

  // ------------------------------------------------ searchlights (Samarkand) and the lighthouse (Bukhara)
  const beamGeo = new THREE.CylinderGeometry(2.6, 0.18, 40, 24, 1, true);
  beamGeo.translate(0, 20, 0);
  // uv.y runs from the lamp (0) to the far end (1)
  const buv = beamGeo.attributes.uv;
  for (let i = 0; i < buv.count; i++) buv.setY(i, 1 - buv.getY(i));
  const beams = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(beamGeo, beamMaterial(i % 2 ? '#9ff3ff' : '#ffe2a8'));
    m.frustumCulled = false;
    m.visible = false;
    group.add(m);
    beams.push(m);
  }
  const lighthouse = new THREE.Mesh(beamGeo, beamMaterial('#ffd99a'));
  lighthouse.frustumCulled = false;
  lighthouse.visible = false;
  group.add(lighthouse);

  // ------------------------------------------------ aurora (Pamir)
  const auroraMat = auroraMaterial();
  const aurora = new THREE.Mesh(new THREE.PlaneGeometry(220, 40, 120, 1), auroraMat);
  aurora.frustumCulled = false;
  aurora.visible = false;
  group.add(aurora);

  let timer = 0;
  let lanternTimer = 0;
  let fxTimer = 0;
  let center = null;
  let power = 0;
  let theme = THEMES.changan;
  const fxOn = (name) => theme.fx.includes(name) && power > 0.5;

  return {
    group,
    // debug: burst a few shells right now over the current focus
    burstNow() {
      if (!center) return;
      for (let k = 0; k < 4; k++) explode(center.x + rand(-9, 9), center.y + rand(4, 9), center.z + rand(-6, 6), theme, 1);
    },
    // where to celebrate (a landmark anchor), how strongly (0..1) and in which city's style
    setFocus(anchor, strength, id) {
      center = anchor;
      power = strength;
      if (THEMES[id]) theme = THEMES[id];
    },
    update(dt, time, camera, night) {
      mat.uniforms.uScale.value = mirrorMat.uniforms.uScale.value = innerHeight * 0.55;
      const live = center && power > 0.5;

      if (live) {
        timer -= dt;
        if (timer <= 0) {
          launch(center, theme, 0.9 + night * 0.3);
          if (Math.random() < 0.35) launch(center, theme, 0.8);
          timer = rand(0.45, 1.1) / (0.6 + power * 0.6);
        }
        if (theme.lanterns) {
          lanternTimer -= dt;
          if (lanternTimer <= 0) {
            const l = L.find((q) => q.y < -100);
            if (l) {
              l.x = center.x + rand(-18, 18);
              l.z = center.z + rand(-14, 14);
              l.y = center.y - 3;
              l.vy = rand(0.9, 1.5);
              l.t = 0;
            }
            lanternTimer = rand(0.6, 1.4) * theme.lanternRate;
          }
        }
        // signature effects made of sparks
        fxTimer -= dt;
        if (fxTimer <= 0) {
          fxTimer = 0.03;
          const c = center;
          if (fxOn('apsara')) {
            // two spirals of light rising like the flying apsaras of the Mogao murals
            for (let s = 0; s < 2; s++) {
              const a = time * 1.6 + s * Math.PI;
              const h = (time * 2.2 + s * 3) % 14;
              spawn(c.x + Math.cos(a) * 6, c.y - 2 + h, c.z + Math.sin(a) * 6, -Math.sin(a) * 1.5, 0.8, Math.cos(a) * 1.5, tmp.set(s ? '#ffd27a' : '#9ff3ff'), 1.6, 0.36, { g: -0.3, drag: 0.8, twinkle: 1 });
            }
          }
          if (fxOn('dust')) {
            // sand devils: grains whirling up in loose columns
            for (let s = 0; s < 3; s++) {
              const bx = c.x + Math.sin(time * 0.2 + s * 2.1) * 14;
              const bz = c.z + Math.cos(time * 0.17 + s * 1.7) * 10;
              const a = rand(0, Math.PI * 2);
              const r = rand(0.3, 1.6);
              spawn(bx + Math.cos(a) * r, c.y - 4, bz + Math.sin(a) * r, -Math.sin(a) * 6, rand(3, 6), Math.cos(a) * 6, tmp.set(pick(['#e8c48a', '#d9a868', '#fff0cc'])), 2.2, 0.22, { g: 0.6, drag: 0.4 });
            }
          }
          if (fxOn('confetti')) {
            for (let s = 0; s < 3; s++) spawn(c.x + rand(-14, 14), c.y + rand(8, 14), c.z + rand(-10, 10), rand(-1, 1), rand(-0.5, 0.5), rand(-1, 1), tmp.set(pick(theme.pal[0])), 4, 0.3, { g: 1.2, drag: 2.5, twinkle: 1 });
          }
          if (fxOn('snow')) {
            for (let s = 0; s < 4; s++) spawn(c.x + rand(-30, 30), c.y + rand(12, 20), c.z + rand(-24, 24), rand(-0.4, 0.4), -1.2, rand(-0.4, 0.4), tmp.set('#eef6ff'), 9, 0.2, { g: 0.05, drag: 0.1 });
          }
          if (fxOn('stars')) {
            // a slowly turning ring of starlight around the Round City
            const a = time * 0.5 + rand(0, Math.PI * 2);
            spawn(c.x + Math.cos(a) * 16, c.y + 6 + Math.sin(a * 3) * 1.5, c.z + Math.sin(a) * 16, -Math.sin(a) * 2, 0, Math.cos(a) * 2, tmp.set(pick(['#ffffff', '#9fd4ff', '#ffd27a'])), 2.4, 0.34, { g: 0, drag: 0.2, twinkle: 1 });
          }
          if (fxOn('candles')) {
            spawn(c.x + rand(-12, 12), c.y + rand(-1, 4), c.z + rand(-10, 10), 0, rand(0.3, 0.7), 0, tmp.set('#ffb35c'), 4, 0.32, { g: 0, drag: 0.5, twinkle: 1 });
          }
        }
      }

      // simulate the sparks
      const decay = Math.exp(-dt);
      for (let i = 0; i < MAX; i++) {
        const p = P[i];
        if (p.life <= 0) {
          if (alpha[i] !== 0) alpha[i] = 0;
          continue;
        }
        p.life -= dt;
        const dk = Math.pow(decay, p.drag);
        p.vx *= dk;
        p.vy = p.vy * dk - p.g * dt;
        p.vz *= dk;
        pos[i * 3] += p.vx * dt;
        pos[i * 3 + 1] += p.vy * dt;
        pos[i * 3 + 2] += p.vz * dt;
        const k = Math.max(0, p.life / p.max);
        if (p.kind === 1) {
          alpha[i] = 1;
          size[i] = p.s * 0.6;
          // the rocket bursts at the top of its climb
          if (p.vy < 1.5) {
            p.life = 0;
            alpha[i] = 0;
            explode(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], p.theme || theme, p.burst);
            continue;
          }
        } else if (p.kind === 2 && p.life < p.max * 0.55) {
          // crossette: the star splits into four
          p.kind = 0;
          tmp.setRGB(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]);
          for (let s = 0; s < 4; s++) {
            const a = (s / 4) * Math.PI * 2;
            spawn(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], Math.cos(a) * 4, rand(-1, 2), Math.sin(a) * 4, tmp, 0.9, p.s * 0.8, { drag: 2, g: 4 });
          }
        } else {
          const tw = p.twinkle ? 0.55 + 0.45 * Math.sin(time * 30 + i * 1.7) : 1;
          alpha[i] = Math.pow(k, 1.2) * tw * Math.min(1, (p.max - p.life) * 6 + 0.3);
          size[i] = p.s * (0.45 + k * 0.55);
        }
        if (p.trail && Math.random() < p.trail) {
          tmp.setRGB(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]).multiplyScalar(0.7);
          spawn(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], p.vx * 0.05, p.vy * 0.05, p.vz * 0.05, tmp, 0.45, p.s * 0.5, { g: 1.5, drag: 3 });
        }
      }
      for (const name of ['position', 'alpha', 'size', 'color']) geo.attributes[name].needsUpdate = true;
      mirror.visible = !!live && fxOn('reflect');

      // lanterns drift up, sway and fade high in the sky
      let n = 0;
      for (const l of L) {
        if (l.y < -100) continue;
        l.t += dt;
        l.y += l.vy * dt;
        if (l.t > 24) {
          l.y = -999;
          continue;
        }
        dummy.position.set(l.x + Math.sin(time * 0.7 + l.ph) * 0.6, l.y, l.z + Math.cos(time * 0.5 + l.ph) * 0.4);
        dummy.rotation.set(Math.sin(time + l.ph) * 0.08, 0, Math.cos(time * 0.8 + l.ph) * 0.08);
        dummy.scale.setScalar(Math.min(1, l.t * 2) * (1 - Math.max(0, l.t - 20) / 4));
        dummy.updateMatrix();
        lanterns.setMatrixAt(n++, dummy.matrix);
      }
      lanterns.count = n;
      lanterns.instanceMatrix.needsUpdate = true;
      if (theme.lanterns) {
        lanternMat.color.set(theme.lanterns);
        lanternMat.emissive.set(theme.lanterns);
      }
      lanternMat.emissiveIntensity = 1.2 + night * 2.4;

      // light effects fade in and out with the visit
      const glow = live ? Math.min(1, (power - 0.5) * 2) : 0;
      const beamA = fxOn('beams') ? glow * (0.25 + night * 0.5) : 0;
      beams.forEach((m, i) => {
        m.visible = beamA > 0.01;
        if (!m.visible) return;
        m.material.uniforms.uAlpha.value = beamA;
        const side = i < 2 ? -1 : 1;
        m.position.set(center.x + side * (6 + (i % 2) * 4), center.y - 3, center.z + (i % 2 ? 4 : -4));
        m.rotation.set(Math.sin(time * 0.5 + i) * 0.35, 0, side * (0.25 + Math.sin(time * 0.4 + i * 1.3) * 0.2));
      });
      const lhA = fxOn('lighthouse') ? glow * (0.35 + night * 0.6) : 0;
      lighthouse.visible = lhA > 0.01;
      if (lighthouse.visible) {
        lighthouse.material.uniforms.uAlpha.value = lhA;
        // the Kalyan minaret was the caravans' lighthouse: a beam sweeping the desert
        lighthouse.position.set(center.x, center.y + 9, center.z);
        lighthouse.rotation.set(0, time * 0.7, Math.PI / 2 - 0.12, 'YXZ');
      }
      const auA = fxOn('aurora') ? glow * (0.4 + night * 0.8) : 0;
      aurora.visible = auA > 0.01;
      if (aurora.visible) {
        auroraMat.uniforms.uAlpha.value = auA;
        auroraMat.uniforms.uTime.value = time;
        // hang the curtains in the sky behind the landmark, as seen from the camera
        const dx = center.x - camera.position.x;
        const dz = center.z - camera.position.z;
        const d = Math.hypot(dx, dz) || 1;
        aurora.position.set(center.x + (dx / d) * 70, center.y + 26, center.z + (dz / d) * 70);
        aurora.lookAt(camera.position.x, aurora.position.y, camera.position.z);
      }
    },
  };
}
