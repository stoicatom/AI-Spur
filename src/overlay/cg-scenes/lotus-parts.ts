/**
 * 场景 29 lotus 的元素搭建（莲座层叠花瓣、涟漪、莲光、荷叶、萤火、底光）。
 *
 * 命名规则：不同性质的节点前缀互不包含——
 * `seatpetal-L-N`（莲座上层叠的花瓣，L 为层序）/ `driftpetal-N`（脱落的
 * 刚体花瓣，在 ./lotus-petals）/ `bloomring-N`（层驱动的大涟漪）/
 * `dewring-N`（露珠小环）/ `firefly-N`（萤火）。
 * 尤其注意 `seatpetal-` 与 `driftpetal-` 必须分开：两者数量与语义都不同，
 * 前缀互含会让刚体断言悄悄测到莲座的静态花瓣。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial } from '../cg-shaders';
import { scaledCount } from '../cg-particle-kit';
import { LOTUS_LAYER_COUNT } from './lotus-bloom';
import { FIREFLY_COUNT } from './lotus-ambience';
import { LOTUS_GLOW_FRAGMENT } from './lotus-shaders';
import { buildLotusWater } from './lotus-water';

/** 每层的花瓣数（电影级）：外层更多，层层包裹。 */
const PETALS_PER_LAYER = [5, 7, 9, 11] as const;
/** 荷叶数：花体两侧各几片。 */
export const LILYPAD_COUNT = 4;

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
type PetalMesh = THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
type RingMesh = THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
type DotMesh = THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;

export type SeatPetal = {
  readonly mesh: PetalMesh;
  /** 层序（0 = 最内层）：开启滞后量的唯一来源。 */
  readonly layer: number;
  /** 该瓣在层内的方位角（弧度）。 */
  readonly azimuth: number;
  /** 该层的基准长度（像素）。 */
  readonly length: number;
};

export type LotusParts = {
  readonly res: SceneResources;
  /** ①莲座：层叠花瓣的容器与各瓣。 */
  readonly seat: THREE.Group;
  readonly seatPetals: readonly SeatPetal[];
  /** ③水面涟漪：一层一环，由该层开启进度驱动。 */
  readonly bloomRings: readonly RingMesh[];
  /** ④莲光。 */
  readonly glow: ShaderMesh;
  /** ⑤露珠溅起的小环（露珠本体是 quarks 粒子）。 */
  readonly dewRings: readonly RingMesh[];
  /** ⑥荷叶浮影。 */
  readonly lilypads: readonly ShaderMesh[];
  /** ⑦萤火。 */
  readonly fireflies: readonly DotMesh[];
  /** ⑧水下光斑。 */
  readonly caustic: ShaderMesh;
  readonly short: number;
  /** 水面高度（局部 y）：花体坐在它上面。 */
  readonly waterY: number;
};

/**
 * 建一枚花瓣的平面轮廓。
 *
 * 用贝塞尔而不是三角形：莲花瓣是两条外凸弧在尖端汇合的柳叶形，
 * 直边会读成纸片。宽度取长度的 0.42——太宽像荷叶，太窄像草叶。
 */
function petalShape(length: number): THREE.Shape {
  const half = length * 0.21;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(half, length * 0.22, half * 0.86, length * 0.78, 0, length);
  shape.bezierCurveTo(-half * 0.86, length * 0.78, -half, length * 0.22, 0, 0);
  return shape;
}

/** 建 lotus 的全部非刚体元素（漂散花瓣刚体层在 ./lotus-petals）。 */
export function buildLotusParts(ctx: CgStageContext): LotusParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'lotus-scene');
  const short = Math.min(width, height);
  // 花体居中，略低于中线：上方留出萤火环绕的空间。
  const waterY = -height * 0.06;

  // 莲的色相：素材色往粉白推；花心偏暖金，水下光斑偏青。
  const petalColor = color.clone().lerp(new THREE.Color('#FFD9E8'), 0.68);
  const heartColor = color.clone().lerp(new THREE.Color('#FFE9A8'), 0.72);
  const leafColor = new THREE.Color('#16302A');
  const waterColor = color.clone().lerp(new THREE.Color('#7FD6E8'), 0.74);
  const sheenColor = color.clone().lerp(new THREE.Color('#EAF6FF'), 0.8);

  // 水面与水下四层（③涟漪 / ⑤露珠环 / ⑥荷叶 / ⑧光斑）由 lotus-water 建：
  // 它们共用一套贴水面的环材质与水色，独立成层后本文件只剩花体与光。
  const { bloomRings, dewRings, lilypads, caustic } = buildLotusWater(
    res,
    { width, height, short },
    waterY,
    { water: waterColor, sheen: sheenColor, leaf: leafColor },
  );

  // ①莲座：层叠花瓣。层数恒为 LOTUS_LAYER_COUNT（层数是签名载体，
  // 不按档位削），降档只减每层瓣数。
  const seat = new THREE.Group();
  seat.name = 'lotus-seat';
  seat.position.set(0, waterY, -8);
  res.group.add(seat);

  const seatPetals: SeatPetal[] = [];
  for (let layer = 0; layer < LOTUS_LAYER_COUNT; layer += 1) {
    // 外层更长：花瓣层层包裹，外层要盖住内层。
    const length = short * (0.13 + layer * 0.045);
    const geometry = res.track(new THREE.ShapeGeometry(petalShape(length), 12));
    const perLayer = scaledCount(PETALS_PER_LAYER[layer], ctx.quality);
    for (let k = 0; k < perLayer; k += 1) {
      const material = res.track(new THREE.MeshBasicMaterial({
        // 外层略深：花瓣根部色重、内层被莲光照得更透。
        color: petalColor.clone().lerp(heartColor, 0.4 - layer * 0.1),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
      }));
      const mesh = new THREE.Mesh(geometry, material);
      // 层序编进名字：`seatpetal-0-3` 是最内层第 4 瓣。
      mesh.name = `seatpetal-${layer}-${k}`;
      // 相邻层错开半个瓣距，读起来才是包裹而不是对齐的栅栏。
      const azimuth = (k / perLayer) * Math.PI * 2 + (layer % 2) * Math.PI / perLayer;
      seat.add(mesh);
      seatPetals.push({ mesh, layer, azimuth, length });
    }
  }

  // ④莲光：花心，压在莲座之上（花心的光要透过花瓣缝隙漏出来）。
  const glow = res.mesh(
    'lotus-glow',
    new THREE.PlaneGeometry(short * 0.62, short * 0.62),
    createAdditivePlaneMaterial({
      fragmentShader: LOTUS_GLOW_FRAGMENT,
      uniforms: {
        uColor: { value: petalColor },
        uCoreColor: { value: heartColor },
        uOpen: { value: 0 },
        uAlpha: { value: 0 },
        uTime: { value: 0 },
      },
    }),
  );
  glow.position.set(0, waterY, -7);
  res.group.add(glow);

  // ⑦萤火：环绕光点，位置由 fireflyOrbit 闭式给出。
  const fireflies: DotMesh[] = [];
  const dotGeometry = res.track(new THREE.CircleGeometry(short * 0.0075, 12));
  for (let i = 0; i < FIREFLY_COUNT; i += 1) {
    const material = res.track(new THREE.MeshBasicMaterial({
      color: heartColor,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    }));
    const mesh = new THREE.Mesh(dotGeometry, material);
    mesh.name = `firefly-${i}`;
    mesh.position.set(0, waterY, -3);
    res.group.add(mesh);
    fireflies.push(mesh);
  }

  return {
    res, seat, seatPetals, bloomRings, glow, dewRings,
    lilypads, fireflies, caustic, short, waterY,
  };
}
