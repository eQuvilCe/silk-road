// Living animals: the camel model only ships an idle clip (its legs never move),
// so its walk is built here with two-bone IK and planted hooves. The horse model
// has a long mocap take; we cut a clean walk loop and a grazing idle out of it.
import * as THREE from 'three';
import { AnimationUtils } from 'three';

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (x) => x * x * (3 - 2 * x);

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _wq = new THREE.Quaternion();
const _pq = new THREE.Quaternion();

// rotate a bone so that its world-space direction `from` turns into `to`
function aim(bone, from, to) {
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
  _q.setFromUnitVectors(from.normalize(), to.normalize());
  bone.getWorldQuaternion(_wq);
  bone.parent.getWorldQuaternion(_pq);
  bone.quaternion.copy(_pq.invert().multiply(_q.multiply(_wq)));
  bone.updateMatrixWorld(true);
}

// turn a bone by `angle` around a world-space axis
function turn(bone, axis, angle) {
  if (!angle) return;
  bone.getWorldQuaternion(_wq);
  bone.parent.getWorldQuaternion(_pq);
  _q.setFromAxisAngle(axis, angle);
  bone.quaternion.copy(_pq.invert().multiply(_q.multiply(_wq)));
  bone.updateMatrixWorld(true);
}

const local = (root, obj, out = new THREE.Vector3()) => root.worldToLocal(obj.getWorldPosition(out));

// ------------------------------------------------------------------ camel
// Camels pace: both legs on one side swing together, which gives the
// famous side-to-side rocking. Hind feet land a touch before the fore feet.
export function camelGait(scene, clips) {
  const bones = {};
  scene.traverse((o) => o.isBone && (bones[o.name] = o));
  const need = ['Body', 'Neck', 'Head', 'Back001', 'Back003'];
  for (const side of ['L', 'R']) for (const end of ['Front', 'Back']) need.push(`${end}UpLeg${side}`, `${end}LowLeg${side}`, `${end}Foot${side}`);
  if (need.some((n) => !bones[n])) return null;

  const mixer = new THREE.AnimationMixer(scene);
  if (clips[0]) mixer.clipAction(clips[0]).play(); // the idle keeps the head and ears alive
  mixer.update(0);
  scene.updateMatrixWorld(true);

  // rest pose, in the model's own space
  const fwd = new THREE.Vector3();
  const legs = [];
  for (const side of ['L', 'R']) {
    for (const end of ['Front', 'Back']) {
      const up = bones[`${end}UpLeg${side}`];
      const low = bones[`${end}LowLeg${side}`];
      const foot = bones[`${end}Foot${side}`];
      const A = local(scene, up);
      const B = local(scene, low);
      const F = local(scene, foot);
      legs.push({
        up, low, foot, front: end === 'Front',
        upQ: up.quaternion.clone(),
        lowQ: low.quaternion.clone(),
        footQ: foot.quaternion.clone(),
        // tip of the lower bone = where the hoof bone sits at rest, in the lower bone's space
        tip: low.worldToLocal(foot.getWorldPosition(new THREE.Vector3())),
        rest: F,
        L1: A.distanceTo(B),
        L2: B.distanceTo(F),
        // which way the knee bends, kept from the rest pose
        pole: B.clone().sub(A.clone().lerp(F, A.distanceTo(B) / (A.distanceTo(B) + B.distanceTo(F)))),
        // pace: same-side legs together, hind a bit ahead in time
        off: (side === 'L' ? 0 : 0.5) + (end === 'Back' ? -0.06 : 0),
      });
    }
  }
  fwd.copy(legs[0].rest).sub(legs[1].rest).setY(0).normalize(); // front foot minus back foot
  const upV = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(upV, fwd).normalize();
  const legLen = legs[0].L1 + legs[0].L2;
  const bodyLen = legs[0].rest.distanceTo(legs[1].rest);
  const CYCLE = bodyLen * 1.1; // distance covered by one full stride, model units
  const DUTY = 0.62;
  const bodyRest = bones.Body.position.clone();
  // bones we turn by hand; reset every frame so turns never pile up
  const extra = ['Body', 'Neck', 'Head', 'Back001', 'Back003'].map((n) => [bones[n], bones[n].quaternion.clone()]);

  const T = new THREE.Vector3();
  const K = new THREE.Vector3();
  const A = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const perp = new THREE.Vector3();
  const wFwd = new THREE.Vector3();
  const wSide = new THREE.Vector3();
  const wUp = new THREE.Vector3();
  let phase = Math.random();
  let walkS = 0;
  let speedS = 0;
  let idleT = Math.random() * 100;

  function footAt(leg, u, w) {
    // u: 0..1 through the step. Stance slides back under the body, swing arcs forward.
    const S = CYCLE * DUTY * w;
    let z;
    let y = 0;
    let pitch = 0;
    if (u < DUTY) {
      z = S / 2 - S * (u / DUTY);
    } else {
      const s = (u - DUTY) / (1 - DUTY);
      z = -S / 2 + S * smooth(s);
      y = Math.sin(Math.PI * s) * legLen * (leg.front ? 0.13 : 0.07) * Math.min(1, w * 1.4);
      pitch = Math.sin(Math.PI * s) * (leg.front ? 0.6 : 0.25) * w;
    }
    T.copy(leg.rest).addScaledVector(fwd, z).addScaledVector(upV, y);
    return pitch;
  }

  return {
    mixer,
    // dist: distance walked this frame in model units (negative = backwards)
    update(dt, dist) {
      for (const [b, q] of extra) b.quaternion.copy(q);
      mixer.update(dt);
      speedS += (dist / Math.max(dt, 1e-4) - speedS) * (1 - Math.exp(-dt * 3));
      const moving = clamp(Math.abs(speedS) / (CYCLE * 0.9));
      walkS += (moving - walkS) * (1 - Math.exp(-dt * 2.5));
      const hurry = clamp(Math.abs(speedS) / (CYCLE * 1.6) - 0.6);
      const w = walkS;
      phase += dist / CYCLE;
      if (w < 0.02) {
        // ease the feet home so it never freezes mid-stride
        phase += (Math.round(phase * 2) / 2 - phase) * (1 - Math.exp(-dt * 2));
      }
      idleT += dt;

      // body: bob twice per stride, rock towards the side that is on the ground
      const ph = phase * TAU;
      bones.Body.position.copy(bodyRest);
      bones.Body.position.y += (Math.cos(ph * 2) * 0.5 - 0.5) * legLen * (0.035 + hurry * 0.03) * w + Math.sin(idleT * 1.6) * legLen * 0.005;
      bones.Body.updateMatrixWorld(true);

      wFwd.copy(fwd).transformDirection(scene.matrixWorld);
      wSide.copy(side).transformDirection(scene.matrixWorld);
      wUp.copy(upV).transformDirection(scene.matrixWorld);
      // the pacing roll: the whole body rocks over the side that is on the ground
      turn(bones.Body, wFwd, Math.sin(ph) * (0.085 + hurry * 0.04) * w);
      turn(bones.Body, wSide, Math.sin(ph * 2 + 0.6) * 0.018 * w);
      turn(bones.Body, wUp, Math.sin(ph + 0.4) * 0.03 * w);

      // the long neck pumps with each step, the head stays fairly level
      turn(bones.Neck, wSide, Math.sin(ph * 2 - 0.8) * (0.09 + hurry * 0.05) * w + Math.sin(idleT * 0.37) * 0.05 * (1 - w) - hurry * 0.12);
      turn(bones.Neck, wUp, Math.sin(idleT * 0.23 + 1.3) * 0.12 * (1 - w * 0.7));
      turn(bones.Head, wSide, -Math.sin(ph * 2 - 0.8) * 0.05 * w);
      // tail swish
      turn(bones.Back001, wFwd, Math.sin(idleT * 1.9) * 0.18 + Math.sin(ph) * 0.1 * w);
      turn(bones.Back003, wFwd, Math.sin(idleT * 1.9 - 0.9) * 0.22);

      for (const leg of legs) {
        leg.up.quaternion.copy(leg.upQ);
        leg.low.quaternion.copy(leg.lowQ);
        leg.foot.quaternion.copy(leg.footQ);
        leg.up.updateMatrixWorld(true);
        const u = (((phase + leg.off) % 1) + 1) % 1;
        const pitch = footAt(leg, u, w);

        // two-bone IK in model space
        local(scene, leg.up, A);
        let d = A.distanceTo(T);
        const { L1, L2 } = leg;
        d = clamp(d, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
        dir.copy(T).sub(A).normalize();
        const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
        const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
        perp.copy(leg.pole).addScaledVector(dir, -leg.pole.dot(dir)).normalize();
        K.copy(A).addScaledVector(dir, a).addScaledVector(perp, h);
        T.copy(A).addScaledVector(dir, d);

        // aim the upper bone at the knee, the lower bone at the hoof (world space)
        const Aw = scene.localToWorld(A.clone());
        const Kw = scene.localToWorld(K.clone());
        const Tw = scene.localToWorld(T.clone());
        leg.low.getWorldPosition(_a);
        aim(leg.up, _b.copy(_a).sub(Aw), _c.copy(Kw).sub(Aw));
        leg.low.getWorldPosition(_a);
        leg.low.localToWorld(_b.copy(leg.tip));
        aim(leg.low, _b.sub(_a), _c.copy(Tw).sub(_a));
        // hoof follows the target and tips forward while it swings
        leg.foot.parent.worldToLocal(_a.copy(Tw));
        leg.foot.position.copy(_a);
        leg.foot.updateMatrixWorld(true);
        turn(leg.foot, wSide, pitch);
      }
    },
  };
}

// ------------------------------------------------------------------ horse
// One mocap take: a clean, looping walk sits at 3.10–4.47 s,
// a calm idle with a grazing dip at 24.80–30.97 s (both at 30 fps).
export function horseGait(scene, clips) {
  const clip = clips[0];
  if (!clip) return null;
  const walkClip = AnimationUtils.subclip(clip, 'walk', 93, 134, 30);
  const idleClip = AnimationUtils.subclip(clip, 'idle', 744, 929, 30);
  // a clean gallop loop sits at the very start of the take (0.07–0.73 s)
  const runClip = AnimationUtils.subclip(clip, 'gallop', 2, 22, 30);
  const mixer = new THREE.AnimationMixer(scene);
  const walk = mixer.clipAction(walkClip);
  const idle = mixer.clipAction(idleClip);
  const run = mixer.clipAction(runClip);
  walk.play();
  idle.play();
  run.play();
  run.setEffectiveWeight(0);
  idle.time = Math.random() * idleClip.duration;
  walk.time = Math.random() * walkClip.duration;

  let hips = null;
  scene.traverse((o) => o.isBone && /^Hips/.test(o.name) && (hips ||= o));
  mixer.update(0);
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const bodyLen = Math.max(size.x, size.z);
  const CYCLE = bodyLen * 0.95; // one walk loop covers about a body length
  const RUN_CYCLE = bodyLen * 1.6; // one gallop stride covers more ground
  let walkS = 0;
  let runS = 0;
  let speedS = 0;
  const hp = new THREE.Vector3();
  let hipsRest = null;

  return {
    mixer,
    update(dt, dist) {
      // smooth the speed so gaits blend instead of snapping
      speedS += (dist / Math.max(dt, 1e-4) - speedS) * (1 - Math.exp(-dt * 3));
      const walkV = CYCLE / walkClip.duration;
      const moving = clamp(Math.abs(speedS) / walkV / 0.5);
      const fast = clamp((Math.abs(speedS) / walkV - 1.7) / 0.9);
      walkS += (moving - walkS) * (1 - Math.exp(-dt * 2.5));
      runS += (fast - runS) * (1 - Math.exp(-dt * 2.5));
      idle.setEffectiveWeight(1 - walkS);
      walk.setEffectiveWeight(walkS * (1 - runS));
      run.setEffectiveWeight(walkS * runS);
      // each gait plays exactly as fast as the ground moves, so hooves don't skate
      walk.timeScale = THREE.MathUtils.clamp(speedS / walkV, -2, 2);
      run.timeScale = THREE.MathUtils.clamp(speedS / (RUN_CYCLE / runClip.duration), -1.6, 1.6);
      mixer.update(dt);
      if (hips) {
        hips.getWorldPosition(hp);
        scene.parent.worldToLocal(hp);
        hipsRest ??= hp.y;
      }
    },
    // how far the back rises and falls this frame, in the holder's units (for the rider)
    lift() {
      return hipsRest == null ? 0 : hp.y - hipsRest;
    },
  };
}
