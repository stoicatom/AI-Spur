/**
 * 场景 08 skull 的元素搭建（规格 §4.2 场景 08 的八元素）。
 *
 * 与编排分离：本文件只负责「把元素立起来」，三幕动作在 cg-skull.ts，
 * 骨屑刚体在 skull-debris.ts，幽魂拖影在 skull-wraith.ts。
 * 拆分理由是 CLAUDE.md 的 250 行上限，也让元素清单能一眼对照规格。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createAdditivePlaneMaterial } from '../cg-shaders';
import { additiveMaterial, createSceneResources, type SceneResources } from '../cg-scene-kit';
import { ASH_RING_FRAGMENT, CRACK_FRAGMENT, MOONLIGHT_FRAGMENT } from './skull-shaders';
import { createWraithTrail, type WraithTrail } from './skull-wraith';
import { buildPhosphorField, buildTombstones, type PhosphorMote } from './skull-ambience';

/** 鬼火青绿：骨白与月光青灰之间的唯一高饱和色，视线自然落在眼窝。 */
const WISP_COLOR = '#6BFFC8';
/** 骨白：略偏黄的旧骨色，纯白会显得像塑料。 */
const BONE_COLOR = '#D8D2BE';
/** 月光青灰：独立于素材色，冷场不跟随鬼火色（见 MOONLIGHT_FRAGMENT 注释）。 */
const MOON_TINT = '#8FA6B8';

/** 头骨半径相对屏短边的比例；骨屑与其余元素的尺度都以它为基准。 */
export const SKULL_RADIUS_RATIO = 0.16;

/** ② 一簇眼窝鬼火：焰体 mesh + 与之绑定的光源（双光源签名的一半）。 */
export type SocketWisp = {
  flame: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  light: THREE.PointLight;
  /** 眼窝锚点（局部坐标），焰体由此喷出。 */
  anchor: THREE.Vector3;
};

export type SkullParts = {
  res: SceneResources;
  /** 头骨参考半径（像素），所有元素尺度以它为基准。 */
  skullR: number;
  /** 地面高度（局部坐标），灰烬环与骨屑地面共用。 */
  groundY: number;
  cranium: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  jaw: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  crack: THREE.ShaderMaterial;
  /** 左右两簇鬼火，索引 0 为左（x 负向）。 */
  wisps: [SocketWisp, SocketWisp];
  wraith: WraithTrail;
  phosphor: PhosphorMote[];
  /** 磷火上升区间高度（像素），飘满半屏。 */
  phosphorSpan: number;
  ashRing: THREE.ShaderMaterial;
  chill: THREE.ShaderMaterial;
  tombstones: THREE.Group;
  setTombstoneOpacity(value: number): void;
  setPhosphorOpacity(value: number): void;
};

/**
 * ② 建一簇眼窝鬼火。
 *
 * 双光源签名的对称性由构造保证：左右共用同一份 |x|，只有符号相反，
 * 不做任何事后校准，因此对称是结构性的而非数值巧合。
 */
function buildWisp(
  res: SceneResources,
  side: 'l' | 'r',
  socketX: number,
  socketY: number,
  skullR: number,
): SocketWisp {
  const sign = side === 'l' ? -1 : 1;
  const anchor = new THREE.Vector3(sign * socketX, socketY, skullR * 0.5);

  const flame = res.mesh(
    `socket-wisp-${side}`,
    new THREE.SphereGeometry(skullR * 0.19, 16, 12),
    additiveMaterial(WISP_COLOR),
  );
  flame.position.copy(anchor);
  res.group.add(flame);

  // 真实光源而非发光贴图：规格签名是「眼窝双光源」，
  // 两盏 PointLight 才能让骨面与墓碑接到来自两个眼窝的照明。
  const light = new THREE.PointLight(new THREE.Color(WISP_COLOR), 0, skullR * 7, 2);
  light.name = `socket-light-${side}`;
  light.position.copy(anchor);
  res.group.add(light);

  return { flame, light, anchor };
}

export function buildSkullParts(ctx: CgStageContext): SkullParts {
  const res = createSceneResources(ctx.root, ctx.origin, 'cg-skull');
  const short = Math.min(ctx.width, ctx.height);
  const skullR = short * SKULL_RADIUS_RATIO;
  const groundY = -ctx.height * 0.4;

  // ⑦ 月光冷场：铺满全屏的青灰背光，最靠后。
  const chill = res.track(createAdditivePlaneMaterial({
    uniforms: {
      uTint: { value: new THREE.Color(MOON_TINT) },
      uTime: { value: 0 },
      uChill: { value: 0 },
    },
    fragmentShader: MOONLIGHT_FRAGMENT,
  }));
  const chillMesh = res.mesh(
    'moonlight-chill',
    new THREE.PlaneGeometry(ctx.width * 1.05, ctx.height * 1.05),
    chill,
  );
  chillMesh.position.z = -40;
  res.group.add(chillMesh);

  // ⑧ 墓碑剪影。
  const tombstoneRow = buildTombstones(res, ctx, groundY);

  // ⑥ 地面灰烬环：贴地环状尘圈，强度由骨屑落地驱动。
  const ashRing = res.track(createAdditivePlaneMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#9AA69B') },
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uLandings: { value: 0 },
    },
    fragmentShader: ASH_RING_FRAGMENT,
  }));
  const ashMesh = res.mesh(
    'ash-ring',
    new THREE.PlaneGeometry(short * 1.5, short * 1.5),
    ashRing,
  );
  // 躺平贴地：绕 x 转 90° 后平面与地面共面。
  ashMesh.rotation.x = -Math.PI / 2;
  ashMesh.position.set(0, groundY, -6);
  res.group.add(ashMesh);

  // ① 头骨 mesh：低多边形骨白球（顶盖）+ 方颌。
  // 低面数球是「低多边形」的直接表达，segments 压到 10×7 才看得出棱面。
  const cranium = res.mesh(
    'skull-cranium',
    new THREE.SphereGeometry(skullR, 10, 7),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(BONE_COLOR), transparent: true, opacity: 1, depthWrite: false,
    }),
  );
  cranium.position.z = 8;
  res.group.add(cranium);

  const jaw = res.mesh(
    'skull-jaw',
    new THREE.BoxGeometry(skullR * 1.1, skullR * 0.44, skullR * 0.8),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(BONE_COLOR), transparent: true, opacity: 1, depthWrite: false,
    }),
  );
  jaw.position.set(0, -skullR * 0.92, 8);
  res.group.add(jaw);

  // ① 裂纹：贴在头骨正面的发光缝，第一幕蔓延。
  const crack = res.track(createAdditivePlaneMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(WISP_COLOR) },
      uTime: { value: 0 },
      uGlow: { value: 0 },
      uSpread: { value: 0 },
    },
    fragmentShader: CRACK_FRAGMENT,
  }));
  const crackMesh = res.mesh(
    'skull-crack',
    new THREE.PlaneGeometry(skullR * 2, skullR * 2),
    crack,
  );
  crackMesh.position.z = skullR * 0.95;
  res.group.add(crackMesh);

  // ② 眼窝鬼火 ×2：对称由 buildWisp 的 sign 保证。
  const socketX = skullR * 0.42;
  const socketY = skullR * 0.12;
  const wisps: [SocketWisp, SocketWisp] = [
    buildWisp(res, 'l', socketX, socketY, skullR),
    buildWisp(res, 'r', socketX, socketY, skullR),
  ];

  // ③ 幽魂拖影：3 层 ghost，位置每帧由鬼火实测轨迹喂入。
  const wraith = createWraithTrail(res, skullR * 1.4);

  // ⑤ 磷火飘浮：贴地起飞、纵向占半屏，构建细节见 skull-ambience。
  const phosphorField = buildPhosphorField(res, ctx, WISP_COLOR, skullR, groundY);

  return {
    res, skullR, groundY, cranium, jaw, crack, wisps, wraith,
    phosphor: phosphorField.motes,
    phosphorSpan: phosphorField.span,
    ashRing, chill,
    tombstones: tombstoneRow.group,
    setTombstoneOpacity: tombstoneRow.setOpacity,
    setPhosphorOpacity: phosphorField.setOpacity,
  };
}
