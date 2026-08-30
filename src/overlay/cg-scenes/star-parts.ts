/**
 * 场景 14 star 的主结构件搭建（SDF 星体、星轨、光晕、环波、彩蛋染色片）。
 *
 * 点状层（背景小星星 / 剥落星点 / 残星点）在 ./star-field，
 * 星屑刚体在 ./star-grit。
 *
 * 命名规则：不同性质的前缀**互不包含**，避免前缀匹配的断言测错对象
 * （本项目真实事故：`shard-` 同时命中刚体与反光片，物理断言实际测的是
 * 抄位置的贴片）。全场是 `ray-N` 星轨 / `tip-N` 轨顶锚点 / `halo-N` 光晕 /
 * `hoop-N` 环波 / `speck-N` 剥落星点 / `relic-N` 残星点 / `grit-N` 星屑刚体，
 * 两两都不是彼此的前缀，`^x-\d+$` 全形正则可精确区分。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial } from '../cg-shaders';
import {
  STAR_BODY_FRAGMENT, STAR_HALO_FRAGMENT, STAR_HOOP_FRAGMENT, STAR_RAY_FRAGMENT,
} from './star-shaders';
import {
  buildRelics, buildSpecks, buildTwinkleField,
  type StarRelic, type StarSpeck, type Tint,
} from './star-field';
import { AXIS_COUNT, HOOP_COUNT, axisAngle, axisDirection, starReach, starScale } from './star-signature';

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

/** 光晕层数（规格④「径向辉光多层」）。 */
export const HALO_LAYERS = 3;

export type StarRay = {
  readonly mesh: ShaderMesh;
  /** 轨顶锚点：quarks emitter 会被 BatchedRenderer 摘出场景树，靠它镜像位置。 */
  readonly tip: THREE.Object3D;
  readonly index: number;
  readonly dir: THREE.Vector2;
};

export type StarParts = {
  readonly res: SceneResources;
  readonly core: ShaderMesh;
  readonly rays: StarRay[];
  readonly halos: ShaderMesh[];
  readonly hoops: ShaderMesh[];
  readonly twinkle: THREE.InstancedMesh;
  readonly twinkleSeeds: Float32Array;
  readonly chroma: ShaderMesh;
  readonly specks: StarSpeck[];
  readonly relics: StarRelic[];
  /** 全部会随彩蛋换色的颜色对象，彩蛋帧整体位移色相。 */
  readonly tints: Tint[];
  readonly reach: number;
  readonly scale: number;
  /** 星轨贴片的基准长度（scale.y=1 时的像素长度）。 */
  readonly rayBase: number;
  /** 地面高度（局部坐标），星屑在此反弹。 */
  readonly groundY: number;
};

/** 建 star 场景的全部元素。 */
export function buildStarParts(ctx: CgStageContext): StarParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'star-scene');
  const reach = starReach(width, height);
  const scale = starScale(width, height);
  const rayBase = reach;
  const groundY = -height * 0.34;

  // 星色：素材色往星芒的金白推，核心近白，环波偏冷。
  const gold = color.clone().lerp(new THREE.Color('#FFE9A8'), 0.62);
  const white = color.clone().lerp(new THREE.Color('#FFFFFF'), 0.82);
  const cool = color.clone().lerp(new THREE.Color('#BFD8FF'), 0.5);
  const tints: Tint[] = [];
  const tint = (live: THREE.Color): THREE.Color => {
    tints.push({ base: live.clone(), live });
    return live;
  };

  // ⑤ 小星星点缀：最先建，保证叠在最后面。
  const { twinkle, twinkleSeeds } = buildTwinkleField(res, ctx);

  // ⑥ 环状波：三圈横向环，压在星体之后。
  const hoops: ShaderMesh[] = [];
  for (let i = 0; i < HOOP_COUNT; i += 1) {
    const mesh = res.mesh(
      `hoop-${i}`,
      new THREE.PlaneGeometry(width * 2.2, height * 2.2),
      createAdditivePlaneMaterial({
        fragmentShader: STAR_HOOP_FRAGMENT,
        uniforms: {
          uColor: { value: tint(cool.clone()) },
          uAlpha: { value: 0 },
          uRadius: { value: 0 },
          uThickness: { value: 0.02 },
          uSquash: { value: 0.34 },
        },
      }),
    );
    mesh.position.z = -24 + i;
    res.group.add(mesh);
    hoops.push(mesh);
  }

  // ④ 光晕层：内层紧、外层散，三层叠出体积。
  const halos: ShaderMesh[] = [];
  for (let i = 0; i < HALO_LAYERS; i += 1) {
    const span = reach * (0.9 + i * 0.85);
    const mesh = res.mesh(
      `halo-${i}`,
      new THREE.PlaneGeometry(span * 2, span * 2),
      createAdditivePlaneMaterial({
        fragmentShader: STAR_HALO_FRAGMENT,
        uniforms: {
          uColor: { value: tint((i === 0 ? white : gold).clone()) },
          uAlpha: { value: 0 },
          uFalloff: { value: 0.16 + i * 0.2 },
          uRim: { value: 0.34 + i * 0.22 },
        },
      }),
    );
    mesh.position.z = -18 + i;
    res.group.add(mesh);
    halos.push(mesh);
  }

  // ② 星轨：五条主轴，同宽同基长——轨与轨的差异只可能来自
  // axisLength 的统一输出，而它不接受轴索引，所以差异不存在。
  const rays: StarRay[] = [];
  for (let i = 0; i < AXIS_COUNT; i += 1) {
    const mesh = res.mesh(
      `ray-${i}`,
      new THREE.PlaneGeometry(reach * 0.24, rayBase),
      createAdditivePlaneMaterial({
        fragmentShader: STAR_RAY_FRAGMENT,
        uniforms: {
          uColor: { value: tint(gold.clone()) },
          uHeadColor: { value: white.clone() },
          uAlpha: { value: 0 },
          uHead: { value: 0 },
        },
      }),
    );
    // 贴片 +y 对齐主轴：根在星心、顶在 dir*len。
    mesh.rotation.z = axisAngle(i) - Math.PI / 2;
    mesh.position.z = 4;
    res.group.add(mesh);

    const tip = new THREE.Object3D();
    tip.name = `tip-${i}`;
    res.group.add(tip);

    const d = axisDirection(i);
    rays.push({ mesh, tip, index: i, dir: new THREE.Vector2(d.x, d.y) });
  }

  // ① 五芒星体：SDF 星形，五个尖角与五条轨同源于 72° 等分。
  const core = res.mesh(
    'star-core',
    new THREE.PlaneGeometry(scale * 6, scale * 6),
    createAdditivePlaneMaterial({
      fragmentShader: STAR_BODY_FRAGMENT,
      uniforms: {
        uColor: { value: tint(gold.clone()) },
        uCoreColor: { value: white.clone() },
        uAlpha: { value: 0 },
        uCharge: { value: 0 },
        uSpin: { value: 0 },
      },
    }),
  );
  core.position.z = 10;
  res.group.add(core);

  // 互动① 剥落小星点 / ⑧ 残星点。
  const specks = buildSpecks(res, ctx, scale, tint, white);
  const relics = buildRelics(res, ctx, scale, reach, tint, gold);

  // ⑦ 色彩微突变：彩蛋帧的整屏染色片，平时完全隐形。
  const chroma = res.mesh(
    'chroma-flash',
    new THREE.PlaneGeometry(width * 1.4, height * 1.4),
    createAdditivePlaneMaterial({
      fragmentShader: STAR_HALO_FRAGMENT,
      uniforms: {
        uColor: { value: tint(white.clone()) },
        uAlpha: { value: 0 },
        uFalloff: { value: 0.85 },
        uRim: { value: 0.7 },
      },
    }),
  );
  chroma.position.z = 16;
  res.group.add(chroma);

  return {
    res, core, rays, halos, hoops, twinkle, twinkleSeeds,
    chroma, specks, relics, tints, reach, scale, rayBase, groundY,
  };
}
