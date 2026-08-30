/**
 * 场景 33 wildfire 的元素搭建。
 *
 * 命名规则：不同性质的节点前缀互不包含（`clump-N` 火舌簇 /
 * `charpatch-N` 焦土余烬 / `gustline-N` 风线），避免前缀匹配的断言测错
 * 对象（本项目 cg-scene 命名撞车踩过这个坑）。
 *
 * 火舌簇的数量**不过** `scaledCount`：它们是签名的载体（每簇的点燃时刻
 * 是其横坐标的函数），低档裁掉几簇会让「一簇一簇烧过去」的可测内涵
 * 变稀。密度降档落在火星与风线两层粒子上。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createSceneResources, additiveMaterial, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import { scaledCount } from '../cg-particle-kit';
import { FRONT_X_END, FRONT_X_START } from './wildfire-front';
import {
  WILDFIRE_FRONT_FRAGMENT,
  WILDFIRE_GRASS_FRAGMENT,
  WILDFIRE_HEAT_FRAGMENT,
  WILDFIRE_SMOKE_FRAGMENT,
} from './wildfire-shaders';

/**
 * 火舌簇数（③ 火舌浪）。
 *
 * 签名载体：每簇独立按 `igniteAt(x)` 点燃。9 簇铺满推进区间，足以让
 * 「依次点燃」在画面上读出来，又不至于挤成一片。
 */
export const CLUMP_COUNT = 9;
/** 焦土余烬斑数（⑧ 地面余烬）：火线过后留下的暗红炭迹。 */
export const CHAR_PATCH_COUNT = 7;
/** 风线条数（⑦ 风助火力的可见化）。 */
export const GUST_LINE_COUNT = 5;

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
type BasicMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

/** 一簇火：自带横坐标，点燃时刻由它决定（签名）。 */
export type FlameClump = {
  readonly mesh: BasicMesh;
  /** 该簇横坐标（屏宽比例）——它的点燃时刻是这个数的函数。 */
  readonly x: number;
  /** 高度抖动相位，让各簇不同步地摆。 */
  readonly phase: number;
};

/** 一块焦土：记录它所在横坐标，据此判断是否已被烧过。 */
export type CharPatch = {
  readonly mesh: BasicMesh;
  readonly x: number;
  readonly yOffset: number;
};

/** 一条风线：可见化风向与风速。 */
export type GustLine = {
  readonly mesh: BasicMesh;
  readonly y: number;
  readonly phase: number;
};

export type WildfireParts = {
  readonly res: SceneResources;
  readonly grass: ShaderMesh;
  readonly front: ShaderMesh;
  readonly heat: ShaderMesh;
  readonly smoke: ShaderMesh;
  readonly clumps: FlameClump[];
  readonly charPatches: CharPatch[];
  readonly gustLines: GustLine[];
  readonly width: number;
  readonly height: number;
  readonly short: number;
  readonly groundY: number;
};

/** 把屏宽比例换成局部像素 x。 */
export function toPixelX(ratio: number, width: number): number {
  return ratio * width;
}

/** 建 wildfire 场景的全部元素（火星粒子层在 cg-wildfire.ts 里经 hub 建）。 */
export function buildWildfireParts(ctx: CgStageContext): WildfireParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'wildfire-scene');
  const short = Math.min(width, height);
  const groundY = -height * 0.3;

  const fire = color.clone().lerp(new THREE.Color('#FF5A12'), 0.8);
  const core = color.clone().lerp(new THREE.Color('#FFD24A'), 0.72);
  const grassColor = new THREE.Color('#3C5A28');
  const charColor = new THREE.Color('#17120E');
  const smokeColor = new THREE.Color('#6E675E');

  // ② 草地层：铺满地面带，最先建所以压在最底层。用常规混合而非叠加
  // ——焦土必须能**压暗**背景，叠加只会越画越亮。
  const grass = res.mesh(
    'grass-field',
    new THREE.PlaneGeometry(width, height * 0.44),
    createBlendedPlaneMaterial({
      fragmentShader: WILDFIRE_GRASS_FRAGMENT,
      uniforms: {
        uGrassColor: { value: grassColor },
        uCharColor: { value: charColor },
        uFront: { value: 0 },
        uAlpha: { value: 0 },
        uCharSpan: { value: 0.03 },
      },
    }),
  );
  grass.position.set(0, groundY - height * 0.06, -24);
  res.group.add(grass);

  // ⑧ 地面余烬：火线过后留下的暗红炭斑，沿推进区间铺开。
  const charPatches: CharPatch[] = [];
  for (let i = 0; i < CHAR_PATCH_COUNT; i += 1) {
    const geometry = res.track(new THREE.CircleGeometry(short * (0.016 + (i % 3) * 0.006), 14));
    const material = res.track(additiveMaterial('#FF3A08'));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `charpatch-${i}`;
    // 均匀落在火线走过的区间内，各自略有高低（地面起伏）。
    const x = FRONT_X_START + (FRONT_X_END - FRONT_X_START) * (i / (CHAR_PATCH_COUNT - 1));
    const yOffset = ((i * 31) % 5) * short * 0.008;
    mesh.position.set(toPixelX(x, width), groundY + yOffset, -20);
    res.group.add(mesh);
    charPatches.push({ mesh, x, yOffset });
  }

  // ① 火线蔓延：横贯整个推进区间的一条带。
  const front = res.mesh(
    'fire-front',
    new THREE.PlaneGeometry(width, height * 0.3),
    createAdditivePlaneMaterial({
      fragmentShader: WILDFIRE_FRONT_FRAGMENT,
      uniforms: {
        uColor: { value: fire },
        uCoreColor: { value: core },
        uFront: { value: 0 },
        uTime: { value: 0 },
        uAlpha: { value: 0 },
        uLean: { value: 0 },
        uWidth: { value: 0.12 },
      },
    }),
  );
  front.position.set(0, groundY + height * 0.15, -16);
  res.group.add(front);

  // ③ 火舌浪：沿推进区间排开的 9 簇火。每簇的点燃时刻由它的横坐标
  // 决定（签名），所以这里必须记住各自的 x。
  const clumps: FlameClump[] = [];
  for (let i = 0; i < CLUMP_COUNT; i += 1) {
    const geometry = res.track(new THREE.PlaneGeometry(short * 0.075, short * 0.16));
    const material = res.track(additiveMaterial(fire));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `clump-${i}`;
    const x = FRONT_X_START + (FRONT_X_END - FRONT_X_START) * (i / (CLUMP_COUNT - 1));
    mesh.position.set(toPixelX(x, width), groundY + short * 0.06, -14 + i * 0.1);
    res.group.add(mesh);
    clumps.push({ mesh, x, phase: (i * 2.399963) % (Math.PI * 2) });
  }

  // ⑦ 风助火力：几条横向流线，可见化风向与风速。
  // 这一层是纯装饰（风速本身由 windGust 表达，不靠线条条数），所以由它
  // 承担降档的密度缩减；签名载体（clumps / charPatches）保持满数。
  const gustLines: GustLine[] = [];
  const gustCount = scaledCount(GUST_LINE_COUNT, ctx.quality);
  for (let i = 0; i < gustCount; i += 1) {
    const geometry = res.track(new THREE.PlaneGeometry(short * 0.3, Math.max(1.2, short * 0.004)));
    const material = res.track(additiveMaterial('#D8E4F0'));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `gustline-${i}`;
    // 条数变少时仍要铺满同一条风带，不能只剩贴地的一根。
    const spread = gustCount === 1 ? 0.15 : (i / (gustCount - 1)) * 0.3;
    const y = groundY + short * (0.05 + spread);
    mesh.position.set(0, y, -12);
    res.group.add(mesh);
    gustLines.push({ mesh, y, phase: (i * 1.7) % (Math.PI * 2) });
  }

  // ⑤ 烟柱：火线上方斜升的浓烟。常规混合——烟要能遮住背后的东西。
  const smoke = res.mesh(
    'smoke-column',
    new THREE.PlaneGeometry(short * 0.6, height * 0.62),
    createBlendedPlaneMaterial({
      fragmentShader: WILDFIRE_SMOKE_FRAGMENT,
      uniforms: {
        uColor: { value: smokeColor },
        uTime: { value: 0 },
        uHeight: { value: 0 },
        uLean: { value: 0 },
        uAlpha: { value: 0 },
      },
    }),
  );
  smoke.position.set(0, groundY + height * 0.31, -10);
  res.group.add(smoke);

  // ④ 热浪扭曲：压在最上层，覆盖火线上方一带。
  const heat = res.mesh(
    'heat-warp',
    new THREE.PlaneGeometry(width, height * 0.4),
    createAdditivePlaneMaterial({
      fragmentShader: WILDFIRE_HEAT_FRAGMENT,
      uniforms: {
        uColor: { value: fire },
        uFront: { value: 0 },
        uTime: { value: 0 },
        uStrength: { value: 0 },
        uAlpha: { value: 0 },
      },
    }),
  );
  heat.position.set(0, groundY + height * 0.2, -6);
  res.group.add(heat);

  return {
    res, grass, front, heat, smoke, clumps, charPatches, gustLines,
    width, height, short, groundY,
  };
}
