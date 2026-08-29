/**
 * 场景 06 katana 的元素搭建（规格 §4.2 场景 06 的八元素）。
 *
 * 与编排分离：本文件只负责「把元素立起来」，三幕动作在 cg-katana.ts。
 * 拆分理由是 CLAUDE.md 的 250 行上限，也让元素清单能一眼对照规格。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { additiveMaterial, createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import { scaledCount } from '../cg-particle-kit';
import {
  AURA_ARC_FRAGMENT, GHOST_FRAGMENT, MOONLIGHT_FRAGMENT, SCREEN_CRACK_FRAGMENT,
} from './katana-shaders';
import { createSilkCloth, type SilkCloth } from './katana-silk';

/** 规格「3 层 ghost 定格」是形态定义，不随档位缩减。 */
export const GHOST_LAYERS = 3;

/** 一片火花条纹：沿斩击线飞溅，位置由线上的归一化站位决定。 */
export type SparkStreak = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** 在斩击线上的站位（-1 线首 → 1 线尾）。 */
  seat: number;
  /** 溅开相位，让火花不是齐刷刷一排。 */
  phase: number;
};

export type KatanaParts = {
  res: SceneResources;
  /** 斩击轴（单位向量），全场景共用的唯一方向源。 */
  axis: THREE.Vector2;
  /** 斩击轴与 x 轴夹角（弧度）。 */
  angle: number;
  /** 斩击线半长（像素），覆盖对角线所需。 */
  reach: number;
  /** ① 刀身容器与刃高光带。 */
  blade: THREE.Group;
  bladeEdge: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  bladeFace: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** ② 斩击线（亮白细线）与两侧辉光。 */
  slashLine: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  slashGlow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** ③ 刀气弧。 */
  auraArc: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** ④ 斩击火花。 */
  sparkGroup: THREE.Group;
  sparks: SparkStreak[];
  /** ⑤ 残影定格（恰好 3 层）。 */
  ghosts: Array<THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>>;
  /** ⑥ 屏裂闪光。 */
  crackFlash: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** ⑦ 绸布飘落。 */
  silk: SilkCloth;
  /** ⑧ 月光静场。 */
  moonlight: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
};

/** 伪随机：同一 i 每次构建结果一致，火花分布因此可重现。 */
function rand(i: number, salt: number): number {
  return ((Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1 + 1) % 1;
}

export function buildKatanaParts(ctx: CgStageContext): KatanaParts {
  const res = createSceneResources(ctx.root, ctx.origin, 'cg-katana');
  const { width, height, quality } = ctx;
  const steel = new THREE.Color('#EAF2FF');
  const moonTint = new THREE.Color('#8FA8D8');

  // 斩击轴：规格要求「横贯全屏对角线」，方向取屏幕对角。
  // 不用 ctx.direction——那是挥鞭方向，会让「对角线」时有时无。
  const angle = Math.atan2(height, width);
  const axis = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
  // 半长按对角线全长再留 4% 裕量：线端要露出屏外，斩击才是「横贯」而非「一段」。
  const reach = Math.hypot(width, height) * 0.52;

  // ⑧ 月光静场：铺在最底，第一幕唯一在场的元素。
  const moonlight = res.mesh(
    'moonlight-still',
    new THREE.PlaneGeometry(width, height),
    createBlendedPlaneMaterial({
      uniforms: {
        uColor: { value: moonTint.clone() },
        uGlow: { value: 0 },
        uDark: { value: 0 },
        // 月亮偏右上，与从左下起手的斩击方向相对，构图不挤在一处。
        uMoon: { value: new THREE.Vector2(0.52, 0.46) },
      },
      fragmentShader: MOONLIGHT_FRAGMENT,
    }),
  );
  moonlight.position.z = -40;
  res.group.add(moonlight);

  // ⑦ 绸布：挂在偏左上，正好落在斩击线经过的路径上——不然弧永远扫不到它。
  const silk = createSilkCloth(
    res, ctx, axis,
    new THREE.Vector2(-width * 0.12, height * 0.16),
  );

  // ⑤ 残影定格：三层同源人影，倾斜量递增。
  const ghosts: Array<THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>> = [];
  const ghostGroup = new THREE.Group();
  ghostGroup.name = 'afterimage-ghosts';
  ghostGroup.position.z = -12;
  res.group.add(ghostGroup);
  for (let i = 0; i < GHOST_LAYERS; i += 1) {
    const ghost = res.mesh(
      `ghost-layer-${i}`,
      new THREE.PlaneGeometry(width * 0.19, height * 0.52),
      createAdditivePlaneMaterial({
        uniforms: {
          uColor: { value: steel.clone() },
          uFade: { value: 0 },
          uSkew: { value: 0.12 + i * 0.16 },
        },
        fragmentShader: GHOST_FRAGMENT,
      }),
    );
    // 三层沿斩击轴后拖：定格影是「刚才在哪」，所以摆在斩击来向。
    const back = -(i + 1) * width * 0.075;
    ghost.position.set(axis.x * back, axis.y * back, 0);
    ghostGroup.add(ghost);
    ghosts.push(ghost);
  }

  // ② 斩击线：具名元素直接是那条亮白细线本身，两侧辉光挂作子节点。
  // 不套一层同名 Group——Group 没有材质，按 name 读 opacity 会恒为 0，
  // 让「线亮没亮」的断言永远为真却什么都没测到。
  const slashLine = res.mesh(
    'slash-line',
    new THREE.PlaneGeometry(reach * 2, Math.max(2, height * 0.004)),
    additiveMaterial('#FFFFFF', 0),
  );
  slashLine.rotation.z = angle;
  slashLine.position.z = 14;
  res.group.add(slashLine);

  const slashGlow = res.mesh(
    'slash-glow',
    new THREE.PlaneGeometry(reach * 2, height * 0.075),
    additiveMaterial(steel, 0),
  );
  // 子节点继承细线的旋转，辉光因此永远与线同角度，不会两处各转一次。
  slashGlow.position.z = -2;
  slashLine.add(slashGlow);

  // ③ 刀气弧：贴着斩击线，宽度覆盖对角线跨度。
  const auraArc = res.mesh(
    'aura-arc',
    new THREE.PlaneGeometry(reach * 1.9, height * 0.66),
    createAdditivePlaneMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#CFE4FF') },
        uSweep: { value: 0 },
        uThickness: { value: 0.09 },
      },
      fragmentShader: AURA_ARC_FRAGMENT,
    }),
  );
  auraArc.rotation.z = angle;
  auraArc.position.z = 10;
  res.group.add(auraArc);

  // ① 刀身：斜面 mesh（刀面）+ 刃高光带，整体沿斩击轴摆放。
  const blade = new THREE.Group();
  blade.name = 'blade-body';
  blade.rotation.z = angle;
  blade.position.z = 20;
  res.group.add(blade);

  const bladeLength = Math.min(width, height) * 0.42;
  const bladeFace = res.mesh(
    'blade-face',
    new THREE.PlaneGeometry(bladeLength, height * 0.022),
    additiveMaterial('#9FB4D6', 0),
  );
  bladeFace.material.blending = THREE.NormalBlending;
  const bladeEdge = res.mesh(
    'blade-edge',
    new THREE.PlaneGeometry(bladeLength, Math.max(1.5, height * 0.005)),
    additiveMaterial('#FFFFFF', 0),
  );
  bladeEdge.position.set(0, height * 0.011, 2);
  blade.add(bladeFace, bladeEdge);

  // ④ 斩击火花：全部坐在斩击线上，seat 决定站位（互动②）。
  const sparkGroup = new THREE.Group();
  sparkGroup.name = 'slash-sparks';
  sparkGroup.position.z = 18;
  res.group.add(sparkGroup);

  const sparkCount = scaledCount(26, quality);
  const sparks: SparkStreak[] = [];
  for (let i = 0; i < sparkCount; i += 1) {
    const length = height * 0.02 * (0.6 + rand(i, 3) * 1.1);
    const mesh = res.mesh(
      `spark-streak-${i}`,
      new THREE.PlaneGeometry(length, Math.max(1, height * 0.0022)),
      additiveMaterial(i % 4 === 0 ? '#FFFFFF' : '#FFD9A0', 0),
    );
    // 沿线均匀铺开而非随机：火花要标出整条斩击线，随机会留下空段。
    const seat = sparkCount === 1 ? 0 : (i / (sparkCount - 1)) * 2 - 1;
    mesh.rotation.z = angle;
    sparkGroup.add(mesh);
    sparks.push({ mesh, seat, phase: rand(i, 7) });
  }

  // ⑥ 屏裂闪光：最上层，覆盖全屏。
  const crackFlash = res.mesh(
    'screen-crack-flash',
    new THREE.PlaneGeometry(width, height),
    createAdditivePlaneMaterial({
      uniforms: {
        uFlash: { value: 0 },
        uAngle: { value: angle },
        uTint: { value: steel.clone() },
      },
      fragmentShader: SCREEN_CRACK_FRAGMENT,
    }),
  );
  crackFlash.position.z = 30;
  res.group.add(crackFlash);

  return {
    res, axis, angle, reach,
    blade, bladeEdge, bladeFace,
    slashLine, slashGlow, auraArc,
    sparkGroup, sparks, ghosts, crackFlash, silk, moonlight,
  };
}
