/**
 * 场景 29 lotus 的水面侧元素（③涟漪、⑤露珠小环、⑥荷叶、⑧水下光斑）。
 *
 * 从 ./lotus-parts 拆出来只为守住单文件行数上限；分界线选在「水面之下/
 * 之上」——本文件全是铺在水面或水下的层，莲座与莲光（花体本身）留在
 * lotus-parts。这样两个文件各自内聚，改涟漪不必翻花瓣的代码。
 *
 * 命名规则：`bloomring-N`（层驱动的大涟漪）/ `dewring-N`（露珠小环）/
 * `lilypad-N`（荷叶）/ `under-caustic`（水下光斑），互不为前缀。
 */
import * as THREE from 'three';
import type { SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import { LOTUS_LAYER_COUNT } from './lotus-bloom';
import { DEW_COUNT } from './lotus-ambience';
import { LOTUS_CAUSTIC_FRAGMENT, LOTUS_LILYPAD_FRAGMENT } from './lotus-shaders';

/** 荷叶数：花体两侧各几片。 */
export const LILYPAD_COUNT = 4;

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
type RingMesh = THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;

export type LotusWater = {
  /** ③水面涟漪：一层一环，由该层开启进度驱动。 */
  readonly bloomRings: readonly RingMesh[];
  /** ⑤露珠溅起的小环（露珠本体是 quarks 粒子）。 */
  readonly dewRings: readonly RingMesh[];
  /** ⑥荷叶浮影。 */
  readonly lilypads: readonly ShaderMesh[];
  /** ⑧水下光斑。 */
  readonly caustic: ShaderMesh;
};

/** 伪随机：同一 (i, salt) 每次构建一致，分布因此可重现。 */
function rand(i: number, salt: number): number {
  return ((Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1 + 1) % 1;
}

/** 建一圈贴水面的加光环材质（涟漪与露珠小环共用这套参数）。 */
function ringMaterial(res: SceneResources, color: THREE.Color): THREE.MeshBasicMaterial {
  return res.track(new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  }));
}

export type WaterPalette = {
  /** 水体色（水下光斑）。 */
  readonly water: THREE.Color;
  /** 水光色（环）。 */
  readonly sheen: THREE.Color;
  /** 荷叶暗绿。 */
  readonly leaf: THREE.Color;
};

/**
 * 建水面与水下的全部层。
 *
 * @param res 场景资源容器
 * @param size 画面宽高与短边（像素）
 * @param waterY 水面高度（局部 y）
 * @param palette 三个色相
 */
export function buildLotusWater(
  res: SceneResources,
  size: { width: number; height: number; short: number },
  waterY: number,
  palette: WaterPalette,
): LotusWater {
  const { width, height, short } = size;

  // ⑧水下光斑：铺满水面（全屏底光，压在最底）。
  const caustic = res.mesh(
    'under-caustic',
    new THREE.PlaneGeometry(width * 1.2, height * 1.2),
    createAdditivePlaneMaterial({
      fragmentShader: LOTUS_CAUSTIC_FRAGMENT,
      uniforms: {
        uColor: { value: palette.water },
        uAlpha: { value: 0 },
        uTime: { value: 0 },
        uOpen: { value: 0 },
      },
    }),
  );
  caustic.position.set(0, waterY, -20);
  res.group.add(caustic);

  // ⑥荷叶浮影：花体两侧，暗叶用常规混合压暗（它要遮挡而非叠光）。
  const lilypads: ShaderMesh[] = [];
  for (let i = 0; i < LILYPAD_COUNT; i += 1) {
    const leafSize = short * (0.42 + rand(i, 7) * 0.3);
    const pad = res.mesh(
      `lilypad-${i}`,
      new THREE.PlaneGeometry(leafSize, leafSize),
      createBlendedPlaneMaterial({
        fragmentShader: LOTUS_LILYPAD_FRAGMENT,
        uniforms: {
          uColor: { value: palette.leaf },
          uAlpha: { value: 0 },
          uTime: { value: 0 },
          uOpen: { value: 0 },
        },
      }),
    );
    // 左右交错铺开，覆盖到画面两侧边缘。
    const side = i % 2 === 0 ? -1 : 1;
    pad.position.set(
      side * width * (0.16 + Math.floor(i / 2) * 0.24),
      waterY - height * (0.02 + rand(i, 8) * 0.14),
      -16 + i,
    );
    res.group.add(pad);
    lilypads.push(pad);
  }

  // ③水面涟漪：一层一环。半径与亮度全部由该层的开启进度驱动，
  // 因此「花瓣开启带动涟漪」是因果而非并发。
  const bloomRings: RingMesh[] = [];
  const ringGeometry = res.track(new THREE.RingGeometry(0.9, 1, 64));
  for (let layer = 0; layer < LOTUS_LAYER_COUNT; layer += 1) {
    const mesh = new THREE.Mesh(ringGeometry, ringMaterial(res, palette.sheen));
    mesh.name = `bloomring-${layer}`;
    mesh.position.set(0, waterY, -12);
    res.group.add(mesh);
    bloomRings.push(mesh);
  }

  // ⑤露珠小环：落水点的小环（露珠本体是 quarks 粒子，在编排层）。
  const dewRings: RingMesh[] = [];
  const dewGeometry = res.track(new THREE.RingGeometry(0.82, 1, 32));
  for (let i = 0; i < DEW_COUNT; i += 1) {
    const mesh = new THREE.Mesh(dewGeometry, ringMaterial(res, palette.sheen));
    // 前缀 `dewring-` 与 `bloomring-` 互不包含。
    mesh.name = `dewring-${i}`;
    mesh.position.set(0, waterY, -11);
    res.group.add(mesh);
    dewRings.push(mesh);
  }

  return { bloomRings, dewRings, lilypads, caustic };
}
