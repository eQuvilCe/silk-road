import * as THREE from 'three';

// Smooth organic "loft": a tube that follows a spline through [x,y,z,radius] control points.
// Both ends are closed with a rounded cap, so bodies, necks, heads and legs read as one
// continuous skinned shape instead of stacked capsules and spheres.
export function loft(pts, { radial = 18, rings = 28, squash = 1, caps = 7, uvScale = [2, 3] } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
  const radii = pts.map((p) => p[3]);
  const radiusAt = (t) => {
    const f = t * (radii.length - 1);
    const i = Math.min(Math.floor(f), radii.length - 2);
    const k = f - i;
    const s = k * k * (3 - 2 * k);
    return radii[i] + (radii[i + 1] - radii[i]) * s;
  };

  const frames = curve.computeFrenetFrames(rings, false);
  const total = rings + 1 + caps * 2;
  const pos = [];
  const uv = [];
  const idx = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let j = 0; j < total; j++) {
    // rows: [start cap][body][end cap]
    let t;
    let capK = 1;
    let side = 0;
    if (j < caps) {
      t = 0;
      capK = Math.sin(((j + 0.5) / caps) * Math.PI * 0.5);
      side = -1;
    } else if (j >= caps + rings + 1) {
      t = 1;
      capK = Math.cos(((j - caps - rings - 0.5) / caps) * Math.PI * 0.5);
      side = 1;
    } else {
      t = (j - caps) / rings;
    }
    const fi = Math.min(Math.round(t * rings), rings);
    curve.getPointAt(t, p);
    const r = radiusAt(t);
    const N = frames.normals[fi];
    const B = frames.binormals[fi];
    const T = frames.tangents[fi];
    const along = side === 0 ? 0 : (1 - capK * capK > 0 ? Math.sqrt(1 - capK * capK) : 0) * r * side;
    for (let i = 0; i <= radial; i++) {
      const a = (i / radial) * Math.PI * 2;
      const cx = Math.cos(a);
      const cy = Math.sin(a) * squash;
      n.copy(N).multiplyScalar(cx).addScaledVector(B, cy);
      const rr = r * capK;
      pos.push(p.x + n.x * rr + T.x * along, p.y + n.y * rr + T.y * along, p.z + n.z * rr + T.z * along);
      uv.push((i / radial) * uvScale[0], (j / total) * uvScale[1]);
    }
  }
  for (let j = 0; j < total - 1; j++) {
    for (let i = 0; i < radial; i++) {
      const a = j * (radial + 1) + i;
      const b = a + radial + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export const loftMesh = (pts, mat, opts) => new THREE.Mesh(loft(pts, opts), mat);
