import * as THREE from 'three';

// Gradient sky dome with a soft sun. The same dome (in its own little scene)
// is baked into an environment map so every material reflects the sky.
const vert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
    gl_Position.z = gl_Position.w; // always at the far plane
  }
`;

const frag = /* glsl */ `
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 ground;
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform float sunAmount;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.55));
    col = mix(col, ground, smoothstep(0.0, -0.25, h));
    float s = max(dot(d, normalize(sunDir)), 0.0);
    col += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 24.0) * 0.28 + pow(s, 4.0) * 0.12) * sunAmount;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function makeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      zenith: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      ground: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color() },
      sunAmount: { value: 1 },
    },
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}

export function createSky(renderer) {
  const mat = makeMaterial();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  dome.frustumCulled = false;
  dome.renderOrder = -1;

  // env-map bake
  const envScene = new THREE.Scene();
  const envMat = makeMaterial();
  envMat.uniforms = mat.uniforms; // share values
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), envMat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;

  return {
    dome,
    set({ zenith, horizon, ground, sunDir, sunColor, sunAmount }) {
      const u = mat.uniforms;
      u.zenith.value.copy(zenith);
      u.horizon.value.copy(horizon);
      u.ground.value.copy(ground);
      u.sunDir.value.copy(sunDir);
      u.sunColor.value.copy(sunColor);
      u.sunAmount.value = sunAmount;
    },
    bakeEnvironment(scene) {
      const next = pmrem.fromScene(envScene, 0, 0.1, 100);
      scene.environment = next.texture;
      if (envRT) envRT.dispose();
      envRT = next;
    },
  };
}
