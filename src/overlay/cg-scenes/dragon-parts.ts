/**
 * 场景 04 dragon 的元素搭建（规格 §4.2 场景 04 的八元素）。
 *
 * 与编排分离：本文件只负责「把元素立起来」，三幕动作在 cg-dragon.ts。
 * 拆分理由是 CLAUDE.md 的 250 行上限，也让元素清单能一眼对照规格。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import { RAIN_FRAGMENT } from './lightning-shaders';
import {
  CLAW_CLOUD_FRAGMENT,
  MIST_FRAGMENT,
  PEARL_HALO_FRAGMENT,
  SCALE_FRAGMENT,
} from './dragon-shaders';
import { additiveMaterial, createSceneResources, type SceneResources } from '../cg-scene-kit';
import { scaledCount } from '../cg-particle-kit';
import { SPINE_JOINT_COUNT, segmentLength } from './dragon-spine';

/** 珠色：暖白偏金，与素材主色（多为冷色）拉开对比，珠光流走才看得出来。 */
export const PEARL_COLOR = '#FFE9A8';

type ShaderMesh<G extends THREE.BufferGeometry> = THREE.Mesh<G, THREE.ShaderMaterial>;
type BasicMesh<G extends THREE.BufferGeometry> = THREE.Mesh<G, THREE.MeshBasicMaterial>;

/** 一节骨骼：节段实体 + 该节的鳞带 + 定位用的空节点。 */
export type SpineNode = {
  /** 定位节点，测试按 spine-joint-<i> 读坐标验证链的连续性。 */
  joint: THREE.Object3D;
  /** ① 节段实体（胶囊体，随链走向转）。 */
  segment: BasicMesh<THREE.CapsuleGeometry>;
  /** ② 该节的鳞带，珠光沿链流走就是逐带点亮这一层。 */
  scale: ShaderMesh<THREE.PlaneGeometry>;
};

export type RainThread = {
  mesh: ShaderMesh<THREE.PlaneGeometry>;
  /** 条带中心 x（世界坐标），雨丝按位置错落下落。 */
  x: number;
};

export type DragonParts = {
  res: SceneResources;
  /** ① 骨骼链容器（dragon-spine），测试量它的包围盒验对角线跨屏。 */
  spineGroup: THREE.Group;
  nodes: SpineNode[];
  /** 单节长度（像素），编排层用它算珠的缠绕半径。 */
  segment: number;
  /** ③ 龙爪扰动云（云海铺底 + 被挤出空隙）。 */
  cloud: ShaderMesh<THREE.PlaneGeometry>;
  /** ④ 光珠核心。 */
  pearl: BasicMesh<THREE.SphereGeometry>;
  /** ④ 珠的光晕。 */
  halo: ShaderMesh<THREE.PlaneGeometry>;
  /** ⑤ 龙珠互绕的双环轨道容器。 */
  orbitGroup: THREE.Group;
  orbits: BasicMesh<THREE.TorusGeometry>[];
  /** ⑥ 雨丝背景。 */
  rain: RainThread[];
  /** ⑦ 龙息火团。 */
  breath: BasicMesh<THREE.ConeGeometry>;
  /** ⑧ 雾境体积雾层。 */
  mist: ShaderMesh<THREE.PlaneGeometry>;
};

export function buildDragonParts(ctx: CgStageContext): DragonParts {
  const res = createSceneResources(ctx.root, new THREE.Vector3(), 'cg-dragon');
  const { width, height, color, quality } = ctx;
  const pearlColor = new THREE.Color(PEARL_COLOR);
  const segment = segmentLength(width, height);

  // ⑧ 雾境：最底层，龙息推散云层后它还留着，给出层次。
  const mist = res.mesh(
    'mist-realm',
    new THREE.PlaneGeometry(width * 1.3, height * 1.1),
    createBlendedPlaneMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#2B3A52') },
        uTime: { value: 0 },
        uDensity: { value: 0 },
      },
      fragmentShader: MIST_FRAGMENT,
    }),
  );
  mist.position.z = -50;
  res.group.add(mist);

  // ⑥ 雨丝背景：稀疏斜雨，档位控制条数。整幕是一个元素，
  // 所以条带挂在自己的容器下，与 dragon-spine 同一模式。
  const rainVeil = new THREE.Group();
  rainVeil.name = 'rain-veil';
  rainVeil.position.z = -40;
  res.group.add(rainVeil);

  const rainCount = scaledCount(16, quality);
  const rain: RainThread[] = [];
  for (let i = 0; i < rainCount; i += 1) {
    const x = (i / Math.max(1, rainCount - 1) - 0.5) * width * 1.1;
    const thread = res.mesh(
      `rain-thread-${i}`,
      new THREE.PlaneGeometry(width * 0.02, height * 1.2),
      createAdditivePlaneMaterial({
        uniforms: {
          uColor: { value: new THREE.Color('#93A9CF') },
          uBright: { value: 0 },
          uAlpha: { value: 0 },
        },
        fragmentShader: RAIN_FRAGMENT,
      }),
    );
    thread.position.x = x;
    thread.rotation.z = 0.2;
    rainVeil.add(thread);
    rain.push({ mesh: thread, x });
  }

  // ③ 龙爪扰动云：铺满屏底，顶缘伸到中线附近，龙从中破出。
  const cloudHeight = height * 1.05;
  const cloud = res.mesh(
    'claw-cloud',
    new THREE.PlaneGeometry(width * 1.3, cloudHeight),
    createBlendedPlaneMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#3A4763') },
        uRimColor: { value: pearlColor.clone() },
        uTime: { value: 0 },
        uDensity: { value: 0 },
        uGaps: { value: 0 },
        uGapCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uGlow: { value: 0 },
      },
      fragmentShader: CLAW_CLOUD_FRAGMENT,
    }),
  );
  // 云心压到屏底之下：云顶抵到屏中线，云底出屏，视觉上是「海」不是「带」。
  cloud.position.y = -height * 0.18;
  cloud.position.z = -30;
  res.group.add(cloud);

  // ① 骨骼链：每节一个定位节点 + 胶囊节段 + 鳞带。
  const spineGroup = new THREE.Group();
  spineGroup.name = 'dragon-spine';
  res.group.add(spineGroup);

  const scaleGroup = new THREE.Group();
  scaleGroup.name = 'scale-shimmer';
  res.group.add(scaleGroup);

  const bodyRadius = segment * 0.3;
  const nodes: SpineNode[] = [];
  for (let i = 0; i < SPINE_JOINT_COUNT; i += 1) {
    const taper = 1 - (i / SPINE_JOINT_COUNT) * 0.55;
    const joint = new THREE.Object3D();
    joint.name = `spine-joint-${i}`;
    spineGroup.add(joint);

    // 胶囊体首尾相接：节长与 segmentLength 一致，链身因此是连续的一条。
    const seg = res.mesh(
      `spine-seg-${i}`,
      new THREE.CapsuleGeometry(bodyRadius * taper, segment * 0.82, 4, 10),
      additiveMaterial(color, 0),
    );
    joint.add(seg);

    const band = res.mesh(
      `scale-band-${i}`,
      new THREE.PlaneGeometry(segment * 1.02, bodyRadius * 2.4 * taper),
      createAdditivePlaneMaterial({
        uniforms: {
          uColor: { value: color.clone() },
          uPearlColor: { value: pearlColor.clone() },
          uFlow: { value: 0 },
          uAlpha: { value: 0 },
        },
        fragmentShader: SCALE_FRAGMENT,
      }),
    );
    band.position.z = 2;
    scaleGroup.add(band);

    nodes.push({ joint, segment: seg, scale: band });
  }

  // ④ 光珠：核心球 + 光晕。分两个节点，光晕才能独立于核心胀缩。
  const pearlRadius = segment * 0.42;
  const pearl = res.mesh(
    'light-pearl',
    new THREE.SphereGeometry(pearlRadius, 24, 18),
    additiveMaterial(pearlColor, 0),
  );
  pearl.position.z = 6;
  res.group.add(pearl);

  const halo = res.mesh(
    'pearl-halo',
    new THREE.PlaneGeometry(pearlRadius * 7, pearlRadius * 7),
    createAdditivePlaneMaterial({
      uniforms: {
        uColor: { value: pearlColor.clone() },
        uIntensity: { value: 0 },
      },
      fragmentShader: PEARL_HALO_FRAGMENT,
    }),
  );
  halo.position.z = 4;
  res.group.add(halo);

  // ⑤ 龙珠互绕：双环轨道，两环异面才有「互绕」而非同心圆。
  const orbitGroup = new THREE.Group();
  orbitGroup.name = 'pearl-orbit';
  orbitGroup.position.z = 5;
  res.group.add(orbitGroup);

  const orbits = [0, 1].map((i) => {
    const ring = res.mesh(
      `orbit-ring-${i}`,
      new THREE.TorusGeometry(pearlRadius * 2.1, Math.max(1.2, pearlRadius * 0.07), 6, 72),
      additiveMaterial(i === 0 ? pearlColor : color, 0),
    );
    ring.rotation.set(i === 0 ? 1.02 : -0.74, i === 0 ? 0.38 : -0.52, 0);
    orbitGroup.add(ring);
    return ring;
  });

  // ⑦ 龙息：锥形火团，尖端朝喷吐方向，由编排层定位与转向。
  const breath = res.mesh(
    'dragon-breath',
    new THREE.ConeGeometry(segment * 0.5, segment * 2.1, 14, 1, true),
    additiveMaterial('#FF8A3D', 0),
  );
  breath.position.z = 8;
  res.group.add(breath);

  return {
    res, spineGroup, nodes, segment, cloud,
    pearl, halo, orbitGroup, orbits, rain, breath, mist,
  };
}
