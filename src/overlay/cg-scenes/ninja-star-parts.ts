/**
 * 场景 05 ninja-star 的元素搭建（规格 §4.2 场景 05 的八元素）。
 *
 * 与编排分离：本文件只把元素立起来，三幕动作在 cg-ninja-star.ts。
 *
 * 命名规则：不同性质的节点前缀**互不包含**——`ghost-N`（残影层）/
 * `sparkbit-N`（落地火星）/ `rimline-N`（屏边冲击纹）。前缀撞车会让断言
 * 测错对象却照样通过（本项目真出过 `shard-` 同时命中刚体与反光片的事故）。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { additiveMaterial, createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial } from '../cg-shaders';
import { buildGhostRing, type GhostRing } from './shuriken-ghosts';
import {
  NINJA_MOON_FRAGMENT,
  NINJA_TRAIL_FRAGMENT,
  NINJA_WHISTLE_FRAGMENT,
  SHURIKEN_BODY_FRAGMENT,
} from './ninja-star-shaders';

/** ⑦ 屏边冲击纹的环数：细线环，三圈错峰。 */
export const RIM_LINES = 3;

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
type RingMesh = THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;

export type NinjaStarParts = {
  readonly res: SceneResources;
  /** ① 手里剑本体（四刃星形，③ 反光扫掠同在这层材质里）。 */
  readonly body: ShaderMesh;
  /** ② 残影环：5 层 ghost。 */
  readonly ghosts: GhostRing;
  /** ④ 回旋轨迹光带：沿环铺开的发光带。 */
  readonly trail: ShaderMesh;
  /** ⑤ 月轮：满月 + 月晕。 */
  readonly moon: ShaderMesh;
  /** ⑦ 屏边冲击纹：细线环。 */
  readonly rims: readonly RingMesh[];
  /** ⑧ 风切声纹：贴轨迹的细线组。 */
  readonly whistle: ShaderMesh;
  /** 环的世界尺度（归一化环坐标 × 它 = 场景坐标）。 */
  readonly orbitScale: THREE.Vector2;
  /** 掷出点（环的起点，场景局部坐标）。 */
  readonly center: THREE.Vector2;
  /** 本体基准尺寸（世界单位）。 */
  readonly bodySize: number;
  readonly short: number;
  /** 地面高度（火星弹跳用）。 */
  readonly groundY: number;
};

/**
 * 建 ninja-star 场景的可见元素（⑥ 落地火星的刚体层在 ./ninja-star-sparks）。
 *
 * @param ctx 场景上下文
 */
export function buildNinjaStarParts(ctx: CgStageContext): NinjaStarParts {
  const { width, height, color, direction } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'cg-ninja-star');
  const short = Math.min(width, height);
  const groundY = -height * 0.44;

  // 掷出方向：触发方向的横向分量决定回旋绕向，零向量时向右。
  const hand = direction.x >= 0 ? 1 : -1;

  // 深夜月下的配色：钢刃冷白，月光暖白，轨迹带偏青。
  const steel = color.clone().lerp(new THREE.Color('#D8E4F2'), 0.74);
  const hot = color.clone().lerp(new THREE.Color('#FFFFFF'), 0.86);
  const moonTone = new THREE.Color('#F2EAD3');
  const haloTone = new THREE.Color('#8FA6C8');
  const trailTone = color.clone().lerp(new THREE.Color('#7FE8FF'), 0.66);

  // 回旋椭圆横跨全屏（规格「回旋椭圆横跨全屏」）：环的 x 半幅已归一化成
  // 「最远距离 = 1」，所以 scale.x 直接取到屏外。
  const orbitScale = new THREE.Vector2(hand * width * 0.86, height * 0.72);
  // 掷出点在下方偏一侧：回旋出去、绕场、回到手边。
  const center = new THREE.Vector2(-hand * width * 0.3, -height * 0.26);
  const bodySize = short * 0.11;

  // ⑤ 月轮：铺在最底层的背景，占据上方偏另一侧（与掷出点分处两端）。
  const moonSize = short * 0.9;
  const moon = res.mesh(
    'moon-disc',
    new THREE.PlaneGeometry(moonSize, moonSize),
    createAdditivePlaneMaterial({
      fragmentShader: NINJA_MOON_FRAGMENT,
      uniforms: {
        uColor: { value: moonTone },
        uHaloColor: { value: haloTone },
        uAlpha: { value: 0 },
        uEclipse: { value: 0 },
      },
    }),
  );
  moon.position.set(hand * width * 0.22, height * 0.2, -30);
  res.group.add(moon);

  // ④ 回旋轨迹光带：一张覆盖整个环包围盒的贴片，shader 按 uv.x 当环占比。
  // 用单张贴片而非逐段 mesh：光带是连续的一条，分段会在接缝处露出断口。
  const trail = res.mesh(
    'orbit-trail',
    new THREE.PlaneGeometry(width * 2.1, height * 1.7),
    createAdditivePlaneMaterial({
      fragmentShader: NINJA_TRAIL_FRAGMENT,
      uniforms: {
        uColor: { value: trailTone },
        uHotColor: { value: hot },
        uAlpha: { value: 0 },
        uHead: { value: 0 },
        uCusp0: { value: 0 },
        uCusp1: { value: 0 },
        uGlow: { value: 0 },
      },
    }),
  );
  trail.position.set(0, 0, -14);
  res.group.add(trail);

  // ⑧ 风切声纹：与光带同尺寸的一层，贴在轨迹上方。
  const whistle = res.mesh(
    'wind-whistle',
    new THREE.PlaneGeometry(width * 2.1, height * 1.7),
    createAdditivePlaneMaterial({
      fragmentShader: NINJA_WHISTLE_FRAGMENT,
      uniforms: {
        uColor: { value: hot },
        uAlpha: { value: 0 },
        uHead: { value: 0 },
        uSpeed: { value: 0 },
        uPhase: { value: 0 },
      },
    }),
  );
  whistle.position.set(0, 0, -10);
  res.group.add(whistle);

  // ① 手里剑本体：四刃星形贴片（③ 反光扫掠是它材质里的 uSweep）。
  const bodyGeometry = res.track(new THREE.PlaneGeometry(1, 1));
  const body = res.mesh(
    'shuriken-body',
    bodyGeometry,
    createAdditivePlaneMaterial({
      fragmentShader: SHURIKEN_BODY_FRAGMENT,
      uniforms: {
        uColor: { value: steel },
        uHiColor: { value: hot },
        uAlpha: { value: 0 },
        uSweep: { value: 0 },
        uSharp: { value: 0 },
      },
    }),
  );
  body.position.z = 12;
  body.scale.setScalar(bodySize);
  // ③ 金属反光扫掠：高光相位挂在本体材质的 uSweep 上，另立一个空锚点作为
  // 该元素的可观测句柄（同 revolver 的 flame-anchor 处置），便于逐元素验收。
  const sweepAnchor = new THREE.Object3D();
  sweepAnchor.name = 'metal-sweep';
  body.add(sweepAnchor);

  // ② 残影环：与本体**同几何体、同 shader**——残影是同一个东西的历史像，
  // 不是另画一个简化形状。建在本体之前挂树，保证残影压在本体后面。
  const ghosts = buildGhostRing(res, bodyGeometry, SHURIKEN_BODY_FRAGMENT, steel, hot);
  res.group.add(body);

  // ⑦ 屏边冲击纹：细线环，从屏心向外扩到屏缘。
  const rims: RingMesh[] = [];
  for (let i = 0; i < RIM_LINES; i += 1) {
    const radius = short * (0.42 + i * 0.05);
    const mesh = res.mesh(
      `rimline-${i}`,
      new THREE.RingGeometry(radius, radius + Math.max(1.2, short * 0.0022), 96),
      additiveMaterial(hot),
    );
    mesh.position.z = -6;
    res.group.add(mesh);
    rims.push(mesh);
  }

  return {
    res, body, ghosts, trail, moon, rims, whistle,
    orbitScale, center, bodySize, short, groundY,
  };
}
