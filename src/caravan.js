import * as THREE from 'three';
import { CAMELS } from './data.js';
import { seaMask, WATER_Y } from './world.js';
import { clamp } from './noise.js';
import { loftMesh } from './organic.js';
import { makeFurNormal } from './textures.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { camelGait, horseGait } from './gait.js';

const TAU = Math.PI * 2;

const mats = {};
const mat = (color, extra = {}) =>
  (mats[color + JSON.stringify(extra)] ||= new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    ...extra,
  }));

// animal hide with a fine procedural grain
let furNormal = null;
const hide = (color, roughness = 0.9) => {
  furNormal ||= makeFurNormal();
  return (mats['hide' + color + roughness] ||= new THREE.MeshStandardMaterial({
    color,
    roughness,
    normalMap: furNormal,
    normalScale: new THREE.Vector2(0.55, 0.55),
  }));
};

function capsule(r, len, m, seg = 14) {
  return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, seg), m);
}
function sphere(r, m) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), m);
}
// cylinder hanging down from its top end
function limb(rTop, rBot, len, m) {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, 12);
  g.translate(0, -len / 2, 0);
  return new THREE.Mesh(g, m);
}
// cylinder growing up from its bottom end
function stalk(rTop, rBot, len, m) {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, 12);
  g.translate(0, len / 2, 0);
  return new THREE.Mesh(g, m);
}

// Two-segment leg with a knee. Returns the hip pivot.
function makeLeg(x, y, z, upper, lower, rU, rL, coat, hoofMat, foot) {
  const hip = new THREE.Group();
  hip.position.set(x, y, z);
  hip.add(loftMesh([[0, 0.06, 0, rU * 1.5], [0, -upper * 0.4, 0, rU * 1.05], [0, -upper, 0, rU * 0.7]], coat, { radial: 12, rings: 10, caps: 4 }));
  const knee = new THREE.Group();
  knee.position.y = -upper;
  hip.add(knee);
  knee.add(loftMesh([[0, 0.02, 0, rL * 1.3], [0, -lower * 0.3, 0, rL * 0.8], [0, -lower * 0.88, 0, rL * 0.62], [0, -lower, 0, rL * 0.85]], coat, { radial: 10, rings: 10, caps: 4 }));
  const hoof = new THREE.Mesh(foot, hoofMat);
  hoof.position.y = -lower;
  knee.add(hoof);
  hip.userData.knee = knee;
  return hip;
}

// ---------------------------------------------------------------- rider
function makeRider(robeColor, banner) {
  const g = new THREE.Group();
  const robe = mat(robeColor, { roughness: 0.9 });
  const skin = mat('#b98563');
  const cloth = mat('#efe6d3', { roughness: 0.95 });
  const boot = mat('#2b1d14');

  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.33, 0.72, 16), robe);
  coat.position.y = 0.3;
  g.add(coat);
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 20), mat('#d9a441'));
  sash.rotation.x = Math.PI / 2;
  sash.position.y = 0.38;
  g.add(sash);
  const head = sphere(0.12, skin);
  head.position.y = 0.8;
  g.add(head);
  const turban = sphere(0.145, cloth);
  turban.scale.set(1, 0.72, 1);
  turban.position.y = 0.88;
  g.add(turban);
  const beard = sphere(0.07, mat('#2a1d16'));
  beard.position.set(0, 0.72, 0.08);
  g.add(beard);

  for (const s of [-1, 1]) {
    const thigh = limb(0.07, 0.06, 0.42, robe);
    thigh.position.set(s * 0.2, 0.1, 0.05);
    thigh.rotation.set(-0.5, 0, s * 0.35);
    g.add(thigh);
    const shin = limb(0.055, 0.05, 0.4, boot);
    shin.position.set(s * 0.34, -0.22, 0.24);
    shin.rotation.set(0.25, 0, s * 0.12);
    g.add(shin);
    const arm = limb(0.05, 0.045, 0.42, robe);
    arm.position.set(s * 0.19, 0.6, 0);
    arm.rotation.set(-0.9, 0, s * 0.15);
    g.add(arm);
  }

  if (banner) {
    const pole = stalk(0.02, 0.025, 2.6, mat('#5a3d22'));
    pole.position.set(0.28, 0.2, 0.15);
    g.add(pole);
    const flagGeo = new THREE.PlaneGeometry(0.9, 0.5, 14, 4);
    flagGeo.translate(-0.45, 0, 0);
    const flag = new THREE.Mesh(
      flagGeo,
      new THREE.MeshPhysicalMaterial({
        color: '#c4102f',
        side: THREE.DoubleSide,
        roughness: 0.45,
        sheen: 1,
        sheenColor: '#ff9aa9',
      })
    );
    flag.rotation.y = Math.PI / 2;
    flag.position.set(0.28, 2.5, 0.15);
    flag.userData.base = flagGeo.attributes.position.array.slice();
    g.add(flag);
    g.userData.flag = flag;
  }
  return g;
}

// ---------------------------------------------------------------- horse
function makeHorse(def) {
  const g = new THREE.Group();
  const coat = hide(def.coat, 0.6);
  const dark = mat('#1d1512', { roughness: 0.7 });
  const hoof = new THREE.CylinderGeometry(0.065, 0.08, 0.1, 10);

  const body = new THREE.Group();
  body.position.y = 1.32;
  g.add(body);
  const barrel = loftMesh(
    [[0, 0.02, -0.78, 0.2], [0, 0.05, -0.52, 0.37], [0, 0.0, 0.0, 0.34], [0, 0.0, 0.46, 0.37], [0, 0.04, 0.76, 0.27]],
    coat,
    { radial: 22, rings: 30, caps: 9 }
  );
  barrel.scale.set(0.86, 1.02, 1);
  body.add(barrel);

  // neck + head
  const neck = new THREE.Group();
  neck.position.set(0, 0.2, 0.62);
  body.add(neck);
  const neckMesh = loftMesh([[0, -0.08, -0.12, 0.27], [0, 0.22, 0.12, 0.19], [0, 0.55, 0.36, 0.13], [0, 0.7, 0.48, 0.115]], coat, { radial: 18, rings: 14, caps: 6 });
  neckMesh.scale.set(0.8, 1, 1);
  neck.add(neckMesh);
  const mane = stalk(0.035, 0.05, 0.78, dark);
  mane.position.set(0, 0.02, -0.12);
  mane.rotation.x = 0.62;
  neck.add(mane);
  const head = loftMesh([[0, 0.7, 0.44, 0.115], [0, 0.55, 0.62, 0.12], [0, 0.4, 0.84, 0.085], [0, 0.3, 0.96, 0.075]], coat, { radial: 14, rings: 10, caps: 6 });
  head.scale.set(0.8, 1, 1);
  neck.add(head);
  const muzzle = sphere(0.062, dark);
  muzzle.position.set(0, 0.29, 0.97);
  neck.add(muzzle);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 8), coat);
    ear.position.set(s * 0.06, 0.74, 0.5);
    ear.rotation.x = 0.4;
    neck.add(ear);
    const eye = sphere(0.025, dark);
    eye.position.set(s * 0.1, 0.6, 0.74);
    neck.add(eye);
  }

  // tail
  const tail = new THREE.Group();
  tail.position.set(0, 0.15, -0.82);
  body.add(tail);
  const tailMesh = limb(0.07, 0.03, 0.8, dark);
  tailMesh.rotation.x = 0.35;
  tail.add(tailMesh);

  // saddle
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.62), mat(def.robe, { roughness: 0.95 }));
  blanket.position.set(0, 0.33, 0);
  body.add(blanket);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.055, 0.1), mat('#d9a441'));
  trim.position.set(0, 0.33, 0.26);
  body.add(trim);
  const saddle = capsule(0.13, 0.22, mat('#4a2a17', { roughness: 0.5 }));
  saddle.rotation.x = Math.PI / 2;
  saddle.scale.set(1.6, 0.6, 1);
  saddle.position.set(0, 0.38, 0);
  body.add(saddle);

  const legs = [];
  const LEG = [
    // x, z, front, gait offset (4-beat walk)
    [-0.17, 0.46, true, 0.25],
    [0.17, 0.46, true, 0.75],
    [-0.17, -0.5, false, 0.0],
    [0.17, -0.5, false, 0.5],
  ];
  for (const [x, z, front, off] of LEG) {
    const leg = makeLeg(x, 1.2, z, 0.56, 0.56, 0.085, 0.052, coat, dark, hoof);
    leg.userData.front = front;
    leg.userData.off = off;
    g.add(leg);
    legs.push(leg);
  }

  if (def.rider) {
    const rider = makeRider(def.robe, def.banner);
    rider.position.set(0, 0.42, -0.02);
    body.add(rider);
    g.userData.rider = rider;
  }

  g.userData = { ...g.userData, legs, body, neck, tail, baseY: 1.32, stride: 1.0 };
  return g;
}

// ---------------------------------------------------------------- camel
const CARGO = ['#b5122e', '#1f6f78', '#d39b33', '#6c2f6f', '#e6d9bf', '#24477a'];

function makeCamel(i) {
  const g = new THREE.Group();
  const fur = hide(i % 2 ? '#a8794a' : '#b98c5c', 0.96);
  const dark = mat('#5e4128', { roughness: 0.9 });
  const pad = new THREE.CylinderGeometry(0.1, 0.12, 0.08, 12);

  const body = new THREE.Group();
  body.position.y = 1.62;
  g.add(body);
  const torso = loftMesh(
    [[0, 0.0, -0.92, 0.26], [0, 0.0, -0.52, 0.41], [0, -0.02, 0.05, 0.4], [0, -0.04, 0.52, 0.4], [0, 0.0, 0.88, 0.29]],
    fur,
    { radial: 22, rings: 30, caps: 9 }
  );
  torso.scale.set(0.84, 0.95, 1);
  body.add(torso);
  for (const z of [-0.36, 0.3]) {
    const hump = sphere(0.31, fur);
    hump.scale.set(0.95, 1.15, 1.1);
    hump.position.set(0, 0.42, z);
    body.add(hump);
    const tuft = sphere(0.18, dark);
    tuft.scale.set(1, 0.7, 1);
    tuft.position.set(0, 0.74, z);
    body.add(tuft);
  }

  // silk rolls and a rug over the back
  const rollGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.9, 16);
  rollGeo.rotateX(Math.PI / 2);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const roll = new THREE.Mesh(
        rollGeo,
        mat(CARGO[(i * 2 + k + (s > 0 ? 3 : 0)) % CARGO.length], { roughness: 0.4, metalness: 0.05 })
      );
      roll.position.set(s * (0.47 + k * 0.05), 0.1 + k * 0.28, -0.03);
      roll.userData.keep = true;
      body.add(roll);
    }
  }
  const rug = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.32), mat(CARGO[(i + 2) % CARGO.length], { roughness: 0.95 }));
  rug.position.set(0, 0.5, -0.03);
  rug.userData.keep = true;
  body.add(rug);

  // two-part neck: down-forward, then up to the head
  const neck = new THREE.Group();
  neck.position.set(0, 0.0, 0.72);
  body.add(neck);
  // swan-like S-curve neck, then a long camel head with a drooping muzzle
  const neckMesh = loftMesh(
    [[0, -0.04, -0.06, 0.27], [0, 0.18, 0.2, 0.2], [0, 0.45, 0.38, 0.14], [0, 0.75, 0.46, 0.12], [0, 0.95, 0.62, 0.115]],
    fur,
    { radial: 18, rings: 18, caps: 6 }
  );
  neckMesh.scale.set(0.8, 1, 1);
  neck.add(neckMesh);
  const head = loftMesh([[0, 0.97, 0.66, 0.125], [0, 0.95, 0.88, 0.13], [0, 0.88, 1.08, 0.1], [0, 0.82, 1.2, 0.085]], fur, { radial: 14, rings: 10, caps: 6 });
  head.scale.set(0.85, 1, 1);
  neck.add(head);
  const snout = sphere(0.075, dark);
  snout.position.set(0, 0.8, 1.22);
  snout.scale.set(1.1, 0.9, 1.1);
  neck.add(snout);
  for (const s of [-1, 1]) {
    const ear = sphere(0.05, fur);
    ear.position.set(s * 0.1, 1.04, 0.78);
    neck.add(ear);
    const eye = sphere(0.025, mat('#120c09'));
    eye.position.set(s * 0.11, 0.98, 0.95);
    neck.add(eye);
  }

  const tail = new THREE.Group();
  tail.position.set(0, 0.05, -0.88);
  body.add(tail);
  const tailMesh = limb(0.04, 0.02, 0.5, dark);
  tailMesh.rotation.x = 0.2;
  tail.add(tailMesh);

  const legs = [];
  const LEG = [
    // camels pace: both legs on one side move together
    [-0.22, 0.52, true, 0.0],
    [0.22, 0.52, true, 0.5],
    [-0.22, -0.52, false, 0.0],
    [0.22, -0.52, false, 0.5],
  ];
  for (const [x, z, front, off] of LEG) {
    const leg = makeLeg(x, 1.36, z, 0.66, 0.66, 0.1, 0.06, fur, dark, pad);
    leg.userData.front = front;
    leg.userData.off = off;
    g.add(leg);
    legs.push(leg);
  }

  g.userData = { legs, body, neck, tail, baseY: 1.62, stride: 0.85 };
  return g;
}

// ---------------------------------------------------------------- ship
function makeShip() {
  const g = new THREE.Group();
  const wood = mat('#5e3a20', { roughness: 0.7 });
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-0.85, 0.5);
  hullShape.quadraticCurveTo(-0.9, -0.3, 0, -0.45);
  hullShape.quadraticCurveTo(0.9, -0.3, 0.85, 0.5);
  hullShape.lineTo(-0.85, 0.5);
  const hullGeo = new THREE.ExtrudeGeometry(hullShape, { depth: 4.2, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.05, bevelSegments: 6 });
  hullGeo.translate(0, 0, -2.1);
  const hull = new THREE.Mesh(hullGeo, wood);
  hull.position.y = 0.2;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 4.4), mat('#8a6440'));
  deck.position.y = 0.68;
  const mast = stalk(0.06, 0.08, 4.4, wood);
  mast.position.y = 0.6;
  const sailGeo = new THREE.PlaneGeometry(2.6, 2.6, 10, 10);
  const sp = sailGeo.attributes.position;
  for (let k = 0; k < sp.count; k++) {
    const x = sp.getX(k);
    const y = sp.getY(k);
    sp.setZ(k, (1 - (x / 1.3) ** 2) * (1 - (y / 1.3) ** 2) * 0.45);
  }
  sailGeo.computeVertexNormals();
  const sail = new THREE.Mesh(sailGeo, mat('#efe3c6', { side: THREE.DoubleSide, roughness: 0.95 }));
  sail.position.set(0, 3.0, 0.1);
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(2.62, 0.4), mat('#b5122e', { side: THREE.DoubleSide }));
  stripe.position.set(0, 3.0, 0.42);
  const cargo = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.4), mat('#b5122e', { roughness: 0.5 }));
  cargo.position.set(0, 0.95, -1.2);
  g.add(hull, deck, mast, sail, stripe, cargo);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
}

// ---------------------------------------------------------------- caravan
export function createCaravan(curve) {
  const group = new THREE.Group();
  const animals = CAMELS.map((def, i) => (def.kind === 'horse' ? makeHorse(def) : makeCamel(i)));
  animals.forEach((a, i) => {
    a.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.userData.camel = i;
      }
    });
    group.add(a);
  });
  const ship = makeShip();
  ship.scale.setScalar(0);
  group.add(ship);

  const length = curve.getLength();
  const gaps = CAMELS.map((d) => (d.kind === 'horse' ? 2.5 : 3.1));
  const offsets = [];
  let acc = 0;
  gaps.forEach((gp, i) => {
    offsets.push(acc / length);
    acc += gp;
  });
  const pickables = [];
  animals.forEach((a) => a.traverse((o) => o.isMesh && pickables.push(o)));

  // ---- optional realistic models: drop camel.glb / horse.glb into /public/models and they replace the procedural animals
  const gaits = [];
  const MODEL_LEN = { camel: 2.7, horse: 2.4 };
  function useModel(kind, gltf) {
    animals.forEach((a, i) => {
      if (CAMELS[i].kind !== kind) return;
      const model = cloneSkinned(gltf.scene);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const k = kind === 'horse' ? 2.15 / size.y : MODEL_LEN[kind] / Math.max(size.x, size.z);
      const holder = new THREE.Group();
      model.scale.setScalar(k);
      model.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, -(box.min.z + box.max.z) / 2 * k);
      if (size.x > size.z) holder.rotation.y = Math.PI / 2; // long axis along the walking direction
      holder.add(model);
      // hide the procedural animal but keep the rider
      const rider = a.userData.rider;
      a.traverse((o) => {
        if (!o.isMesh) return;
        let keep = false;
        for (let n = o; n; n = n.parent) if (n === rider) keep = true;
        if (o.userData.keep && !o.userData.fitted) {
          // sit the silk rolls on the real camel's back instead of the toy one
          o.userData.fitted = true;
          o.position.y -= 0.36;
          o.position.x *= 0.6;
          o.scale.multiplyScalar(0.85);
        }
        if (!keep && !o.userData.keep) o.visible = false;
      });
      holder.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = o.receiveShadow = true;
          o.userData.camel = i;
          pickables.push(o);
        }
      });
      a.add(holder);
      a.userData.model = holder;
      holder.userData.baseRotY = holder.rotation.y;
      // real legs: IK pacing for the camel, mocap walk + idle for the horse
      const gait = (kind === 'camel' ? camelGait : horseGait)(model, gltf.animations);
      holder.userData.rigged = !!gait;
      if (gait) gaits.push({ gait, animal: a, scale: k });
    });
  }
  const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  for (const kind of ['camel', 'horse']) {
    // the dev server answers unknown paths with index.html, so a failed parse simply means "no model"
    gltfLoader.load(`models/${kind}.glb`, (g) => useModel(kind, g), undefined, () => {});
  }
  let lastTime = 0;

  let phase = 0;
  const p = new THREE.Vector3();
  const ahead = new THREE.Vector3();

  function place(obj, t, y = 0) {
    const tt = clamp(t, 0, 1);
    curve.getPointAt(tt, p);
    curve.getPointAt(clamp(tt + 0.002, 0, 1), ahead);
    if (tt >= 0.998) {
      curve.getPointAt(0.996, ahead);
      ahead.sub(p).negate().add(p);
    }
    obj.position.copy(p);
    obj.position.y += y;
    ahead.y = obj.position.y;
    obj.lookAt(ahead);
    return p;
  }

  function animate(a, ph, walk, time, i) {
    const { legs, body, neck, tail, baseY } = a.userData;
    for (const leg of legs) {
      const lp = (ph + leg.userData.off) * TAU;
      leg.rotation.x = -Math.sin(lp) * 0.36 * walk;
      const lift = Math.max(0, Math.cos(lp)) * 0.75 * walk;
      leg.userData.knee.rotation.x = leg.userData.front ? lift : -lift * 0.8;
    }
    body.position.y = baseY + Math.abs(Math.sin(ph * TAU * 2)) * 0.035 * walk + Math.sin(time * 1.3 + i) * 0.01;
    body.rotation.z = Math.sin(ph * TAU) * 0.025 * walk;
    neck.rotation.x = Math.sin(ph * TAU * 2) * 0.05 * walk + Math.sin(time * 0.7 + i * 2) * 0.03;
    tail.rotation.z = Math.sin(time * 2.1 + i) * 0.15;
    // models without a rig: sway, bob and pitch in time with the gait
    const model = a.userData.model;
    if (model && model.userData.rigged) {
      // the rig walks for real; only the rider follows the horse's back
      const lift = a.userData.gait?.lift?.() ?? 0;
      body.position.y = baseY + lift;
      body.rotation.z = 0;
    } else if (model) {
      const s2 = Math.sin(ph * TAU * 2);
      const f = model.userData.rigged ? 0.25 : 1; // real leg animation needs far less faked motion
      model.position.y = Math.abs(s2) * 0.07 * walk * f;
      model.rotation.z = Math.sin(ph * TAU) * 0.045 * walk * f;
      model.rotation.x = Math.sin(ph * TAU * 2 + 1.2) * 0.025 * walk;
      model.rotation.y = model.userData.baseRotY + Math.sin(ph * TAU) * 0.03 * walk;
    }
    const flag = a.userData.rider?.userData.flag;
    if (flag) {
      const pos = flag.geometry.attributes.position;
      const base = flag.userData.base;
      for (let k = 0; k < pos.count; k++) {
        const x = base[k * 3];
        pos.setZ(k, Math.sin(x * 7 + time * 7) * 0.07 * -x);
      }
      pos.needsUpdate = true;
      flag.geometry.computeVertexNormals();
    }
  }

  return {
    group,
    pickables,
    head: new THREE.Vector3(),
    update(t, speed, time) {
      phase += speed * length * 0.32;
      const walk = clamp(Math.abs(speed) * 900, 0, 1);

      const dt = Math.min(Math.max(time - lastTime, 0), 0.1);
      lastTime = time;
      // ground distance this frame, handed to each rig in its own units
      const ds = speed * length;
      for (const g of gaits) {
        g.animal.userData.gait = g.gait;
        if (g.animal.visible) {
          g.animal.updateMatrixWorld(true);
          g.gait.update(dt, ds / g.scale);
        }
      }

      let seaAmt = 0;
      animals.forEach((a, i) => {
        const ti = t - offsets[i];
        const pos = place(a, ti);
        const sea = seaMask(pos.x, pos.z);
        seaAmt = Math.max(seaAmt, sea);
        const s = 1 - smooth01(sea * 1.6);
        a.scale.setScalar(Math.max(s, 0.0001));
        a.visible = s > 0.01;
        if (a.visible) animate(a, phase * a.userData.stride + i * 0.37, walk, time, i);
      });

      // Over the sea the caravan boards a ship.
      place(ship, t - offsets[3], 0);
      ship.position.y = WATER_Y + Math.sin(time * 1.6) * 0.08;
      ship.rotation.z = Math.sin(time * 1.1) * 0.05;
      const ss = smooth01(seaMask(ship.position.x, ship.position.z) * 1.4);
      ship.scale.setScalar(Math.max(ss, 0.0001));
      ship.visible = ss > 0.01;

      curve.getPointAt(clamp(t, 0, 1), this.head);
      return seaAmt;
    },
  };
}

function smooth01(x) {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}
