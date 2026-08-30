/**
 * 场景 30 aurora 的元素搭建。
 *
 * 命名规则：不同性质的节点前缀互不包含（`fringe-N` 边缘丝 /
 * `flow-N` 流动光点），避免前缀匹配的断言测错对象。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial, STAR_FIELD_FRAGMENT } from '../cg-shaders';
import { ribbonAxisY } from './aurora-ribbon';
import {
  AURORA_LAKE_FRAGMENT,
  AURORA_MOUNTAIN_FRAGMENT,
  AURORA_RIBBON_FRAGMENT,
  RIBBON_UNIFORM_SEGMENTS,
} from './aurora-shaders';

/** 边缘丝数量：沿带挂着的细发光须。 */
export const FRINGE_COUNT = 9;
/** 流动光点数量（几何件，粒子层另有 quarks）。 */
export const FLOW_COUNT = 8;

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
type DotMesh = THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
type FringeMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

export type AuroraFringe = {
  readonly mesh: FringeMesh;
  /** 挂在带上的沿带位置（0–1）。 */
  readonly u: number;
};

export type AuroraFlow = {
  readonly mesh: DotMesh;
  /** 初始沿带位置与流动速度（沿带位置/幕）。 */
  readonly u0: number;
  readonly speed: number;
};

export type AuroraParts = {
  readonly res: SceneResources;
  readonly ribbon: ShaderMesh;
  readonly stars: ShaderMesh;
  readonly mountain: ShaderMesh;
  readonly lake: ShaderMesh;
  readonly burst: DotMesh;
  readonly fringes: AuroraFringe[];
  readonly flows: AuroraFlow[];
  /** 带贴片的尺寸与位置，用于把沿带位置换成场景坐标。 */
  readonly ribbonWidth: number;
  readonly ribbonHeight: number;
  readonly ribbonY: number;
  readonly scale: number;
};

/** 建 aurora 场景的全部元素。 */
export function buildAuroraParts(ctx: CgStageContext): AuroraParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'aurora-scene');
  const short = Math.min(width, height);
  const scale = short * 0.05;

  // 极光色：低处绿（氧 557.7nm）、高处紫（氮离子）。素材色只作偏色。
  const low = color.clone().lerp(new THREE.Color('#4CFFA6'), 0.76);
  const high = color.clone().lerp(new THREE.Color('#B27BFF'), 0.72);
  const white = color.clone().lerp(new THREE.Color('#EAFFF6'), 0.8);
  const rock = new THREE.Color('#0A0E18');

  // ③ 星光背景：最底层。
  const stars = res.mesh(
    'star-sky',
    new THREE.PlaneGeometry(width * 1.2, height * 1.2),
    createAdditivePlaneMaterial({
      fragmentShader: STAR_FIELD_FRAGMENT,
      uniforms: {
        uColor: { value: white },
        uTime: { value: 0 },
        uAlpha: { value: 0 },
        uDensity: { value: 56 },
      },
    }),
  );
  stars.position.z = -30;
  res.group.add(stars);

  // ① 极光带：横贯全屏上半部（规格「全屏」要求）。
  const ribbonWidth = width * 1.1;
  const ribbonHeight = height * 0.62;
  const ribbonY = height * 0.16;
  const ribbon = res.mesh(
    'aurora-ribbon',
    new THREE.PlaneGeometry(ribbonWidth, ribbonHeight),
    createAdditivePlaneMaterial({
      fragmentShader: AURORA_RIBBON_FRAGMENT,
      uniforms: {
        uLow: { value: low },
        uHigh: { value: high },
        uAlpha: { value: 0 },
        uTime: { value: 0 },
        uSpread: { value: 1 },
        uFold: { value: new Float32Array(RIBBON_UNIFORM_SEGMENTS) },
        uGain: { value: new Float32Array(RIBBON_UNIFORM_SEGMENTS) },
        // 中轴弧（贴片纵向 UV），构建期一次写入，与 TS 侧 ribbonAxisY 同源。
        uArch: { value: new Float32Array(RIBBON_UNIFORM_SEGMENTS) },
      },
    }),
  );
  ribbon.position.set(0, ribbonY, -6);
  res.group.add(ribbon);

  // 中轴弧写入 uArch：ribbonAxisY 给的是场景像素高，换算成贴片纵向 UV
  // （贴片中心 ribbonY 对应 UV 0.5）。构建期一次写入即可——中轴不随时间变。
  const archArray = ribbon.material.uniforms.uArch.value as Float32Array;
  for (let i = 0; i < RIBBON_UNIFORM_SEGMENTS; i += 1) {
    const u = i / (RIBBON_UNIFORM_SEGMENTS - 1);
    archArray[i] = 0.5 + (ribbonAxisY(u, height) - ribbonY) / ribbonHeight;
  }

  // ⑦ 倒湖面：底部反光带，共享 uFold 让倒影跟着本体翻卷。
  const lake = res.mesh(
    'lake-reflection',
    new THREE.PlaneGeometry(width * 1.1, height * 0.32),
    createAdditivePlaneMaterial({
      fragmentShader: AURORA_LAKE_FRAGMENT,
      uniforms: {
        uLow: { value: low },
        uHigh: { value: high },
        uAlpha: { value: 0 },
        uTime: { value: 0 },
        uFold: { value: new Float32Array(RIBBON_UNIFORM_SEGMENTS) },
      },
    }),
  );
  lake.position.set(0, -height * 0.36, -10);
  res.group.add(lake);

  // ④ 雪山剪影：压在湖面之上、带子之下。
  const mountain = res.mesh(
    'snow-ridge',
    new THREE.PlaneGeometry(width * 1.2, height * 0.5),
    createBlendedPlaneMaterial({
      fragmentShader: AURORA_MOUNTAIN_FRAGMENT,
      uniforms: {
        uColor: { value: rock },
        uSnowColor: { value: low },
        uAlpha: { value: 0 },
        uGlow: { value: 0 },
      },
    }),
  );
  mountain.position.set(0, -height * 0.18, -8);
  res.group.add(mountain);

  // ⑤ 极光边缘丝：挂在带下缘的细发光须。
  const fringes: AuroraFringe[] = [];
  for (let i = 0; i < FRINGE_COUNT; i += 1) {
    const u = (i + 0.5) / FRINGE_COUNT;
    const geometry = new THREE.PlaneGeometry(
      Math.max(1.2, scale * 0.06),
      scale * (2.2 + (i % 3) * 0.9),
    );
    const material = new THREE.MeshBasicMaterial({
      color: low,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `fringe-${i}`;
    mesh.position.z = -5;
    res.track(geometry);
    res.track(material);
    res.group.add(mesh);
    fringes.push({ mesh, u });
  }

  // ② 流动光（几何件部分）：沿带流动的光点。
  const flows: AuroraFlow[] = [];
  for (let i = 0; i < FLOW_COUNT; i += 1) {
    const geometry = new THREE.CircleGeometry(scale * (0.22 + (i % 3) * 0.08), 14);
    const material = new THREE.MeshBasicMaterial({
      color: white,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `flow-${i}`;
    mesh.position.z = -4;
    res.track(geometry);
    res.track(material);
    res.group.add(mesh);
    flows.push({
      mesh,
      u0: i / FLOW_COUNT,
      // 速度各异，让流光不成队列。
      speed: 0.35 + ((i * 31) % 100) / 100 * 0.45,
    });
  }

  // ⑧ 爆发点：带上某处突然增亮。
  const burstGeometry = res.track(new THREE.CircleGeometry(scale * 1.4, 24));
  const burstMaterial = res.track(new THREE.MeshBasicMaterial({
    color: high,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  }));
  const burst = new THREE.Mesh(burstGeometry, burstMaterial);
  burst.name = 'aurora-burst';
  burst.position.z = -3;
  res.group.add(burst);

  return {
    res, ribbon, stars, mountain, lake, burst, fringes, flows,
    ribbonWidth, ribbonHeight, ribbonY, scale,
  };
}
