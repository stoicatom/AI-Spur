/**
 * 场景 15 moon 的元素搭建。
 *
 * 只负责「建出规格 §4.2 场景 15 的 8 个构成件并具名」，
 * 时间轴编排在 cg-moon.ts。节点命名规则：不同性质的节点前缀
 * 互不包含（`meteor-N` / `halo-N` / `cloud-N`），
 * 避免前缀匹配的断言测错对象。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial, VOLUME_CLOUD_FRAGMENT } from '../cg-shaders';
import { MOON_ARC_FRAGMENT, MOON_POOL_FRAGMENT, MOON_SURFACE_FRAGMENT } from './moon-shaders';

/** 月晕环层数：内中外三圈，脉动相位错开。 */
const HALO_RINGS = 3;
/** 背景碎星陨条数。 */
const METEOR_COUNT = 7;
/** 夜云层数：两层反向漂移。 */
const CLOUD_LAYERS = 2;

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
type BasicMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
/** 环几何的具名 mesh：月晕与脉动环用 ring 而非贴片，环缘才干净。 */
type RingMesh = THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;

export type MoonHalo = {
  readonly mesh: RingMesh;
  /** 静态半径（像素），脉动只改 scale 不改这个基准。 */
  readonly radius: number;
  /** 呼吸相位偏移，让三圈不同步。 */
  readonly phase: number;
};

export type MoonMeteor = {
  readonly mesh: BasicMesh;
  /** 起点（相对场景 group）。 */
  readonly from: THREE.Vector2;
  /** 飞行方向单位向量。 */
  readonly dir: THREE.Vector2;
  /** 行程长度（像素）。 */
  readonly span: number;
  /** 在整幕中的出现时刻（0–1），错峰划过。 */
  readonly at: number;
};

export type MoonParts = {
  readonly res: SceneResources;
  readonly moon: ShaderMesh;
  readonly arc: ShaderMesh;
  readonly halos: MoonHalo[];
  readonly pulse: RingMesh;
  readonly meteors: MoonMeteor[];
  readonly clouds: ShaderMesh[];
  readonly pool: ShaderMesh;
  /** 月轮半径（像素），弧光与月尘都以它定位。 */
  readonly moonRadius: number;
  /** 月轮升满后的中心高度。 */
  readonly moonTopY: number;
};

function plane(size: number): THREE.PlaneGeometry {
  return new THREE.PlaneGeometry(size, size);
}

/** 建 moon 场景的全部元素。 */
export function buildMoonParts(ctx: CgStageContext): MoonParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'moon-scene');
  const short = Math.min(width, height);
  const moonRadius = short * 0.19;
  const moonTopY = height * 0.12;

  // 月色：素材色偏冷，压低饱和度往银白靠，避免出现「蓝月亮」。
  const silver = color.clone().lerp(new THREE.Color('#DCE6F5'), 0.62);
  const cold = color.clone().lerp(new THREE.Color('#8FB4E8'), 0.5);

  // ① 月面
  const moon = res.mesh(
    'moon-disc',
    plane(moonRadius * 2),
    createBlendedPlaneMaterial({
      fragmentShader: MOON_SURFACE_FRAGMENT,
      uniforms: {
        uColor: { value: silver },
        uTime: { value: 0 },
        uPhase: { value: 0 },
        uGlow: { value: 0 },
      },
    }),
  );
  res.group.add(moon);

  // ③ 月出弧光：贴片比月轮大一圈，弧带跑在月缘外侧。
  const arcSize = moonRadius * 5.2;
  const arc = res.mesh(
    'moon-arc',
    plane(arcSize),
    createAdditivePlaneMaterial({
      fragmentShader: MOON_ARC_FRAGMENT,
      uniforms: {
        uColor: { value: silver },
        uSweep: { value: -Math.PI * 0.5 },
        uWidth: { value: 0.5 },
        uAlpha: { value: 0 },
        uRadius: { value: 0.42 },
      },
    }),
  );
  arc.position.y = moonTopY;
  res.group.add(arc);

  // ② 月晕：三圈同心环，用 ring 几何而非贴片，环缘才干净。
  const halos: MoonHalo[] = [];
  for (let i = 0; i < HALO_RINGS; i += 1) {
    const radius = moonRadius * (1.55 + i * 0.62);
    const geometry = new THREE.RingGeometry(radius * 0.94, radius, 96);
    const material = new THREE.MeshBasicMaterial({
      color: silver,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `halo-${i}`;
    mesh.position.y = moonTopY;
    res.track(geometry);
    res.track(material);
    res.group.add(mesh);
    halos.push({ mesh, radius, phase: i * 1.9 });
  }

  // ⑦ 光晕脉动环：单独一圈呼吸环，比月晕更宽更淡。
  const pulseRadius = moonRadius * 3.4;
  const pulseGeometry = new THREE.RingGeometry(pulseRadius * 0.86, pulseRadius, 128);
  const pulseMaterial = new THREE.MeshBasicMaterial({
    color: cold,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const pulse = new THREE.Mesh(pulseGeometry, pulseMaterial);
  pulse.name = 'halo-pulse-ring';
  pulse.position.y = moonTopY;
  res.track(pulseGeometry);
  res.track(pulseMaterial);
  res.group.add(pulse);

  // ④ 碎星陨：背景细线，各自错峰划过。
  const meteors: MoonMeteor[] = [];
  for (let i = 0; i < METEOR_COUNT; i += 1) {
    const span = short * (0.16 + (i % 3) * 0.07);
    const geometry = new THREE.PlaneGeometry(span, Math.max(1.2, short * 0.0035));
    const material = new THREE.MeshBasicMaterial({
      color: silver,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `meteor-${i}`;
    const angle = -0.62 - (i % 4) * 0.09;
    const dir = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
    mesh.rotation.z = angle;
    const from = new THREE.Vector2(
      (i / (METEOR_COUNT - 1) - 0.42) * width * 1.05,
      height * (0.28 + ((i * 7) % 5) * 0.05),
    );
    res.track(geometry);
    res.track(material);
    res.group.add(mesh);
    meteors.push({ mesh: mesh as unknown as BasicMesh, from, dir, span, at: 0.06 + i * 0.12 });
  }

  // ⑤ 夜云：两层反向漂移的云幕，末幕上移掩月。
  const clouds: ShaderMesh[] = [];
  for (let i = 0; i < CLOUD_LAYERS; i += 1) {
    const mesh = res.mesh(
      `cloud-${i}`,
      new THREE.PlaneGeometry(width * 1.45, height * (0.5 + i * 0.14)),
      createBlendedPlaneMaterial({
        fragmentShader: VOLUME_CLOUD_FRAGMENT,
        uniforms: {
          uColor: { value: new THREE.Color('#2A3346').lerp(cold, 0.22 + i * 0.12) },
          uFlashColor: { value: silver },
          uTime: { value: 0 },
          uDensity: { value: 0 },
          uFlash: { value: 0 },
        },
      }),
    );
    mesh.position.set(0, -height * (0.1 + i * 0.16), 0);
    res.group.add(mesh);
    clouds.push(mesh);
  }

  // ⑧ 地面月光池
  const pool = res.mesh(
    'moon-pool',
    new THREE.PlaneGeometry(width * 0.9, height * 0.42),
    createAdditivePlaneMaterial({
      fragmentShader: MOON_POOL_FRAGMENT,
      uniforms: {
        uColor: { value: cold },
        uAlpha: { value: 0 },
        uBreath: { value: 0 },
      },
    }),
  );
  pool.position.y = -height * 0.34;
  res.group.add(pool);

  return { res, moon, arc, halos, pulse, meteors, clouds, pool, moonRadius, moonTopY };
}
