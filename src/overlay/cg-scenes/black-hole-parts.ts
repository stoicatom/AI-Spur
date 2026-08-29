/**
 * 场景 42 black-hole 的元素搭建（规格 §4.2 场景 42 的九元素）。
 *
 * 与编排分离：本文件只负责「把元素立起来」，三幕动作在 cg-black-hole.ts。
 * 拆分理由是 CLAUDE.md 的 250 行上限，也让元素清单能一眼对照规格。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import {
  LENS_FRAGMENT,
  PHOTON_RING_FRAGMENT,
  STAR_FIELD_FRAGMENT,
  createAdditivePlaneMaterial,
} from '../cg-shaders';
import { additiveMaterial, createSceneResources, type SceneResources } from '../cg-scene-kit';
import { scaledCount } from '../cg-particle-kit';

/** ⑦ 吸积温度渐变：内白 → 橙 → 素材色（蓝紫）。 */
export function accretionColor(k: number, base: THREE.Color): THREE.Color {
  const hot = new THREE.Color('#FFF3E0');
  const mid = new THREE.Color('#FF9A4D');
  return k < 0.5 ? hot.clone().lerp(mid, k * 2) : mid.clone().lerp(base, (k - 0.5) * 2);
}

/** 一颗被吞噬的尘埃。 */
export type Dust = {
  mesh: THREE.Mesh;
  angle: number;
  radius: number;
  /** 角速度倍率，制造盘内开普勒式速度分层。 */
  spin: number;
  /** 是否属于被喷流弹回的那部分物质（本场景独立签名）。 */
  rebound: boolean;
  /** 弹回时沿极轴的方向。 */
  reboundSign: number;
};

export type BlackHoleParts = {
  res: SceneResources;
  /** 盘半径（像素），全屏 2/3 直径的一半。 */
  diskRadius: number;
  /** 事件视界半径（像素）。 */
  horizonRadius: number;
  horizon: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  photonRing: THREE.ShaderMaterial;
  starField: THREE.ShaderMaterial;
  lens: THREE.ShaderMaterial;
  disk: THREE.Group;
  bands: Array<{ mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; spin: number }>;
  jets: Array<{ core: THREE.Mesh; sheath: THREE.Mesh }>;
  dust: Dust[];
  criticalFlash: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  finalFlare: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
};

/** 盘的倾角：略微俯视，让盘既有厚度感又不遮住喷流。 */
const DISK_TILT = -1.06;

export function buildBlackHoleParts(ctx: CgStageContext): BlackHoleParts {
  const res = createSceneResources(ctx.root, ctx.origin, 'cg-black-hole');
  const short = Math.min(ctx.width, ctx.height);
  const diskRadius = (short * (2 / 3)) / 2;
  const horizonRadius = diskRadius * 0.26;

  // ⑥ 背景星场：铺满全屏，受透镜强度弯曲。
  const starField = res.track(createAdditivePlaneMaterial({
    uniforms: {
      uTime: { value: 0 },
      uLensing: { value: 0 },
      uTint: { value: new THREE.Color('#C9D6FF') },
    },
    fragmentShader: STAR_FIELD_FRAGMENT,
  }));
  const starMesh = res.mesh(
    'star-field',
    new THREE.PlaneGeometry(ctx.width * 1.2, ctx.height * 1.2),
    starField,
  );
  starMesh.position.z = -60;
  res.group.add(starMesh);

  // ④ 引力透镜：环绕扭曲，覆盖四缘。
  const lens = res.track(createAdditivePlaneMaterial({
    uniforms: {
      uColor: { value: ctx.color.clone() },
      uTime: { value: 0 },
      uStrength: { value: 0 },
    },
    fragmentShader: LENS_FRAGMENT,
  }));
  const lensMesh = res.mesh(
    'gravitational-lens',
    new THREE.PlaneGeometry(diskRadius * 4, diskRadius * 4),
    lens,
  );
  lensMesh.position.z = -20;
  res.group.add(lensMesh);

  // ① 事件视界：纯黑球，吞掉后方一切光线。
  const horizon = res.mesh(
    'event-horizon',
    new THREE.SphereGeometry(horizonRadius, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0x01010a, transparent: true, opacity: 1, depthWrite: false }),
  );
  horizon.position.z = 10;
  res.group.add(horizon);

  // ① 光子环：视界边缘的引力聚焦亮环。
  const photonRing = res.track(createAdditivePlaneMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#E8D9FF') },
      uProgress: { value: 0 },
      uIntensity: { value: 0 },
    },
    fragmentShader: PHOTON_RING_FRAGMENT,
  }));
  const ringMesh = res.mesh(
    'photon-ring',
    new THREE.PlaneGeometry(horizonRadius * 5, horizonRadius * 5),
    photonRing,
  );
  ringMesh.position.z = 12;
  res.group.add(ringMesh);

  // ② 吸积盘：倾斜环带，按温度渐变着色、按半径分层转速。
  const disk = new THREE.Group();
  disk.name = 'accretion-disk';
  disk.rotation.x = DISK_TILT;
  disk.position.z = 4;
  res.group.add(disk);

  const bandCount = ctx.quality === 'cinematic' ? 9 : ctx.quality === 'high' ? 7 : 5;
  const bands: BlackHoleParts['bands'] = [];
  for (let i = 0; i < bandCount; i += 1) {
    const k = i / (bandCount - 1);
    const radius = horizonRadius * 1.35 + (diskRadius - horizonRadius * 1.35) * k;
    const material = additiveMaterial(accretionColor(k, ctx.color));
    material.side = THREE.DoubleSide;
    const mesh = res.mesh(
      `accretion-band-${i}`,
      new THREE.TorusGeometry(radius, Math.max(1.5, diskRadius * 0.022 * (1 - k * 0.45)), 8, 96),
      material,
    );
    // 内圈转得快：开普勒速度分层让盘看起来在「拧」。
    bands.push({ mesh, material, spin: 1.9 - k * 1.25 });
    disk.add(mesh);
  }

  // ⑤ 双极相对论喷流：亮芯 + 线框鞘。
  const jetGroup = new THREE.Group();
  jetGroup.name = 'relativistic-jet';
  jetGroup.position.z = 8;
  res.group.add(jetGroup);

  const jets: BlackHoleParts['jets'] = [];
  for (const sign of [1, -1]) {
    const label = sign > 0 ? 'up' : 'down';
    const core = res.mesh(
      `jet-core-${label}`,
      new THREE.CylinderGeometry(horizonRadius * 0.16, horizonRadius * 0.5, diskRadius * 1.7, 12, 1, true),
      additiveMaterial('#DCC9FF'),
    );
    core.position.y = (sign * diskRadius * 1.7) / 2;
    core.scale.setScalar(0.001);

    const sheathMaterial = additiveMaterial(ctx.color.clone());
    sheathMaterial.wireframe = true;
    const sheath = res.mesh(
      `jet-sheath-${label}`,
      new THREE.ConeGeometry(horizonRadius * 0.95, diskRadius * 1.8, 14, 1, true),
      sheathMaterial,
    );
    sheath.position.y = (sign * diskRadius * 1.8) / 2;
    sheath.rotation.z = sign > 0 ? 0 : Math.PI;
    sheath.scale.setScalar(0.001);

    jetGroup.add(core, sheath);
    jets.push({ core, sheath });
  }

  // ③ 被吞噬尘埃：共用一份几何体，逐颗独立材质以便单独闪紫。
  const dustGroup = new THREE.Group();
  dustGroup.name = 'infalling-dust';
  dustGroup.position.z = 6;
  res.group.add(dustGroup);

  const dustGeometry = res.track(new THREE.OctahedronGeometry(Math.max(1.6, diskRadius * 0.016), 0));
  const dustCount = scaledCount(56, ctx.quality);
  const dust: Dust[] = [];
  for (let i = 0; i < dustCount; i += 1) {
    const material = res.track(additiveMaterial(accretionColor(0.35 + (i % 5) * 0.12, ctx.color)));
    const mesh = new THREE.Mesh(dustGeometry, material);
    mesh.name = `dust-${i}`;
    dustGroup.add(mesh);
    dust.push({
      mesh,
      angle: (i / dustCount) * Math.PI * 2 + (i % 7) * 0.31,
      radius: diskRadius * (0.72 + (((i * 37) % 100) / 100) * 0.5),
      spin: 0.85 + (((i * 53) % 100) / 100) * 0.9,
      // 六颗里一颗被弹回：比例够低才像「侥幸逃脱」而非常态。
      rebound: i % 6 === 0,
      reboundSign: i % 12 === 0 ? 1 : -1,
    });
  }

  // ⑧ 临界闪现：尘埃越过临界线的紫闪，用一层薄环表达整体事件。
  const criticalMaterial = additiveMaterial('#C88CFF');
  criticalMaterial.side = THREE.DoubleSide;
  const criticalFlash = res.mesh(
    'critical-flash',
    new THREE.TorusGeometry(horizonRadius * 1.9, horizonRadius * 0.12, 6, 64),
    criticalMaterial,
  );
  criticalFlash.rotation.x = DISK_TILT;
  criticalFlash.position.z = 5;
  res.group.add(criticalFlash);

  // ⑨ 尾声白炽：奇点熄灭的爆闪。
  const finalFlare = res.mesh(
    'final-flare',
    new THREE.CircleGeometry(horizonRadius * 1.4, 48),
    additiveMaterial('#FFFFFF'),
  );
  finalFlare.position.z = 16;
  res.group.add(finalFlare);

  return {
    res, diskRadius, horizonRadius, horizon, photonRing, starField, lens,
    disk, bands, jets, dust, criticalFlash, finalFlare,
  };
}
