import * as THREE from 'three';
import './style.css';
import './more.css';
import { CITIES, CAMELS } from './data.js';
import {
  createTerrain,
  createWater,
  createRoute,
  createSilkThread,
  createGhostRoute,
  createStars,
  createDust,
  heightAt,
} from './world.js';
import { createCaravan } from './caravan.js';
import { createFlora } from './flora.js';
import { createBirds } from './birds.js';
import { createCelebration } from './celebrate.js';
import { sfx } from './sound.js';
import { createLandmarks, nightLights } from './landmarks.js';
import { sampleAtmosphere } from './atmosphere.js';
import { clamp, lerp, smoothstep } from './noise.js';
import { buildUI } from './ui.js';
import { buildMore } from './more.js';
import { createSky } from './sky.js';
import { createTitles } from './text3d.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import Lenis from 'lenis';
import { translateDOM, translateData, mountSwitcher, t } from './i18n.js';

// ---------------------------------------------------------------- renderer
// language first: the page text is swapped before any animation splits it into letters
translateDOM();
translateData(CITIES, ['name', 'sub', 'fact', 'cargo', 'landmark', 'built', 'story']);
translateData(CAMELS, ['line']);
mountSwitcher(document.querySelector('.m-right'));
document.documentElement.style.setProperty('--t-open-story', JSON.stringify(t('Open the story →')));
document.documentElement.style.setProperty('--t-loading-camel', JSON.stringify(t('Loading camel…')));

const canvas = document.querySelector('#scene');
const isSmall = matchMedia('(max-width: 760px)').matches;
// light mode for phones and modest hardware (or ?lite in the address): fewer, cheaper effects
const lite =
  isSmall ||
  /[?&]lite\b/.test(location.search) ||
  (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
  (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
document.documentElement.classList.toggle('lite', !!lite);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, lite ? 1.25 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#efcfae', 60, 320);

const camera = new THREE.PerspectiveCamera(isSmall ? 50 : 37, innerWidth / innerHeight, 0.3, 1600);

const hemi = new THREE.HemisphereLight('#ffe7d1', '#7a5a44', 0.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffd4ab', 2.4);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(lite ? 2048 : 4096);
sun.shadow.camera.left = -42;
sun.shadow.camera.right = 42;
sun.shadow.camera.top = 42;
sun.shadow.camera.bottom = -42;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 300;
sun.shadow.bias = -0.0004;
sun.shadow.radius = 3;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

const sky = createSky(renderer);
scene.add(sky.dome);

// ---------------------------------------------------------------- post
const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(devicePixelRatio, lite ? 1 : 1.5));
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
let gtao = null;
if (!lite) {
  gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  gtao.updateGtaoMaterial({ radius: 0.8, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  gtao.blendIntensity = 0.85;
  composer.addPass(gtao);
}
// depth of field: the caravan stays sharp, near/far scenery melts into bokeh
const bokeh = new BokehPass(scene, camera, { focus: 14, aperture: 0.00009, maxblur: 0.006 });
if (!lite) composer.addPass(bokeh);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.5, 0.96);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// final grade: filmic contrast, warm/cool split, vignette and speed-driven chromatic aberration
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uAber: { value: 0 }, uTime: { value: 0 }, uWarm: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uAber; uniform float uTime; uniform float uWarm;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * (0.0006 + uAber) * (0.4 + r2 * 3.0);
      vec3 col = vec3(
        texture2D(tDiffuse, vUv + off).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - off).b);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 0.92);                         // a touch more saturation
      col = (col - 0.5) * 1.07 + 0.5;                        // contrast
      col *= mix(vec3(0.97, 0.98, 1.04), vec3(1.05, 1.0, 0.94), smoothstep(0.1, 0.8, l) * (0.6 + uWarm * 0.4));
      col *= 1.0 - smoothstep(0.25, 0.85, r2 * 2.2) * 0.38;  // vignette
      col += (h(vUv * 1400.0 + uTime) - 0.5) * 0.02;          // grain
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(grade);

// ---------------------------------------------------------------- world
const terrain = createTerrain({ hi: !lite });
const water = createWater();
const route = createRoute();
const silk = createSilkThread(route);
const ghost = createGhostRoute(route);
const stars = createStars();
const dust = createDust();
const caravan = createCaravan(route);
const { group: landmarks, anchors } = createLandmarks();
const flora = createFlora({ hi: !lite });
const birds = createBirds(lite ? 18 : 36);
scene.add(birds.mesh);
const party = createCelebration();
window.__party = party;
scene.add(party.group);
scene.add(terrain, water, silk.group, ghost, stars, dust.points, caravan.group, landmarks, flora.group);

// where each city sits along the route (0..1)
const samples = route.getSpacedPoints(3000);
CITIES.forEach((c) => {
  let best = Infinity;
  let bi = 0;
  samples.forEach((s, i) => {
    const d = (s.x - c.x) ** 2 + (s.z - c.z) ** 2;
    if (d < best) {
      best = d;
      bi = i;
    }
  });
  c.t = bi / (samples.length - 1);
});

// ---------------------------------------------------------------- pacing
// Scroll is split into equal slots per city. The caravan slows down
// ("dwells") at each city, then travels to the next one.
export const P0 = 0.06;
export const P1 = 0.9;
const SLOT = (P1 - P0) / CITIES.length;
const DWELL = 0.006;
CITIES.forEach((c, i) => (c.p = P0 + (i + 0.5) * SLOT));

const PACE = [[0, 0], [P0, 0]];
CITIES.forEach((c) => {
  PACE.push([c.p - SLOT * 0.22, Math.max(0, c.t - DWELL)]);
  PACE.push([c.p + SLOT * 0.22, Math.min(1, c.t + DWELL)]);
});
PACE.push([P1, 1], [1, 1]);

function routeT(p) {
  for (let i = 0; i < PACE.length - 1; i++) {
    const [p0, t0] = PACE[i];
    const [p1, t1] = PACE[i + 1];
    if (p >= p0 && p <= p1) {
      let k = p1 === p0 ? 0 : (p - p0) / (p1 - p0);
      // ease in/out of each travel segment, linear while dwelling
      if (i % 2 === 1) k = k * k * (3 - 2 * k);
      return lerp(t0, t1, k);
    }
  }
  return 1;
}

function kmAt(t) {
  if (t <= CITIES[0].t) return 0;
  for (let i = 0; i < CITIES.length - 1; i++) {
    const a = CITIES[i];
    const b = CITIES[i + 1];
    if (t <= b.t) return lerp(a.km, b.km, (t - a.t) / (b.t - a.t));
  }
  return CITIES.at(-1).km;
}

// ---------------------------------------------------------------- UI
// the 3D journey owns the scroll up to the end of .scroll-space; the long page follows it
const scrollSpace = document.querySelector('.scroll-space');
const journeyMax = () => Math.max(1, scrollSpace.offsetTop + scrollSpace.offsetHeight - innerHeight);
window.__journeyMax = journeyMax;
const ui = buildUI({ cities: CITIES, P0, P1, SLOT });

// ---------------------------------------------------------------- input
let targetP = 0;
let p = 0;
const mouse = new THREE.Vector2();
const parallax = new THREE.Vector2();

function readScroll() {
  targetP = clamp(scrollY / journeyMax());
}
const lenis = new Lenis({ lerp: 0.075, wheelMultiplier: 0.85, smoothWheel: true });
window.__lenis = lenis;
const more = buildMore({ cities: CITIES, scrollToTop: () => lenis.scrollTo(0, { duration: 3 }) });
addEventListener('scroll', readScroll, { passive: true });
readScroll();
p = targetP;

addEventListener('pointermove', (e) => {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  ui.moveCursor(e.clientX, e.clientY);
  hoverDirty = true;
});

// camels are clickable
const raycaster = new THREE.Raycaster();
let hoverDirty = false;
let hovered = -1;
function pickCamel() {
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObjects(caravan.pickables, false)[0];
  return hit ? hit.object.userData.camel : -1;
}
canvas.addEventListener('click', (e) => {
  const i = pickCamel();
  if (i >= 0) ui.showCamel(CAMELS[i], i, e.clientX, e.clientY);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  readScroll();
});

// ---------------------------------------------------------------- camera
const INTRO_POS = new THREE.Vector3(338, 34, 34);
const INTRO_LOOK = new THREE.Vector3(250, 2, -6);
const OUTRO_POS = new THREE.Vector3(30, 360, 250);
const OUTRO_LOOK = new THREE.Vector3(22, 0, 0);

const camPos = new THREE.Vector3().copy(INTRO_POS);
const camLook = new THREE.Vector3().copy(INTRO_LOOK);
const tPos = new THREE.Vector3();
const tLook = new THREE.Vector3();
const tangent = new THREE.Vector3();
const normal = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const head = new THREE.Vector3();
const tmp = new THREE.Vector3();

function cameraTarget(p, t, atSea = 0) {
  route.getPointAt(clamp(t, 0, 0.999), head);
  route.getTangentAt(clamp(t, 0, 0.999), tangent);
  tangent.y = 0;
  tangent.normalize();
  normal.crossVectors(tangent, UP).normalize();

  let dist = 14.5 + atSea * 9;
  let height = 4.6 + atSea * 5;
  let side = 3.5 + atSea * 6;
  tLook.copy(head).addScaledVector(tangent, 6).add(tmp.set(0, 1.4, 0));

  // frame the landmark of the nearest city
  for (const c of CITIES) {
    const w = smoothstep(SLOT * 0.55, SLOT * 0.12, Math.abs(p - c.p));
    if (w <= 0) continue;
    dist += 9 * w;
    height += (c.id === 'pamir' ? 9 : 5) * w;
    side += 11 * w * c.side;
    tLook.lerp(anchors[c.id], 0.42 * w);
  }
  tPos.copy(head).addScaledVector(tangent, -dist).addScaledVector(UP, height).addScaledVector(normal, side);

  // intro: establishing shot over Chang'an
  const ki = smoothstep(P0 + 0.03, 0.0, p);
  tPos.lerp(INTRO_POS, ki);
  tLook.lerp(INTRO_LOOK, ki);

  // outro: rise up to see the whole thread
  const ko = smoothstep(P1 - 0.01, 0.985, p);
  const e = ko * ko * (3 - 2 * ko);
  tPos.lerp(OUTRO_POS, e);
  tLook.lerp(OUTRO_LOOK, e);
}

// ---------------------------------------------------------------- 3D titles
let titles = null;
const introDir = INTRO_LOOK.clone().sub(INTRO_POS).normalize();
const introAnchor = INTRO_POS.clone().addScaledVector(introDir, 58);
createTitles({
  cities: CITIES,
  introAnchor,
  introFacing: INTRO_POS,
  frameAt(cp) {
    cameraTarget(cp, routeT(cp), 0);
    return { pos: tPos.clone(), look: tLook.clone() };
  },
})
  .then((t) => {
    titles = t;
    scene.add(t.group);
  })
  .catch((err) => console.warn('3D titles unavailable:', err));
const cityVis = CITIES.map(() => 0);

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let prevT = 0;
let firstFrame = true;
const sunDir = new THREE.Vector3();
const groundTint = new THREE.Color();
let bakedP = -1;
let velSmooth = 0;
let tRide = 0;
let sceneHidden = false;
let degraded = !!lite;
let fpsT = 0;
let fpsN = 0;
let vRide = 0;

function frame(now) {
  lenis.raf(now);
  step(Math.min(clock.getDelta(), 0.05));
  requestAnimationFrame(frame);
}

// debug helper: jump straight to a point of the journey
window.__jump = (v) => {
  targetP = p = v;
  firstFrame = true;
  for (let i = 0; i < 3; i++) step(0.016);
};

function step(dt) {
  const time = clock.elapsedTime;

  p = lerp(p, targetP, 1 - Math.exp(-dt * 3.2));
  if (Math.abs(p - targetP) < 1e-5) p = targetP;
  // the caravan rides a critically damped spring towards the scroll position:
  // it eases into motion and settles instead of jerking with every wheel tick
  const goal = routeT(p);
  if (firstFrame) {
    tRide = goal;
    vRide = 0;
  } else {
    const k = 2.6;
    vRide += (k * k * (goal - tRide) - 2 * k * vRide) * dt;
    vRide = clamp(vRide, -0.12, 0.12);
    tRide += vRide * dt;
  }
  const t = tRide;
  const speed = t - prevT;
  prevT = t;

  // caravan + thread
  const atSea = caravan.update(t, speed, time);
  silk.setProgress(t - 1.5 / route.getLength());

  // atmosphere
  const a = sampleAtmosphere(p);
  scene.fog.color.copy(a.sky);
  const outro = smoothstep(P1, 1, p);
  scene.fog.near = lerp(60, 420, outro);
  scene.fog.far = lerp(320, 1300, outro);
  hemi.color.copy(a.hs);
  hemi.groundColor.copy(a.hg);
  hemi.intensity = 0.35 + a.si * 0.08;
  sun.color.copy(a.sun);
  sun.intensity = a.si;
  sunDir.set(lerp(0.6, -1, clamp(p * 1.1)), Math.sin(a.el * 1.3) + 0.08, 0.45).normalize();
  groundTint.copy(a.hg).multiplyScalar(0.8);
  sky.set({ zenith: a.zen, horizon: a.sky, ground: groundTint, sunDir, sunColor: a.sun, sunAmount: clamp(a.si / 3) * (1 - a.ink * 0.85) });
  if (firstFrame || Math.abs(p - bakedP) > 0.006) {
    sky.bakeEnvironment(scene);
    bakedP = p;
  }
  scene.environmentIntensity = lerp(0.9, 0.45, a.ink);
  water.userData.update(time);
  flora.update(time);
  birds.update(dt, time, caravan.head, 1 - smoothstep(0.3, 0.8, a.ink));
  sun.position.copy(caravan.head).addScaledVector(sunDir, 80);
  sun.target.position.copy(caravan.head);
  stars.material.opacity = a.stars;
  silk.setGlow(0.08 + a.ink * 0.55, outro);
  ghost.material.opacity = lerp(0.45, 0.25, a.ink);
  ghost.material.color.setRGB(lerp(0.23, 0.9, a.ink), lerp(0.14, 0.85, a.ink), lerp(0.08, 0.75, a.ink));
  for (const mat of nightLights) mat.emissiveIntensity = smoothstep(0.1, 0.8, a.ink) * 2.4;
  dust.update(dt, caravan.head, a.dust);

  // camera
  cameraTarget(p, t, atSea);
  parallax.lerp(mouse, 1 - Math.exp(-dt * 3));
  tPos.addScaledVector(normal, parallax.x * 2.2);
  tPos.y += parallax.y * 1.4;
  // never let the camera dig into a hill
  const ground = heightAt(tPos.x, tPos.z).h;
  tPos.y = Math.max(tPos.y, ground + 3.2);
  const follow = firstFrame ? 1 : 1 - Math.exp(-dt * 5);
  camPos.lerp(tPos, follow);
  camPos.y = Math.max(camPos.y, heightAt(camPos.x, camPos.z).h + 2.6);
  camLook.lerp(tLook, follow);
  camera.position.copy(camPos);
  camera.lookAt(camLook);

  // cinematic response to motion: FOV breathes with speed, camera banks into turns
  const vel = clamp(Math.abs(speed) * 900);
  velSmooth = lerp(velSmooth, vel, 1 - Math.exp(-dt * 3));
  const baseFov = isSmall ? 50 : 37;
  const fov = baseFov + velSmooth * 9 - smoothstep(P1 - 0.01, 0.985, p) * 6;
  if (Math.abs(fov - camera.fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  const bank = THREE.MathUtils.clamp(-parallax.x * 0.035 - tangent.z * 0.015, -0.08, 0.08);
  camera.rotateZ(bank * (0.4 + velSmooth));

  // focus on the caravan; bigger blur when close to a landmark close-up
  const focusDist = camera.position.distanceTo(caravan.head);
  bokeh.uniforms.focus.value = lerp(bokeh.uniforms.focus.value, focusDist, 1 - Math.exp(-dt * 4));
  bokeh.uniforms.aperture.value = 0.00007 + velSmooth * 0.00008;
  grade.uniforms.uAber.value = velSmooth * 0.004;
  grade.uniforms.uTime.value = time % 10;
  grade.uniforms.uWarm.value = 1 - a.ink;
  sky.dome.position.copy(camera.position);

  // 3D words rise out of the ground near each city
  CITIES.forEach((c, i) => {
    const d = Math.abs(p - c.p);
    cityVis[i] = clamp(1 - (d - SLOT * 0.26) / (SLOT * 0.2));
  });
  if (titles) titles.update(cityVis, 1 - smoothstep(0.002, P0 * 0.8, p));

  // fireworks and sky lanterns over the landmark the caravan has reached
  let best = -1;
  cityVis.forEach((v, i) => {
    if (best < 0 || v > cityVis[best]) best = i;
  });
  party.setFocus(anchors[CITIES[best].id], cityVis[best], CITIES[best].id);
  party.update(dt, time, camera, a.ink);

  // hover state for camels (only when the mouse moved)
  if (hoverDirty) {
    hoverDirty = false;
    hovered = pickCamel();
    canvas.style.cursor = hovered >= 0 ? 'pointer' : '';
    ui.hoverCamel(hovered >= 0);
  }

  ui.update({ p, t, km: kmAt(t), ink: a.ink });

  sfx.tick(more.covers() ? 0 : velSmooth, time);
  more.update(dt);
  // once the long page covers the scene there is nothing to draw (or composite)
  const covered = !firstFrame && more.covers();
  if (covered !== sceneHidden) {
    sceneHidden = covered;
    canvas.style.visibility = covered ? 'hidden' : '';
  }
  if (!covered) {
    composer.render(dt);
    // if frames come slowly, quietly drop the costliest effects (once)
    if (!degraded) {
      fpsT += dt;
      fpsN++;
      if (fpsT > 4) {
        if (fpsN / fpsT < 40) {
          degraded = true;
          if (gtao) gtao.enabled = false;
          bokeh.enabled = false;
          composer.setPixelRatio(1);
          renderer.setPixelRatio(1);
        }
        fpsT = fpsN = 0;
      }
    }
  }
  if (firstFrame) {
    firstFrame = false;
    ui.ready();
  }
}
requestAnimationFrame(frame);
