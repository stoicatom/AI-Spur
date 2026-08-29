/**
 * 场景 28 bomb 的元素搭建（规格 §4.2 场景 28 的九元素）。
 *
 * 与编排分离：本文件只负责「把元素立起来」，三幕动作在 cg-bomb.ts，
 * 碎片刚体在 bomb-shrapnel.ts。拆分理由是 CLAUDE.md 的 250 行上限，
 * 也让元素清单能一眼对照规格。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { NOISE_CHUNK, createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import { additiveMaterial, createSceneResources, type SceneResources } from '../cg-scene-kit';
import { scaledCount } from '../cg-particle-kit';

/**
 * ④ 浓烟蘑菇云：FBM 翻腾 + 蘑菇轮廓包络 + 碎片烟隙。
 *
 * 不复用 VOLUME_CLOUD_FRAGMENT：那是横铺的云幕，这里要的是「柄细顶宽」的
 * 纵向蘑菇体，且需要 uGaps 让碎片穿透在烟上真的留下孔洞。
 */
const SMOKE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uTime;
uniform float uDensity;
uniform float uGaps;
uniform float uRise;
${NOISE_CHUNK}
void main() {
  vec2 uv = vUv;
  // 蘑菇轮廓：纵向半径由柄部 0.12 张到冠部 0.5。
  float cap = smoothstep(0.0, 0.44, uv.y);
  float radius = mix(0.11, 0.5, cap);
  float dx = abs(uv.x - 0.5);
  float body = 1.0 - smoothstep(radius * 0.7, radius, dx);
  // 双层反向漂移 + uRise 抽动纹理，单层平移只会像贴图在滑。
  float base = fbm(uv * 3.4 + vec2(uTime * 0.05, -uTime * 0.11 - uRise));
  float detail = fbm(uv * 8.1 - vec2(uTime * 0.03, uTime * 0.07));
  float mass = base * 0.66 + detail * 0.34;
  float cloud = smoothstep(0.4, 0.82, mass) * body * uDensity;
  // 烟隙：穿烟碎片越多，孔洞越密越深——互动写在着色器里而非叠一层假孔。
  float holes = step(0.62, hash12(floor(uv * (6.0 + uGaps * 1.4)) + floor(uTime * 6.0)));
  cloud *= 1.0 - holes * clamp(uGaps * 0.09, 0.0, 0.55);
  if (cloud < 0.004) discard;
  gl_FragColor = vec4(uColor, cloud);
}`;

/** ⑦ 压力变形：只在四缘起皱，中心留给火球与烟。 */
const WARP_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uTime;
uniform float uStrength;
${NOISE_CHUNK}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float edge = smoothstep(0.52, 1.14, r);
  float ripple = sin(r * 22.0 - uTime * 9.0) * 0.5 + 0.5;
  float grain = fbm(p * 3.2 + uTime * 0.6);
  float a = edge * uStrength * (0.34 + ripple * 0.4 + grain * 0.3);
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * 1.3, a * 0.5);
}`;

/** ⑧ 一片灰烬：x 固定、y 由云顶落到地面，phase 让下落错开。 */
export type AshFlake = {
  mesh: THREE.Mesh;
  x: number;
  /** 初始下落相位（0→1），保证任一时刻都有刚从云顶脱落的灰烬。 */
  phase: number;
  /** 下落速率倍率，制造轻重不一的飘落感。 */
  rate: number;
  spin: number;
};

export type BombParts = {
  res: SceneResources;
  /** 爆炸参考半径（像素），所有元素尺度以它为基准。 */
  blast: number;
  /** 地面高度（局部坐标），焦圈与刚体地面共用。 */
  groundY: number;
  shell: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  fuse: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  fireball: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  shockwave: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  /** 冲击波环外半径（R+tube），把目标半径换算成 scale。 */
  shockOuter: number;
  smoke: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  warp: THREE.ShaderMaterial;
  flash: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  scorch: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  ash: AshFlake[];
  /** 灰烬落到此高度即回收重下。 */
  ashFloorY: number;
};
/** 火球主色：内焰白黄，与素材色（橙红）分层。 */
const CORE_COLOR = '#FFE2A8';

export function buildBombParts(ctx: CgStageContext): BombParts {
  const res = createSceneResources(ctx.root, ctx.origin, 'cg-bomb');
  const short = Math.min(ctx.width, ctx.height);
  const blast = short * 0.22;
  const groundY = -ctx.height * 0.42;

  // ⑦ 压力变形：铺满全屏，只在边缘可见，第二幕最强。
  const warp = res.track(createAdditivePlaneMaterial({
    uniforms: {
      uColor: { value: ctx.color.clone() },
      uTime: { value: 0 },
      uStrength: { value: 0 },
    },
    fragmentShader: WARP_FRAGMENT,
  }));
  const warpMesh = res.mesh(
    'pressure-warp',
    new THREE.PlaneGeometry(ctx.width * 1.3, ctx.height * 1.3),
    warp,
  );
  warpMesh.position.z = 30;
  res.group.add(warpMesh);

  // ⑥ 全屏闪光：初始白闪，盖住整屏。
  const flash = res.mesh(
    'blast-flash',
    new THREE.PlaneGeometry(ctx.width * 1.4, ctx.height * 1.4),
    additiveMaterial('#FFFFFF'),
  );
  flash.position.z = 34;
  res.group.add(flash);

  // ⑨ 地面焦圈：贴地椭圆焦痕，与刚体地面同高。
  const scorchMaterial = additiveMaterial('#42160B');
  scorchMaterial.side = THREE.DoubleSide;
  scorchMaterial.blending = THREE.NormalBlending;
  const scorch = res.mesh(
    'scorch-ring',
    new THREE.TorusGeometry(blast * 1.15, blast * 0.3, 6, 72),
    scorchMaterial,
  );
  // 躺平贴地：绕 x 转 90° 后环面与地面共面。
  scorch.rotation.x = -Math.PI / 2;
  scorch.position.set(0, groundY, -4);
  scorch.scale.set(1, 1, 0.34);
  res.group.add(scorch);

  // ④ 浓烟蘑菇云：柄底压在爆心，冠部向上占据上半屏。
  const smokeMaterial = res.track(createBlendedPlaneMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#4A4640') },
      uTime: { value: 0 },
      uDensity: { value: 0 },
      uGaps: { value: 0 },
      uRise: { value: 0 },
    },
    fragmentShader: SMOKE_FRAGMENT,
  }));
  // 用薄板而非纯平面：烟是有厚度的体，碎片要能真的「穿进去」。
  // 前后两面各渲一次 FBM，叠加出的视差正好读作体积感。
  const smoke = res.mesh(
    'mushroom-cloud',
    new THREE.BoxGeometry(ctx.width * 0.78, ctx.height * 0.62, blast * 1.1),
    smokeMaterial,
  );
  smoke.position.z = 6;
  res.group.add(smoke);

  // ① 炸弹外壳：引信幕里可见的黑球，爆开瞬间消失。
  const shell = res.mesh(
    'bomb-shell',
    new THREE.SphereGeometry(blast * 0.3, 24, 18),
    new THREE.MeshBasicMaterial({ color: 0x14100f, transparent: true, opacity: 1, depthWrite: false }),
  );
  shell.position.z = 12;
  res.group.add(shell);

  // ① 引信火花：壳顶的预燃亮点。
  const fuse = res.mesh(
    'fuse-spark',
    new THREE.SphereGeometry(blast * 0.075, 12, 10),
    additiveMaterial(CORE_COLOR),
  );
  fuse.position.set(blast * 0.1, blast * 0.36, 16);
  res.group.add(fuse);

  // ② 火球：膨胀 + 被冲击波压扁，卷动交给自转与粒子层。
  const fireball = res.mesh(
    'fireball',
    new THREE.SphereGeometry(blast * 0.62, 30, 22),
    additiveMaterial(CORE_COLOR),
  );
  fireball.position.z = 10;
  fireball.scale.setScalar(0.001);
  res.group.add(fireball);

  // ③ 冲击波球环：透明环急扩，最终触达四缘。
  const shockMaterial = additiveMaterial('#FFF6E4');
  shockMaterial.side = THREE.DoubleSide;
  const shockR = blast * 0.9;
  const shockTube = blast * 0.1;
  const shockwave = res.mesh(
    'shockwave',
    new THREE.TorusGeometry(shockR, shockTube, 8, 96),
    shockMaterial,
  );
  shockwave.position.z = 20;
  shockwave.scale.setScalar(0.001);
  res.group.add(shockwave);

  // ⑧ 灰烬雨：铺满全屏宽度，各自从云顶落向地面。
  const ashGroup = new THREE.Group();
  ashGroup.name = 'ash-rain';
  ashGroup.position.z = 24;
  res.group.add(ashGroup);

  const ashGeometry = res.track(new THREE.PlaneGeometry(blast * 0.035, blast * 0.055));
  const ashMaterial = res.track(new THREE.MeshBasicMaterial({
    color: 0x8d8579, transparent: true, opacity: 0, depthWrite: false,
  }));
  const ashCount = scaledCount(150, ctx.quality);
  const ash: AshFlake[] = [];
  for (let i = 0; i < ashCount; i += 1) {
    const mesh = new THREE.Mesh(ashGeometry, ashMaterial);
    mesh.name = `ash-${i}`;
    // 哈希散布而非等距：等距会显出可见的列阵。
    const x = ((((i * 61) % 199) / 199) - 0.5) * ctx.width * 1.02;
    mesh.position.set(x, 0, 0);
    ashGroup.add(mesh);
    ash.push({
      mesh,
      x,
      phase: ((i * 37) % 100) / 100,
      rate: 0.7 + (((i * 53) % 100) / 100) * 0.7,
      spin: 0.5 + (((i * 29) % 100) / 100) * 2.2,
    });
  }

  return {
    res, blast, groundY, shell, fuse, fireball, shockwave,
    shockOuter: shockR + shockTube,
    smoke, warp, flash, scorch, ash,
    ashFloorY: groundY,
  };
}
