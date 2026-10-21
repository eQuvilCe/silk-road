import * as THREE from 'three';

// Poly Haven (CC0) 1K PBR sets from /public/tex
const loader = new THREE.TextureLoader();
const cache = {};

function tex(file, srgb) {
  const key = file + srgb;
  if (cache[key]) return cache[key];
  const t = loader.load(`tex/${file}`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return (cache[key] = t);
}

export function pbrSet(name, { diff = true } = {}) {
  return {
    map: diff ? tex(`${name}_diff.jpg`, true) : null,
    normalMap: tex(`${name}_nor.jpg`, false),
    roughnessMap: tex(`${name}_rough.jpg`, false),
  };
}

export const SETS = {
  sand: 'red_sand',
  ground: 'dry_ground_01',
  rock: 'rock_face',
  plaster: 'clay_plaster',
  stone: 'sandstone_blocks_05',
  roof: 'clay_roof_tiles',
  wood: 'wood_planks',
};

// Scale a BoxGeometry's UVs by real size so the texture density is the same on every wall.
export function worldScaleBoxUV(geo, w, h, d, density = 0.25) {
  const uv = geo.attributes.uv;
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  const per = uv.count / 6;
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < per; i++) {
      const k = f * per + i;
      uv.setXY(k, uv.getX(k) * faces[f][0] * density, uv.getY(k) * faces[f][1] * density);
    }
  }
  uv.needsUpdate = true;
}

// Large-scale colour mottling and vertical rain streaks so walls never look like clean plastic.
export function weather(mat, { amount = 1 } = {}) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\n vWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#else\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#endif');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWP;
        float wh(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float wn(vec3 p){
          vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(wh(i), wh(i + vec3(1,0,0)), f.x), mix(wh(i + vec3(0,1,0)), wh(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(wh(i + vec3(0,0,1)), wh(i + vec3(1,0,1)), f.x), mix(wh(i + vec3(0,1,1)), wh(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float big = wn(vWP * 0.35) * 0.6 + wn(vWP * 1.3) * 0.4;
          float streak = wn(vec3(vWP.x * 2.2, vWP.y * 0.18, vWP.z * 2.2));
          float w = 0.82 + big * 0.3 - smoothstep(0.55, 0.9, streak) * 0.16;
          diffuseColor.rgb *= mix(1.0, w, ${amount.toFixed(2)});
        }`
      );
  };
  return mat;
}
