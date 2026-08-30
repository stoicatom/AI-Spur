/**
 * 场景 07 crystal 的屏空间光效：棱光、光斑拖影、底部尘雾、屏缘色散、共振频闪、晶尘。
 *
 * 与 crystal-parts.ts 的分界：这些都不是晶体实体，而是铺在画面上的光层，
 * 尺寸跟屏幕走而非跟晶塔走。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import type { SceneResources } from '../cg-scene-kit';
import { createParticleHub, type ParticleHub } from '../cg-particle-kit';
import { createAdditivePlaneMaterial } from '../cg-shaders';
import { MATERIAL_IDENTITIES } from '../material-identity';
import {
  DUST_VEIL_FRAGMENT, EDGE_DISPERSION_FRAGMENT, PRISM_GLOW_FRAGMENT,
} from './crystal-shaders';

/** ③ 棱光：剥离瞬间迸发的折射色块。 */
export function createPrismGlow(
  res: SceneResources,
  ctx: CgStageContext,
  span: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    res.track(new THREE.PlaneGeometry(span * 1.9, span * 1.9)),
    res.track(createAdditivePlaneMaterial({
      fragmentShader: PRISM_GLOW_FRAGMENT,
      uniforms: {
        uColor: { value: ctx.color.clone() },
        uBurst: { value: 0 },
        uHue: { value: 0 },
        uTime: { value: 0 },
      },
    })),
  );
  mesh.name = 'prism-glow';
  mesh.position.z = 10;
  res.group.add(mesh);
  return mesh;
}

/** ⑤ 光斑拖影：晶屑飞行时拉出的高光条。 */
export function createAfterglow(
  res: SceneResources,
  ctx: CgStageContext,
  span: number,
  count: number,
): { group: THREE.Group; sprites: THREE.Mesh[] } {
  const group = new THREE.Group();
  group.name = 'spark-afterglow';
  group.position.z = 20;
  res.group.add(group);

  const geometry = res.track(new THREE.PlaneGeometry(span * 0.055, span * 0.012));
  const material = res.track(new THREE.MeshBasicMaterial({
    color: ctx.color.clone().lerp(new THREE.Color('#ffffff'), 0.7),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  const sprites: THREE.Mesh[] = [];
  for (let i = 0; i < count; i += 1) {
    const sprite = new THREE.Mesh(geometry, material);
    sprite.name = `afterglow-${i}`;
    sprite.visible = false;
    group.add(sprite);
    sprites.push(sprite);
  }
  return { group, sprites };
}

/** ⑥ 底部尘雾：晶屑砸地扬起、第三幕沉积。 */
export function createDustVeil(
  res: SceneResources,
  ctx: CgStageContext,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    res.track(new THREE.PlaneGeometry(ctx.width * 1.1, ctx.height * 0.52)),
    res.track(createAdditivePlaneMaterial({
      fragmentShader: DUST_VEIL_FRAGMENT,
      uniforms: {
        uColor: { value: ctx.color.clone().lerp(new THREE.Color('#dfefff'), 0.4) },
        uKick: { value: 0 },
        uSettle: { value: 0 },
        uTime: { value: 0 },
      },
    })),
  );
  mesh.name = 'ground-dustveil';
  mesh.position.set(0, -ctx.height * 0.24, 4);
  res.group.add(mesh);
  return mesh;
}

/** ⑦ 折射光棱：屏缘色散。 */
export function createEdgeDispersion(
  res: SceneResources,
  ctx: CgStageContext,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    res.track(new THREE.PlaneGeometry(ctx.width, ctx.height)),
    res.track(createAdditivePlaneMaterial({
      fragmentShader: EDGE_DISPERSION_FRAGMENT,
      uniforms: {
        uColor: { value: ctx.color.clone() },
        uIntensity: { value: 0 },
        uTime: { value: 0 },
      },
    })),
  );
  mesh.name = 'edge-dispersion';
  mesh.position.z = 30;
  res.group.add(mesh);
  return mesh;
}

/**
 * 声学共振频率折进视觉闪烁频段。
 *
 * crystal 的 resonanceHz 是 4200Hz——直接拿它当闪烁频率没有意义：
 * 60FPS 每帧采样相位跨越 70 个周期，采出来的值几乎恒定，屏幕上看不到闪。
 * 逐次折半（等价降八度）到 ≤24Hz，既保留「节拍源自声学签名」的推导链，
 * 又落在人眼可分辨的频闪区间。
 */
export function visualFlickerHz(resonanceHz: number): number {
  let hz = resonanceHz;
  while (hz > 24) hz /= 2;
  return hz;
}

/** ⑧ 碎晶音画同步：按 crystal 声学共振频率（降八度后）闪的全屏薄幕。 */
export function createAudioStrobe(
  res: SceneResources,
  ctx: CgStageContext,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    res.track(new THREE.PlaneGeometry(ctx.width, ctx.height)),
    res.track(new THREE.MeshBasicMaterial({
      color: ctx.color.clone().lerp(new THREE.Color('#ffffff'), 0.6),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })),
  );
  mesh.name = 'audio-strobe';
  mesh.position.z = 34;
  // 节拍源写在节点上供验收：频闪不是随手挑的频率。
  mesh.userData.hz = MATERIAL_IDENTITIES.crystal.acoustic.resonanceHz;
  mesh.userData.flickerHz = visualFlickerHz(MATERIAL_IDENTITIES.crystal.acoustic.resonanceHz);
  res.group.add(mesh);
  return mesh;
}

/**
 * 细碎晶尘粒子：跟着晶屑一起飞散，补足碎裂的颗粒密度。
 *
 * 用 quarks 粒子而非自绘点云：晶尘是"一次性爆发后自然消亡"的量，
 * 交给 hub 管生命周期比在 update 里手算 alpha 衰减更省。
 */
export function createGrainHub(
  ctx: CgStageContext,
  span: number,
): ParticleHub {
  const hub = createParticleHub(ctx.root, ctx.quality);
  hub.emit({
    // 档位缩放由 hub 内部按 quality 施加，低档只是更稀疏。
    count: 140,
    lifetime: [0.35, 1.05],
    speed: [span * 0.12, span * 0.62],
    size: [1.6, 4.4],
    color: ctx.color.clone().lerp(new THREE.Color('#eaf6ff'), 0.5),
    shape: 'sphere',
    spread: span * 0.16,
  });
  return hub;
}
