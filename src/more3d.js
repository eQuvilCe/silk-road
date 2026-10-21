// The living background of the long page: wind-drawn sand contours (as if you were
// looking down on dunes) that slowly flow, speed up when you scroll, ripple around
// the cursor and take their colour from the section underneath. Fine dust drifts on top.
import * as THREE from 'three';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export function createMore3D(canvasEl) {
  const small = matchMedia('(max-width: 760px)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: false, alpha: true, premultipliedAlpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.25 : 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const U = {
    uTime: { value: 0 },
    uFlow: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uRipple: { value: 0 },
    uInk: { value: new THREE.Color('#8a5a22') },
    uAlpha: { value: 0.22 },
  };
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: U,
      transparent: true,
      depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        precision highp float;
        uniform float uTime; uniform float uFlow; uniform vec2 uRes; uniform vec2 uMouse; uniform float uRipple;
        uniform vec3 uInk; uniform float uAlpha;
        varying vec2 vUv;
        vec2 hash(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return -1.0 + 2.0 * fract(sin(p) * 43758.5453); }
        float noise(vec2 p){
          vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(dot(hash(i), f), dot(hash(i + vec2(1, 0)), f - vec2(1, 0)), u.x),
                     mix(dot(hash(i + vec2(0, 1)), f - vec2(0, 1)), dot(hash(i + vec2(1, 1)), f - vec2(1, 1)), u.x), u.y);
        }
        float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int k = 0; k < 4; k++){ s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
        void main(){
          vec2 asp = vec2(uRes.x / uRes.y, 1.0);
          vec2 p = vUv * asp * 2.2;
          float t = uTime * 0.05 + uFlow;
          // a height field of dunes, gently warped by the wind
          vec2 w = vec2(fbm(p * 0.7 + vec2(t, -t * 0.6)), fbm(p * 0.7 + vec2(-t * 0.4, t) + 4.1));
          float h = fbm(p + w * 1.4 + vec2(t * 0.6, 0.0));
          // the cursor drops a ring into the sand
          vec2 m = uMouse * asp * 2.2;
          float d = distance(p, m);
          h += sin(d * 16.0 - uTime * 3.0) * exp(-d * 2.6) * 0.05 * uRipple;
          // contour lines with a constant on-screen width
          float lv = h * 22.0;
          float f = abs(fract(lv) - 0.5);
          float line = 1.0 - smoothstep(0.0, fwidth(lv) * 1.3, f);
          float major = 1.0 - smoothstep(0.0, fwidth(lv / 5.0) * 1.3, abs(fract(lv / 5.0) - 0.5));
          float a = (line * 0.55 + major * 0.6) * uAlpha;
          // fade at the very top and bottom so it never fights the text edges
          a *= smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
          gl_FragColor = vec4(uInk, a);
        }`,
    })
  );
  scene.add(quad);

  // ---- drifting dust
  const N = small ? 140 : 280;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = Math.random() * 2 - 1;
    pos[i * 3 + 1] = Math.random() * 2 - 1;
    seed[i] = Math.random();
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const DU = { uTime: U.uTime, uFlow: U.uFlow, uInk: U.uInk, uPx: { value: 1 } };
  const dust = new THREE.Points(
    dustGeo,
    new THREE.ShaderMaterial({
      uniforms: DU,
      transparent: true,
      depthWrite: false,
      vertexShader: `attribute float aSeed; uniform float uTime; uniform float uFlow; uniform float uPx; varying float vA;
        void main(){
          vec2 p = position.xy;
          // drift with the wind, wrap around the screen
          p.x = mod(p.x + 1.0 + uTime * (0.01 + aSeed * 0.02) + uFlow * (0.3 + aSeed), 2.0) - 1.0;
          p.y = mod(p.y + 1.0 + sin(uTime * 0.3 + aSeed * 20.0) * 0.02 - uFlow * 0.6 * aSeed, 2.0) - 1.0;
          vA = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(uTime * (1.0 + aSeed * 2.0) + aSeed * 30.0), 2.0);
          gl_PointSize = (1.2 + aSeed * aSeed * 3.5) * uPx;
          gl_Position = vec4(p, 0.0, 1.0);
        }`,
      fragmentShader: `uniform vec3 uInk; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d) * vA * 0.55; if (a < 0.01) discard; gl_FragColor = vec4(uInk, a); }`,
    })
  );
  dust.frustumCulled = false;
  scene.add(dust);

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    U.uRes.value.set(innerWidth, innerHeight);
    DU.uPx.value = renderer.getPixelRatio();
  }
  resize();
  addEventListener('resize', resize);

  const target = new THREE.Vector2(0.5, 0.5);
  let hover = 0;
  addEventListener('pointermove', (e) => {
    target.set(e.clientX / innerWidth, 1 - e.clientY / innerHeight);
    hover = 1;
  });

  // ink colour follows the section under the middle of the screen (gold on dark, umber on light)
  const sections = [...document.querySelectorAll('#more > section, #more > .m-marquee')];
  const ink = new THREE.Color();
  const DARK = new THREE.Color('#e0b25c');
  const LIGHT = new THREE.Color('#8a5a22');
  let darkness = 0;
  let lastScroll = scrollY;
  let speed = 0;

  return {
    update(dt, t, active) {
      canvasEl.style.opacity = active.toFixed(3);
      if (active <= 0.001) return;
      const ds = scrollY - lastScroll;
      lastScroll = scrollY;
      // scrolling is wind: the sand flows faster, then settles
      speed = damp(speed, clamp(ds / 30, -3, 3), 3, dt);
      U.uFlow.value += speed * dt * 0.35;
      U.uTime.value = t;
      U.uMouse.value.lerp(target, 1 - Math.exp(-dt * 6));
      hover = Math.max(0, hover - dt * 0.6);
      U.uRipple.value = damp(U.uRipple.value, hover, 4, dt);

      let dark = 0;
      for (const s of sections) {
        const r = s.getBoundingClientRect();
        if (r.top < innerHeight * 0.5 && r.bottom > innerHeight * 0.5) {
          dark = s.classList.contains('m-dark') || s.classList.contains('m-break') || s.classList.contains('m-mq-dark') ? 1 : 0;
          break;
        }
      }
      darkness = damp(darkness, dark, 4, dt);
      ink.copy(LIGHT).lerp(DARK, darkness);
      U.uInk.value.copy(ink);
      U.uAlpha.value = 0.14 + darkness * 0.08 + Math.min(0.12, Math.abs(speed) * 0.04);
      renderer.render(scene, camera);
    },
  };
}
