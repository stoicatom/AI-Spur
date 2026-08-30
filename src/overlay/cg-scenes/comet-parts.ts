/**
 * 场景 18 comet 的元素搭建（双尾几何在 ./comet-tails）。
 *
 * 命名规则：不同性质的节点前缀互不包含（`comet-core` / `ion-tail` /
 * `dust-tail` / `wake-N` / `sparkle-N`），避免前缀匹配的断言测错对象。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, STAR_FIELD_FRAGMENT } from '../cg-shaders';
import { COMET_TAIL_FRAGMENT } from './comet-shaders';

/** 拖尾环数量：沿轨迹留下的环状残迹。 */
const WAKE_RINGS = 5;
/** 尾梢爆星数量。 */
const SPARKLE_COUNT = 6;

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
type TailMesh = THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
type RingMesh = THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
type SparkleMesh = THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;

export type CometWake = {
  readonly mesh: RingMesh;
  /** 该环在轨迹上的留存位置比例（0–1）。 */
  readonly at: number;
};

export type CometSparkle = {
  readonly mesh: SparkleMesh;
  /** 沿尾长的位置比例（靠尾梢）。 */
  readonly along: number;
  /** 起爆时刻（整幕归一化）。 */
  readonly at: number;
};

export type CometParts = {
  readonly res: SceneResources;
  readonly core: SparkleMesh;
  /** ② 离子尾（直）。 */
  readonly ionTail: TailMesh;
  /** ② 尘埃尾（弯）。 */
  readonly dustTail: TailMesh;
  readonly flash: ShaderMesh;
  readonly starField: ShaderMesh;
  readonly wakes: CometWake[];
  readonly sparkles: CometSparkle[];
  /** 轨迹起点、近日点、终点（局部坐标）。 */
  readonly entry: THREE.Vector2;
  readonly perihelion: THREE.Vector2;
  readonly exit: THREE.Vector2;
  /** 太阳位置（局部坐标），双尾都以它定背日方向。 */
  readonly sun: THREE.Vector2;
  readonly scale: number;
};

/** 建 comet 场景的全部元素（双尾几何每帧重建，此处只建材质与容器）。 */
export function buildCometParts(ctx: CgStageContext): CometParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'comet-scene');
  const short = Math.min(width, height);
  const scale = short * 0.05;

  // 彗色：离子尾偏蓝（电离气体），尘埃尾偏黄白（反射日光）——
  // 这个色温差本身就是双尾的物理区分之一。
  const ion = color.clone().lerp(new THREE.Color('#6FD8FF'), 0.7);
  const dust = color.clone().lerp(new THREE.Color('#FFE8B0'), 0.72);
  const white = color.clone().lerp(new THREE.Color('#FFFFFF'), 0.85);

  // 轨迹：左下入、近日点偏右上、右下出，形成绕日的弧。
  const entry = new THREE.Vector2(-width * 0.5, -height * 0.3);
  const perihelion = new THREE.Vector2(width * 0.06, height * 0.22);
  const exit = new THREE.Vector2(width * 0.52, -height * 0.26);
  // 太阳在轨道**侧上方**，不在轨道前方。
  // 尘埃尾的弯曲来自「背日推离」与「沿轨道滞后」两个方向的夹角；
  // 太阳若落在轨道前方（曾用 0.24w/0.36h），掠日时两方向夹角只有 7.7°，
  // 滞后与背日近乎重合，弯曲被几何抹平——互动②在最该明显的时刻反而失效。
  // 挪到 0.02w/0.62h 后近日点夹角 68°，弯曲充分显现。
  const sun = new THREE.Vector2(width * 0.02, height * 0.62);

  // ⑤ 星空粒子：深空背景，整幕常在。
  const starField = res.mesh(
    'star-field',
    new THREE.PlaneGeometry(width * 1.2, height * 1.2),
    createAdditivePlaneMaterial({
      fragmentShader: STAR_FIELD_FRAGMENT,
      uniforms: {
        uColor: { value: white },
        uTime: { value: 0 },
        uAlpha: { value: 0 },
        uDensity: { value: 42 },
      },
    }),
  );
  starField.position.z = -30;
  res.group.add(starField);

  // ② 双尾：几何每帧按 comet-tails 的纯函数重建，这里只建材质。
  const ionMaterial = res.track(createAdditivePlaneMaterial({
    fragmentShader: COMET_TAIL_FRAGMENT,
    uniforms: {
      uColor: { value: ion },
      uTime: { value: 0 },
      uAlpha: { value: 0 },
      uBreak: { value: 0 },
      // 离子尾锐利：分段边界硬，像磁场丝。
      uSharp: { value: 1 },
    },
  }));
  const ionTail = new THREE.Mesh(new THREE.BufferGeometry(), ionMaterial);
  ionTail.name = 'ion-tail';
  ionTail.position.z = -2;
  res.group.add(ionTail);

  const dustMaterial = res.track(createAdditivePlaneMaterial({
    fragmentShader: COMET_TAIL_FRAGMENT,
    uniforms: {
      uColor: { value: dust },
      uTime: { value: 0 },
      uAlpha: { value: 0 },
      uBreak: { value: 0 },
      // 尘埃尾柔和：颗粒散射，边界模糊。
      uSharp: { value: 0 },
    },
  }));
  const dustTail = new THREE.Mesh(new THREE.BufferGeometry(), dustMaterial);
  dustTail.name = 'dust-tail';
  dustTail.position.z = -3;
  res.group.add(dustTail);

  // ① 彗核
  const coreGeometry = res.track(new THREE.CircleGeometry(scale * 0.42, 24));
  const coreMaterial = res.track(new THREE.MeshBasicMaterial({
    color: white,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  }));
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  core.name = 'comet-core';
  res.group.add(core);

  // ③ 近日点闪光
  const flash = res.mesh(
    'perihelion-flash',
    new THREE.PlaneGeometry(width * 1.4, height * 1.4),
    createAdditivePlaneMaterial({
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uAlpha;
        uniform vec2 uCenter;
        void main() {
          float d = distance(vUv, uCenter);
          // 双层：核心硬闪 + 外圈光晕。
          float a = (exp(-pow(d / 0.06, 2.0)) + exp(-pow(d / 0.22, 2.0)) * 0.45) * uAlpha;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor, min(1.0, a));
        }`,
      uniforms: {
        uColor: { value: white },
        uAlpha: { value: 0 },
        uCenter: {
          value: new THREE.Vector2(
            0.5 + perihelion.x / (width * 1.4),
            0.5 + perihelion.y / (height * 1.4),
          ),
        },
      },
    }),
  );
  res.group.add(flash);

  // ⑥ 拖尾环：沿轨迹留下的残迹，各自定在轨迹的不同位置。
  const wakes: CometWake[] = [];
  for (let i = 0; i < WAKE_RINGS; i += 1) {
    const radius = scale * (0.9 + i * 0.34);
    const geometry = new THREE.RingGeometry(radius * 0.78, radius, 48);
    const material = new THREE.MeshBasicMaterial({
      color: ion,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `wake-${i}`;
    res.track(geometry);
    res.track(material);
    res.group.add(mesh);
    wakes.push({ mesh, at: 0.15 + i * 0.17 });
  }

  // ⑧ 尾梢爆星：尾端小爆点，错峰起爆。
  const sparkles: CometSparkle[] = [];
  for (let i = 0; i < SPARKLE_COUNT; i += 1) {
    const geometry = new THREE.CircleGeometry(scale * (0.14 + (i % 3) * 0.05), 14);
    const material = new THREE.MeshBasicMaterial({
      color: dust,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `sparkle-${i}`;
    res.track(geometry);
    res.track(material);
    res.group.add(mesh);
    sparkles.push({ mesh, along: 0.66 + (i % 4) * 0.09, at: 0.34 + i * 0.1 });
  }

  return {
    res, core, ionTail, dustTail, flash, starField, wakes, sparkles,
    entry, perihelion, exit, sun, scale,
  };
}
