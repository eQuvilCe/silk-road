// A few flocks of birds that wheel over the caravan; wings flap in the vertex shader.
import * as THREE from 'three';

export function createBirds(count = 36) {
  // one bird: body + two wings (wing vertices carry a flap weight)
  const pos = [];
  const flap = [];
  const tri = (a, b, c, fa, fb, fc) => {
    pos.push(...a, ...b, ...c);
    flap.push(fa, fb, fc);
  };
  tri([0, 0, 0.32], [-0.05, 0, -0.18], [0.05, 0, -0.18], 0, 0, 0); // body
  tri([0, 0, 0.1], [0, 0, -0.08], [-0.55, 0.0, -0.02], 0, 0, 1); // left wing
  tri([0, 0, 0.1], [0.55, 0.0, -0.02], [0, 0, -0.08], 0, 1, 0); // right wing
  tri([0, 0, -0.12], [-0.1, 0, -0.32], [0.1, 0, -0.32], 0, 0, 0); // tail
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aFlap', new THREE.Float32BufferAttribute(flap, 1));
  geo.computeVertexNormals();

  const time = { value: 0 };
  const mat = new THREE.MeshBasicMaterial({ color: '#2a1d14', side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = time;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFlap;\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float ph = float(gl_InstanceID) * 1.7;
        // flap in bursts, then glide
        float burst = smoothstep(0.2, 0.6, sin(uTime * 0.6 + ph * 0.3));
        float f = sin(uTime * 13.0 + ph) * (0.25 + 0.75 * burst);
        transformed.y += aFlap * f * 0.38;
        transformed.x *= 1.0 - aFlap * abs(f) * 0.2;`
      );
  };
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;

  const birds = Array.from({ length: count }, (_, i) => ({
    flock: i % 3,
    r: 10 + Math.random() * 6,
    a: Math.random() * Math.PI * 2,
    y: 9 + Math.random() * 5,
    speed: 0.22 + Math.random() * 0.06,
    off: new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 4),
  }));
  const centers = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const dummy = new THREE.Object3D();
  const next = new THREE.Vector3();

  return {
    mesh,
    update(dt, t, focus, visible = 1) {
      time.value = t;
      mat.opacity = 0.85 * visible;
      mesh.visible = visible > 0.01;
      centers.forEach((c, k) => {
        // each flock drifts around the caravan on its own slow loop
        const a = t * 0.05 + k * 2.1;
        c.lerp(next.set(focus.x + Math.cos(a) * (18 + k * 9), focus.y + 6 + k * 3, focus.z + Math.sin(a) * (14 + k * 6)), 1 - Math.exp(-dt * 0.5));
      });
      birds.forEach((b, i) => {
        b.a += b.speed * dt;
        const c = centers[b.flock];
        const x = c.x + Math.cos(b.a) * b.r + b.off.x;
        const z = c.z + Math.sin(b.a) * b.r + b.off.z;
        const y = c.y + b.y * 0.3 + Math.sin(t * 0.7 + i) * 0.6 + b.off.y;
        dummy.position.set(x, y, z);
        // face along the circle, bank into the turn
        dummy.lookAt(x - Math.sin(b.a), y, z + Math.cos(b.a));
        dummy.rotateZ(-0.35);
        dummy.scale.setScalar(0.9);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
