// A small turntable for the camel model in the "hardware review" section.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export function createCamelViewer(wrap) {
  const canvas = wrap.querySelector('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 1.6, 7.2);
  camera.lookAt(0, 1.05, 0);

  scene.add(new THREE.HemisphereLight('#ffe7d1', '#3a2516', 1.1));
  const key = new THREE.DirectionalLight('#ffd4ab', 3.2);
  key.position.set(3, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(1024);
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#c8102e', 2.2);
  rim.position.set(-4, 2, -4);
  scene.add(rim);

  // soft round shadow catcher
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2.6, 64), new THREE.ShadowMaterial({ opacity: 0.35 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const turn = new THREE.Group();
  scene.add(turn);
  let mixer = null;

  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load('models/camel.glb', (g) => {
    const model = g.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const k = 3.4 / Math.max(size.x, size.z);
    model.scale.setScalar(k);
    model.position.set(-((box.min.x + box.max.x) / 2) * k, -box.min.y * k, -((box.min.z + box.max.z) / 2) * k);
    model.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
    turn.add(model);
    if (g.animations.length) {
      mixer = new THREE.AnimationMixer(model);
      mixer.clipAction(g.animations[0]).play();
    }
    wrap.classList.add('loaded');
  });

  // drag to turn, otherwise a slow auto-spin
  let angle = 0.6;
  let vel = 0.25;
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = e.clientX;
    canvas.setPointerCapture(e.pointerId);
    wrap.classList.add('touched');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (drag === null) return;
    const dx = e.clientX - drag;
    drag = e.clientX;
    angle += dx * 0.01;
    vel = dx * 0.6;
  });
  const up = () => (drag = null);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  let visible = false;
  new IntersectionObserver((e) => (visible = e[0].isIntersecting)).observe(wrap);

  function resize() {
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', resize);

  return {
    update(dt) {
      if (!visible) return;
      if (drag === null) {
        vel += (0.25 - vel) * (1 - Math.exp(-dt * 1.5));
        angle += vel * dt;
      }
      turn.rotation.y = angle;
      if (mixer) mixer.update(dt);
      renderer.render(scene, camera);
    },
  };
}
