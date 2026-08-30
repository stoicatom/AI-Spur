/**
 * 场景 31 tornado 的元素搭建。
 *
 * 命名规则：不同性质的节点前缀互不包含（`junk-N` 碎物 /
 * `rainline-N` 雨旋条 / `ring-N` 根环），避免前缀匹配的断言测错对象。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial, VOLUME_CLOUD_FRAGMENT } from '../cg-shaders';
import {
  TORNADO_EYE_FRAGMENT,
  TORNADO_FUNNEL_FRAGMENT,
  TORNADO_SANDSHEET_FRAGMENT,
} from './tornado-shaders';

/** 根环层数：地面吸入环。 */
export const ROOT_RING_COUNT = 3;
/** 斜雨条数（雨旋）。 */
export const RAIN_LINE_COUNT = 14;

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
type RingMesh = THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
type LineMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

export type TornadoRainLine = {
  readonly mesh: LineMesh;
  /** 该条雨在场景中的初始横向偏移与高度。 */
  readonly x0: number;
  readonly h0: number;
  /** 下落速率（归一化高度/幕）。 */
  readonly fall: number;
};

export type TornadoParts = {
  readonly res: SceneResources;
  readonly funnel: ShaderMesh;
  readonly sand: ShaderMesh;
  readonly eye: ShaderMesh;
  readonly cloudCap: ShaderMesh;
  readonly rootRings: RingMesh[];
  readonly rainLines: TornadoRainLine[];
  /** 漏斗贴片的尺寸与地面高度。 */
  readonly funnelWidth: number;
  readonly funnelHeight: number;
  readonly groundY: number;
  readonly short: number;
  readonly scale: number;
};

/** 建 tornado 场景的全部元素（碎物刚体层在 ./tornado-junk）。 */
export function buildTornadoParts(ctx: CgStageContext): TornadoParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'tornado-scene');
  const short = Math.min(width, height);
  const scale = short * 0.05;
  const groundY = -height * 0.44;

  // 尘色：素材色往灰褐推；风眼偏冷白（透进来的天光）。
  const dust = color.clone().lerp(new THREE.Color('#8B7B66'), 0.72);
  const core = color.clone().lerp(new THREE.Color('#D8CFC0'), 0.7);
  const pale = color.clone().lerp(new THREE.Color('#E8F0FF'), 0.75);
  const cloudColor = new THREE.Color('#3A3A44');

  // ⑤ 顶部云盖：压在漏斗顶端。
  const cloudCap = res.mesh(
    'cloud-cap',
    new THREE.PlaneGeometry(width * 1.3, height * 0.34),
    createBlendedPlaneMaterial({
      fragmentShader: VOLUME_CLOUD_FRAGMENT,
      uniforms: {
        uColor: { value: cloudColor },
        uFlashColor: { value: pale },
        uTime: { value: 0 },
        uDensity: { value: 0 },
        uFlash: { value: 0 },
      },
    }),
  );
  cloudCap.position.set(0, height * 0.36, -20);
  res.group.add(cloudCap);

  // ① 漏斗：纵贯全屏高度（规格「漏斗纵贯全屏高度」）。
  const funnelWidth = width * 0.92;
  const funnelHeight = height * 0.92;
  const funnel = res.mesh(
    'tornado-funnel',
    new THREE.PlaneGeometry(funnelWidth, funnelHeight),
    createAdditivePlaneMaterial({
      fragmentShader: TORNADO_FUNNEL_FRAGMENT,
      uniforms: {
        uColor: { value: dust },
        uCoreColor: { value: core },
        uAlpha: { value: 0 },
        uTime: { value: 0 },
        uMaturity: { value: 0 },
        uFlare: { value: 0 },
        uSpin: { value: 0 },
        // 半径剖面系数换算到贴片 UV（与 TS 侧 funnelRadius 同源）。
        uBaseR: { value: (short * 0.055) / funnelWidth * 2 },
        uTopR: { value: (short * 0.34) / funnelWidth * 2 },
      },
    }),
  );
  funnel.position.set(0, groundY + funnelHeight * 0.5, -6);
  res.group.add(funnel);

  // ⑦ 风眼光柱：与漏斗同高同位，管壁反相。
  const eye = res.mesh(
    'wind-eye',
    new THREE.PlaneGeometry(funnelWidth * 0.4, funnelHeight),
    createAdditivePlaneMaterial({
      fragmentShader: TORNADO_EYE_FRAGMENT,
      uniforms: {
        uColor: { value: pale },
        uAlpha: { value: 0 },
        uMaturity: { value: 0 },
      },
    }),
  );
  eye.position.set(0, groundY + funnelHeight * 0.5, -4);
  res.group.add(eye);

  // ③ 地面沙幕：贴地尘圈，对数螺线纹理。
  const sand = res.mesh(
    'sand-sheet',
    new THREE.PlaneGeometry(width * 1.1, height * 0.42),
    createAdditivePlaneMaterial({
      fragmentShader: TORNADO_SANDSHEET_FRAGMENT,
      uniforms: {
        uColor: { value: dust },
        uAlpha: { value: 0 },
        uSpin: { value: 0 },
        uReach: { value: 0 },
      },
    }),
  );
  sand.position.set(0, groundY + height * 0.04, -8);
  res.group.add(sand);

  // ④ 根环：地面吸入环，三圈向内收。
  const rootRings: RingMesh[] = [];
  for (let i = 0; i < ROOT_RING_COUNT; i += 1) {
    const radius = short * (0.1 + i * 0.09);
    const geometry = new THREE.RingGeometry(radius * 0.84, radius, 72);
    const material = new THREE.MeshBasicMaterial({
      color: dust,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `ring-${i}`;
    mesh.position.set(0, groundY, -7);
    // 贴地压扁。
    mesh.scale.y = 0.3;
    res.track(geometry);
    res.track(material);
    res.group.add(mesh);
    rootRings.push(mesh);
  }

  // ⑧ 雨旋：斜雨条，被吸进漏斗时变白。
  const rainLines: TornadoRainLine[] = [];
  for (let i = 0; i < RAIN_LINE_COUNT; i += 1) {
    const geometry = new THREE.PlaneGeometry(
      Math.max(1.2, scale * 0.05),
      scale * (2.4 + (i % 3) * 1.1),
    );
    const material = new THREE.MeshBasicMaterial({
      color: pale,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `rainline-${i}`;
    mesh.position.z = -3;
    // 斜雨：整体倾斜。
    mesh.rotation.z = 0.32;
    res.track(geometry);
    res.track(material);
    res.group.add(mesh);
    rainLines.push({
      mesh,
      // 分布在漏斗两侧，由外往内被吸。
      x0: (i / (RAIN_LINE_COUNT - 1) - 0.5) * width * 0.95,
      h0: 0.35 + ((i * 37) % 100) / 100 * 0.6,
      fall: 0.55 + ((i * 23) % 100) / 100 * 0.5,
    });
  }

  return {
    res, funnel, sand, eye, cloudCap, rootRings, rainLines,
    funnelWidth, funnelHeight, groundY, short, scale,
  };
}
