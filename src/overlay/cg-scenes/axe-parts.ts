/**
 * 场景 26 axe 的元素搭建。
 *
 * 命名规则：不同性质的节点前缀互不包含（`logseg-N` 木段 / `resin-N` 松脂
 * 星点 / `chip-anchor` 木屑锚点），避免前缀匹配的断言测错对象。特别注意
 * `logseg-N` 与 `log-rig` 不构成前缀包含关系（`logseg` ≠ `log-`）。
 *
 * 六个木段各自持有 shader 材质**独立实例**：断口亮度是逐段的（每段在
 * 自己的 `segmentSplitAt(i)` 亮起），共用一份材质会让六段同时亮，签名
 * 「分段分离」就退化成「整根一起断」。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { additiveMaterial, createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import { AXE_SEGMENT_COUNT, segmentSeat } from './axe-split';
import { AXE_BLADE_FRAGMENT, AXE_LOG_FRAGMENT, AXE_SHOCK_FRAGMENT } from './axe-shaders';

/** 松脂星点数：断面上聚成的几粒亮点。 */
export const RESIN_STAR_COUNT = 5;

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
type BasicMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

/** 一节木段：视觉 mesh + 它在原木上的站位。 */
export type LogSegment = {
  readonly mesh: ShaderMesh;
  /** 轴向站位（0 = 落刃点，1 = 远端），= `segmentSeat(i)`。 */
  readonly seat: number;
  /** 静止时的局部位置，张开位移叠加在它上面。 */
  readonly base: THREE.Vector3;
};

/** 一粒松脂星点：挂在某段断面上，随该段一起走。 */
export type ResinStar = {
  readonly mesh: BasicMesh;
  /** 所属木段序号：星点跟着自己那段动，不是独立飘着。 */
  readonly segment: number;
  /** 在断面上的横向偏移比例。 */
  readonly offset: number;
};

export type AxeParts = {
  readonly res: SceneResources;
  /** ① 斧 mesh（含刃口高光）。 */
  readonly blade: ShaderMesh;
  /** ⑦ 回弹斧身：斧挂在这个容器上，竖向位移施加于它。 */
  readonly axeRig: THREE.Group;
  /** ② 原木：六段各自独立。 */
  readonly segments: LogSegment[];
  /** 原木容器，整根的静止位姿由它给。 */
  readonly logRig: THREE.Group;
  /** ④ 斧光弧（挥砍轨迹的亮弧）。 */
  readonly arc: BasicMesh;
  /** ⑤ 落地震荡的地面环波。 */
  readonly shock: ShaderMesh;
  /** ⑧ 松脂星点。 */
  readonly resins: ResinStar[];
  /** ③ 木屑发射锚点（quarks emitter 会被摘走，自持镜像节点供断言）。 */
  readonly chipAnchor: THREE.Object3D;
  /** 落刃点（局部坐标）：裂纹的轴向原点。 */
  readonly strike: THREE.Vector3;
  /** 原木半长（像素）：轴向站位 → 局部 x 的换算尺度。 */
  readonly logHalf: number;
  /** 单段的竖向厚度（像素）：张开量的换算尺度。 */
  readonly segThickness: number;
  readonly short: number;
  readonly groundY: number;
};

/** 伪随机：同一 (i, salt) 每次一致，松脂散布可重现。 */
function rand(i: number, salt: number): number {
  return ((Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1 + 1) % 1;
}

/**
 * 建 axe 场景的全部可见元素。
 *
 * @param ctx 场景上下文
 */
export function buildAxeParts(ctx: CgStageContext): AxeParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'axe-scene');
  const short = Math.min(width, height);
  const groundY = -height * 0.34;

  // 配色：钢是冷灰，木是暖褐，断面是新鲜浅黄，松脂是琥珀。
  const steel = color.clone().lerp(new THREE.Color('#8A9099'), 0.8);
  const hot = color.clone().lerp(new THREE.Color('#FFF6E0'), 0.82);
  const wood = color.clone().lerp(new THREE.Color('#8A5A2B'), 0.84);
  const fresh = color.clone().lerp(new THREE.Color('#E8C88A'), 0.8);
  const resinHue = color.clone().lerp(new THREE.Color('#FFB43C'), 0.78);

  // 原木横放在砧木上，斧从上方竖直劈下。
  const logLen = width * 0.62;
  const logHalf = logLen * 0.5;
  const logThickness = short * 0.16;
  const segThickness = logThickness * 0.5;
  const logY = groundY + logThickness * 0.5;

  // 落刃点在原木偏左端：裂纹由此向右窜（轴向 0 → 1）。
  const strikeX = -logHalf * 0.72;
  const strike = new THREE.Vector3(strikeX, logY, 0);

  // ② 原木容器。
  const logRig = new THREE.Group();
  logRig.name = 'log-rig';
  logRig.position.set(0, logY, 0);
  res.group.add(logRig);

  // ② 六段木料：沿轴向自落刃点向远端排开。每段一份独立材质。
  const segments: LogSegment[] = [];
  const segLen = (logHalf - strikeX) / AXE_SEGMENT_COUNT;
  for (let i = 0; i < AXE_SEGMENT_COUNT; i += 1) {
    const seat = segmentSeat(i);
    // 段中心的轴向位置：落刃点 + 站位 × 剩余长度。
    const cx = strikeX + seat * (logHalf - strikeX);
    // 奇偶分侧：裂面上下两侧交错，张开时读出「劈成两半」而非「切成六段」。
    const side = i % 2 === 0 ? 1 : -1;
    const cy = side * segThickness * 0.5;

    const mesh = res.mesh(
      // `logseg-<i>` 与 `log-rig` 互不构成前缀包含，验收用 /^logseg-\d+$/ 精确收集。
      `logseg-${i}`,
      new THREE.PlaneGeometry(segLen * 0.96, segThickness * 0.94),
      createBlendedPlaneMaterial({
        fragmentShader: AXE_LOG_FRAGMENT,
        uniforms: {
          uColor: { value: wood.clone() },
          uCoreColor: { value: fresh.clone() },
          uAlpha: { value: 0 },
          uSplit: { value: 0 },
          uGlow: { value: 0 },
        },
      }),
    );
    const base = new THREE.Vector3(cx, cy, 3 + i * 0.1);
    mesh.position.copy(base);
    logRig.add(mesh);
    segments.push({ mesh, seat, base });
  }

  // 原木左端未被劈的部分（落刃点左侧）：整幕不动，作为「还连着」的参照。
  const stubW = strikeX + logHalf;
  if (stubW > 0) {
    const stub = res.mesh(
      'log-stub',
      new THREE.PlaneGeometry(stubW, logThickness * 0.94),
      createBlendedPlaneMaterial({
        fragmentShader: AXE_LOG_FRAGMENT,
        uniforms: {
          uColor: { value: wood.clone() },
          uCoreColor: { value: fresh.clone() },
          uAlpha: { value: 0 },
          uSplit: { value: 0 },
          uGlow: { value: 0 },
        },
      }),
    );
    stub.position.set(-logHalf + stubW * 0.5, 0, 2);
    logRig.add(stub);
  }

  // ⑦ 回弹 rig：斧挂它，回弹位移一处施加。
  const axeRig = new THREE.Group();
  axeRig.name = 'axe-rig';
  axeRig.position.set(strikeX, 0, 0);
  res.group.add(axeRig);

  // ① 斧身：竖直挂在落刃点上方，位移由场景层按 bladeY 喂入。
  const blade = res.mesh(
    'axe-blade',
    new THREE.PlaneGeometry(short * 0.2, short * 0.44),
    createBlendedPlaneMaterial({
      fragmentShader: AXE_BLADE_FRAGMENT,
      uniforms: {
        uColor: { value: steel },
        uHiColor: { value: hot.clone() },
        uAlpha: { value: 0 },
        uEdge: { value: 0 },
      },
    }),
  );
  blade.position.z = 10;
  axeRig.add(blade);

  // ④ 斧光弧：挥砍轨迹上的一道亮弧，竖直拉长（斧只沿竖直走）。
  const arc = res.mesh(
    'arc-glow',
    new THREE.PlaneGeometry(short * 0.06, short * 0.52),
    additiveMaterial(hot),
  );
  arc.position.set(strikeX, logY + short * 0.2, 8);
  res.group.add(arc);

  // ⑤ 落地震荡：砧木周围的地面环波。
  const shock = res.mesh(
    'shock-ring',
    new THREE.PlaneGeometry(short * 1.1, short * 1.1),
    createAdditivePlaneMaterial({
      fragmentShader: AXE_SHOCK_FRAGMENT,
      uniforms: {
        uColor: { value: fresh.clone() },
        uAlpha: { value: 0 },
        uRadius: { value: 0 },
        uTime: { value: 0 },
      },
    }),
  );
  shock.position.set(strikeX, groundY, 1);
  res.group.add(shock);

  // ⑧ 松脂星点：分布在各段断面上，跟着所属段动。
  const resins: ResinStar[] = [];
  for (let i = 0; i < RESIN_STAR_COUNT; i += 1) {
    // 跳过段 0（紧贴落刃点，被斧身挡住），从段 1 起分布。
    const segment = 1 + (i % (AXE_SEGMENT_COUNT - 1));
    const mesh = res.mesh(
      `resin-${i}`,
      new THREE.PlaneGeometry(short * 0.018, short * 0.018),
      additiveMaterial(resinHue),
    );
    mesh.position.z = 12;
    res.group.add(mesh);
    resins.push({ mesh, segment, offset: rand(i, 7) * 0.7 - 0.35 });
  }

  // ③ 木屑锚点：quarks 的 emitter 会被 BatchedRenderer 从场景树摘走，
  // 要断言发射位置随裂纹前沿推进就得自持一个镜像节点。
  const chipAnchor = new THREE.Object3D();
  chipAnchor.name = 'chip-anchor';
  chipAnchor.position.copy(strike);
  res.group.add(chipAnchor);

  return {
    res, blade, axeRig, segments, logRig, arc, shock, resins, chipAnchor,
    strike, logHalf, segThickness, short, groundY,
  };
}
