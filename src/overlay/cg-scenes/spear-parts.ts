/**
 * 场景 27 spear 的元素搭建（规格 §4.2 场景 27 的八元素）。
 *
 * 与编排分离：本文件只把元素立起来，三幕动作在 cg-spear.ts（250 行上限）。
 *
 * 命名规则：不同性质的节点前缀**互不包含**——`swirl-mote-N`（气流点）/
 * `flexbead-N`（杆身驻波采样珠）/ `shockring-N`（命中震荡环）/
 * `tearpuff-N`（被撕开的尘团）。前缀撞车会让断言测错对象却照样通过
 * （本项目真出过 `shard-` 同时命中刚体与反光片的事故）。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { additiveMaterial, createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import { buildSwirl, type SwirlField } from './spear-swirl';
import {
  SPEAR_BOARD_FRAGMENT,
  SPEAR_DUST_FRAGMENT,
  SPEAR_FLARE_FRAGMENT,
  SPEAR_RIP_FRAGMENT,
  TEAR_SEGMENTS,
} from './spear-shaders';

/** 命中震荡环数。 */
export const SHOCK_RINGS = 3;
/** 杆身驻波采样珠数：杆被离散成这么多段，端点各占一颗。 */
export const FLEX_BEADS = 11;
/** 被撕开的尘团数（沿矛路分布）。 */
export const TEAR_PUFFS = 7;

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
type BeadMesh = THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
type RingMesh = THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;

export type SpearParts = {
  readonly res: SceneResources;
  /** ① 矛 mesh 的容器：枪头 + 杆 + 驻波珠都挂在它下面，整体随弹道平移。 */
  readonly spear: THREE.Group;
  readonly head: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  readonly shaft: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  /** ⑤ 矛杆震动：沿杆的采样珠，位移由驻波给（两端恒为零）。 */
  readonly beads: readonly BeadMesh[];
  readonly swirl: SwirlField;
  /** ③ 破空纹：贴矛流线，跟着矛走。 */
  readonly rip: ShaderMesh;
  /** ④ 命中震荡：靶板上的环。 */
  readonly rings: readonly RingMesh[];
  /** ⑥ 靶板裂纹。 */
  readonly board: ShaderMesh;
  /** ⑦ 气流云：横向尘云被撕开。 */
  readonly dust: ShaderMesh;
  /** ⑦ 续：被撕开后卷起的尘团。 */
  readonly puffs: readonly BeadMesh[];
  /** ⑧ 枪头闪光。 */
  readonly flare: ShaderMesh;
  /** 矛路：起点 x、靶板 x、路高 y（场景局部坐标）。 */
  readonly fromX: number;
  readonly toX: number;
  readonly pathY: number;
  /** 矛全长与尾迹长（世界单位）。 */
  readonly spearLength: number;
  readonly wakeLength: number;
  /** 尘云贴片尺寸，用于把场景坐标换算成云的 UV。 */
  readonly dustSize: THREE.Vector2;
};

function rand(i: number, salt: number): number {
  return ((Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1 + 1) % 1;
}

/** 建 spear 场景的全部元素。 */
export function buildSpearParts(ctx: CgStageContext): SpearParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'cg-spear');
  const short = Math.min(width, height);

  // 矛路**水平**贯穿全屏（规格「矛路平贯全屏」），两端都在屏外。
  const fromX = -width * 0.62;
  const toX = width * 0.46;
  const pathY = height * 0.04;
  const spearLength = short * 0.34;
  const wakeLength = short * 0.5;

  const steel = color.clone().lerp(new THREE.Color('#DCE8FF'), 0.72);
  const wood = color.clone().lerp(new THREE.Color('#7A5230'), 0.62);
  const air = color.clone().lerp(new THREE.Color('#CFE6FF'), 0.8);
  const dustTone = color.clone().lerp(new THREE.Color('#9AA3B4'), 0.62);
  const boardTone = new THREE.Color('#4A382A');

  // ⑦ 气流云：横向尘云带，位于矛路高度，最底层。
  const dustSize = new THREE.Vector2(width * 1.25, height * 0.62);
  const dust = res.mesh(
    'airflow-cloud',
    new THREE.PlaneGeometry(dustSize.x, dustSize.y),
    createBlendedPlaneMaterial({
      fragmentShader: SPEAR_DUST_FRAGMENT,
      uniforms: {
        uColor: { value: dustTone },
        uEdgeColor: { value: air },
        uAlpha: { value: 0 },
        uTime: { value: 0 },
        uPathY: { value: 0.5 },
        uTear: { value: new Float32Array(TEAR_SEGMENTS) },
      },
    }),
  );
  dust.position.set(0, pathY, -22);
  res.group.add(dust);

  // ⑦ 续 被撕开后卷起的尘团：沿矛路分布，矛过时被推离路轴。
  const puffs: BeadMesh[] = [];
  for (let i = 0; i < TEAR_PUFFS; i += 1) {
    const material = res.track(new THREE.MeshBasicMaterial({
      color: dustTone, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
    }));
    const mesh = new THREE.Mesh(
      res.track(new THREE.CircleGeometry(short * (0.018 + rand(i, 11) * 0.016), 12)),
      material,
    );
    mesh.name = `tearpuff-${i}`;
    mesh.position.z = -18;
    res.group.add(mesh);
    puffs.push(mesh);
  }

  // ⑥ 靶板：立在矛路终点，裂纹以命中点为心。
  const boardW = width * 0.2;
  const boardH = height * 0.56;
  const board = res.mesh(
    'target-board',
    new THREE.PlaneGeometry(boardW, boardH),
    createAdditivePlaneMaterial({
      fragmentShader: SPEAR_BOARD_FRAGMENT,
      uniforms: {
        uBoard: { value: boardTone },
        uCrack: { value: air },
        uAlpha: { value: 0 },
        uFront: { value: 0 },
        uImpact: { value: 0 },
        uGrain: { value: 0 },
        // 命中点在板的 UV 坐标：矛路高度换算过来。
        uHit: { value: new THREE.Vector2(0.5, 0.5) },
      },
    }),
  );
  board.position.set(toX, pathY, -8);
  res.group.add(board);

  // ④ 命中震荡：靶板上的同心环（末端环，规格元素④）。
  const rings: RingMesh[] = [];
  for (let i = 0; i < SHOCK_RINGS; i += 1) {
    const radius = short * (0.05 + i * 0.028);
    const mesh = new THREE.Mesh(
      res.track(new THREE.RingGeometry(radius * 0.82, radius, 72)),
      res.track(additiveMaterial(air, 0)),
    );
    mesh.name = `shockring-${i}`;
    mesh.position.set(toX, pathY, -5);
    res.group.add(mesh);
    rings.push(mesh);
  }

  // ② 螺旋气流（可寻址骨架，见 spear-swirl 的取证说明）。
  const swirl = buildSwirl(res, ctx.quality, short, wakeLength, air);

  // ③ 破空纹：贴矛的流线鞘。
  const rip = res.mesh(
    'ripwind-streaks',
    new THREE.PlaneGeometry(spearLength * 1.9, short * 0.13),
    createAdditivePlaneMaterial({
      fragmentShader: SPEAR_RIP_FRAGMENT,
      uniforms: {
        uColor: { value: air },
        uAlpha: { value: 0 },
        uSpeed: { value: 0 },
        uPhase: { value: 0 },
      },
    }),
  );
  rip.position.z = 6;
  res.group.add(rip);

  // ① 矛 mesh：枪头（锥）+ 杆（细柱），整体沿 +x 指向。
  const spear = new THREE.Group();
  spear.name = 'spear-body';
  spear.position.z = 12;
  res.group.add(spear);
  // 同 swirl-sheath：嵌套容器必须自己登记回收，否则枪头/杆/驻波珠
  // 会在 group 被摘除后仍挂在它下面。
  res.track({ dispose() { spear.clear(); spear.removeFromParent(); } });

  const head = res.mesh(
    'spear-head',
    new THREE.ConeGeometry(short * 0.017, spearLength * 0.26, 12),
    additiveMaterial(steel, 1),
  );
  // 锥默认指 +y，转到 +x。
  head.rotation.z = -Math.PI / 2;
  head.position.x = spearLength * 0.37;
  spear.add(head);

  const shaft = res.mesh(
    'spear-shaft',
    new THREE.CylinderGeometry(short * 0.0055, short * 0.0075, spearLength * 0.78, 10),
    additiveMaterial(wood, 1),
  );
  shaft.rotation.z = -Math.PI / 2;
  shaft.position.x = -spearLength * 0.13;
  spear.add(shaft);

  // ⑤ 矛杆震动：沿杆的采样珠。x 从枪头端到尾镦端均分，
  // 横向位移由驻波给——首末两颗是波节，位移恒零。
  const beads: BeadMesh[] = [];
  for (let i = 0; i < FLEX_BEADS; i += 1) {
    const mesh = new THREE.Mesh(
      res.track(new THREE.CircleGeometry(Math.max(1, short * 0.0038), 8)),
      res.track(additiveMaterial(air, 0)),
    );
    mesh.name = `flexbead-${i}`;
    spear.add(mesh);
    beads.push(mesh);
  }

  // ⑧ 枪头闪光：刃口高光，跟着枪尖。
  const flare = res.mesh(
    'tip-flare',
    new THREE.PlaneGeometry(short * 0.16, short * 0.16),
    createAdditivePlaneMaterial({
      fragmentShader: SPEAR_FLARE_FRAGMENT,
      uniforms: {
        uColor: { value: steel },
        uAlpha: { value: 0 },
        uSpin: { value: 0 },
      },
    }),
  );
  flare.position.z = 16;
  res.group.add(flare);

  return {
    res, spear, head, shaft, beads, swirl, rip, rings, board, dust, puffs, flare,
    fromX, toX, pathY, spearLength, wakeLength, dustSize,
  };
}
