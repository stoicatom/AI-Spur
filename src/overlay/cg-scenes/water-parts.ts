/**
 * 场景 12 water 的元素搭建（规格 §4.2 场景 12 的八元素）。
 *
 * 与编排分离：本文件只负责「把元素立起来」，三幕动作在 cg-water.ts。
 * 水珠/白沫在 ./water-droplets（自带闭式弹道模型），
 * 拆分理由是 CLAUDE.md 的 250 行上限，也让元素清单能一眼对照规格。
 */
import * as THREE from 'three';
import type { World } from 'cannon-es';
import type { CgStageContext } from '../cg-scene';
import { VOLUME_CLOUD_FRAGMENT, createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import { createSceneResources, type SceneResources } from '../cg-scene-kit';
import { MATERIAL_IDENTITIES } from '../material-identity';
import {
  BED_CAUSTIC_FRAGMENT, RAINBOW_FRINGE_FRAGMENT, RIPPLE_FRAGMENT, WATER_COLUMN_FRAGMENT,
} from './water-shaders';
import { columnGeometry } from './water-geometry';
import { buildDropletField, type DropletField } from './water-droplets';
import { buildPebbleBed, type Pebble } from './water-pebbles';

export type { Pebble };

/** 一圈涟漪：贴面环 mesh + 它绑定的水珠序号（互动因果的连线）。 */
export type Ripple = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /**
   * 激起这圈涟漪的水珠序号。
   *
   * 涟漪的启动时刻与圆心**都**从这颗水珠读，而非各自定时/定点：
   * 换句话说，「水珠落地激起涟漪」是一条数据依赖，不是两条各演各的曲线。
   */
  sourceIndex: number;
};

export type WaterParts = {
  res: SceneResources;
  /** ① 水柱。 */
  column: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** 水柱满高（像素）。 */
  columnHeight: number;
  /** ②⑦ 水珠与水花白边。 */
  drops: DropletField;
  /** ③ 涟漪环（贴面 ×3）。 */
  rippleGroup: THREE.Group;
  ripples: Ripple[];
  /** ④ 水雾。 */
  mist: THREE.Group;
  mistLayers: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[];
  /** ⑤ 底光。 */
  bedLight: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** ⑥ 鹅卵石。 */
  pebbleGroup: THREE.Group;
  pebbles: Pebble[];
  world: World;
  /** ⑧ 虹影。 */
  fringe: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** 水面高度：触底、涟漪、卵石地面共用这一条基准线。 */
  surfaceY: number;
  /** 重力加速度（正值 px/s²），水珠闭式弹道与刚体世界共用同一个值。 */
  gravity: number;
};

/** 涟漪圈数：规格明写「贴面环×3」。 */
const RIPPLE_RINGS = 3;

export function buildWaterParts(ctx: CgStageContext): WaterParts {
  const res = createSceneResources(ctx.root, new THREE.Vector3(), 'cg-water');
  const { width, height, color } = ctx;
  const short = Math.min(width, height);
  // gravity 签名（-.2）是水的「浮」偏置，叠在屏幕尺度的基准重力上。
  const buoyancy = MATERIAL_IDENTITIES.water.physical.gravity;

  // 水面压在屏幕下方 32%：柱顶要够高度涌起，水珠也要有落差走完抛物线。
  const surfaceY = -height * 0.32;
  const columnHeight = height * 0.58;
  // 重力用像素量纲（正交相机下 1 世界单位 = 1px），不能拿签名当唯一量级用。
  const gravity = short * 2.6 * (1 + buoyancy);

  // ⑤ 底光：最先建、压在最底层，池底焦散在所有水体之下。
  const bedLight = res.mesh(
    'bed-light',
    new THREE.PlaneGeometry(width * 1.25, height * 0.46),
    createAdditivePlaneMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#3FC8FF') },
        uTime: { value: 0 },
        uEnergy: { value: 0 },
      },
      fragmentShader: BED_CAUSTIC_FRAGMENT,
    }),
  );
  bedLight.position.set(0, surfaceY - height * 0.16, -60);
  res.group.add(bedLight);

  // ① 水柱（签名载体）：锚底几何体，高度由 scale.y 表达，
  // 因此「涌起」在场景树里是真实高度而非只有 shader 内部的进度值。
  const column = res.mesh(
    'water-column',
    columnGeometry(short * 0.34),
    createAdditivePlaneMaterial({
      uniforms: {
        uColor: { value: color.clone() },
        uCrest: { value: new THREE.Color('#EAFBFF') },
        uTime: { value: 0 },
        uRise: { value: 0 },
        uBreak: { value: 0 },
      },
      fragmentShader: WATER_COLUMN_FRAGMENT,
    }),
  );
  column.position.set(0, surfaceY, 14);
  column.scale.y = 0.001;
  res.group.add(column);

  // ②⑦ 水珠与白沫。
  const drops = buildDropletField(res, ctx, surfaceY, columnHeight, gravity);

  // ③ 涟漪环：贴着水面的三圈波前。每圈绑一颗水珠（见 Ripple.sourceIndex）。
  const rippleGroup = new THREE.Group();
  rippleGroup.name = 'ripple-rings';
  rippleGroup.position.z = 8;
  res.group.add(rippleGroup);

  const ripples: Ripple[] = [];
  for (let i = 0; i < RIPPLE_RINGS; i += 1) {
    const mesh = res.mesh(
      `ripple-${i}`,
      new THREE.PlaneGeometry(short * (0.7 + i * 0.24), short * (0.24 + i * 0.08)),
      createAdditivePlaneMaterial({
        uniforms: {
          uColor: { value: new THREE.Color('#9FE6FF') },
          uRadius: { value: 0 },
          uFade: { value: 0 },
        },
        fragmentShader: RIPPLE_FRAGMENT,
      }),
    );
    mesh.position.set(0, surfaceY, i * 0.5);
    rippleGroup.add(mesh);
    // 绑定序号在构建期定下，运行期只读——因果连线不会被逐帧逻辑改写。
    ripples.push({ mesh, sourceIndex: -1 });
  }

  // ④ 水雾：三层错位漂移。单层雾只是一块贴图，层间速度差才有厚度。
  const mist = new THREE.Group();
  mist.name = 'water-mist';
  mist.position.z = -18;
  res.group.add(mist);

  const mistLayers = [0, 1, 2].map((i) => {
    const mesh = res.mesh(
      `mist-layer-${i}`,
      // 每层都盖满全屏：雾的「分层」是深度上的，不是把屏幕切成三块。
      new THREE.PlaneGeometry(width * (1.12 + i * 0.14), height * (1.08 + i * 0.12)),
      createBlendedPlaneMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(i === 0 ? '#8FCEE8' : '#B6E4F5') },
          uFlashColor: { value: new THREE.Color('#F4FEFF') },
          uTime: { value: 0 },
          uDensity: { value: 0 },
          uFlash: { value: 0 },
        },
        fragmentShader: VOLUME_CLOUD_FRAGMENT,
      }),
    );
    mist.add(mesh);
    return mesh;
  });

  // ⑥ 鹅卵石：刚体层（含池底静态平面与碰撞分组）见 ./water-pebbles。
  const bed = buildPebbleBed(res, ctx, surfaceY, gravity);

  // ⑧ 虹影：屏缘色散微光，最外层。
  const fringe = res.mesh(
    'rainbow-fringe',
    new THREE.PlaneGeometry(width * 1.5, height * 1.5),
    createAdditivePlaneMaterial({
      uniforms: { uAlpha: { value: 0 }, uSpread: { value: 0 } },
      fragmentShader: RAINBOW_FRINGE_FRAGMENT,
    }),
  );
  fringe.position.z = 44;
  res.group.add(fringe);

  return {
    res, column, columnHeight, drops, rippleGroup, ripples,
    mist, mistLayers, bedLight,
    pebbleGroup: bed.group, pebbles: bed.pebbles, world: bed.world,
    fringe, surfaceY, gravity,
  };
}
