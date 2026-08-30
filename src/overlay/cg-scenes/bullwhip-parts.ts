/**
 * 场景 37 bullwhip 的元素搭建。
 *
 * 命名规则：不同性质的节点前缀互不包含——`lash-N` 鞭身段 /
 * `ghostseg-N` 残影段 / `sonic-ring` 音爆环 / `acoustic-ring` 声纹环，
 * 避免前缀匹配的断言测错对象（revolver 踩过这个坑）。
 *
 * **链段数不过 `scaledCount`**：它是签名①的载体，任何档位都是
 * `CHAIN_SEGMENTS` 段。降档只减 quarks 火花的粒子预算。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { additiveMaterial, createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial } from '../cg-shaders';
import { CHAIN_SEGMENTS } from './whip-chain';
import {
  SONIC_RING_FRAGMENT,
  WHIP_ACOUSTIC_FRAGMENT,
  WHIP_VORTEX_FRAGMENT,
} from './bullwhip-shaders';

/** ⑥ 阻尼摆动的残影段数：稀疏采样鞭身，画出摆动轨迹的拖尾。 */
export const GHOST_SEGMENTS = 8;

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
type BasicMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

export type BullwhipParts = {
  readonly res: SceneResources;
  /** ① 鞭身：CHAIN_SEGMENTS 段，逐段定位在链的关节之间。 */
  readonly lash: BasicMesh[];
  /** ② 鞭梢光点。 */
  readonly tipGlow: BasicMesh;
  /** ③ 音爆环（内外双层激波，单 mesh 双层 shader）。 */
  readonly sonicRing: ShaderMesh;
  /** ⑤ 鞭声纹（多道细环线）。 */
  readonly acousticRing: ShaderMesh;
  /** ⑥ 阻尼摆动的残影段。 */
  readonly ghosts: BasicMesh[];
  /** ⑦ 手部剪影（持柄暗影）。 */
  readonly hand: BasicMesh;
  /** ⑧ 搅动气流（贴地涡）。 */
  readonly vortex: ShaderMesh;
  /** 鞭身摆动的枢轴容器：残影与鞭身都挂它，阻尼转角施加于它。 */
  readonly swayRig: THREE.Group;
  /** 整鞭长（像素）：归一化链长坐标到屏幕坐标的换算尺。 */
  readonly lashLength: number;
  /** 手柄锚点（像素，相对 res.group）。 */
  readonly handAnchor: THREE.Vector2;
  readonly short: number;
};

/**
 * 建 bullwhip 场景的全部可见元素。
 *
 * @param ctx 场景上下文
 */
export function buildBullwhipParts(ctx: CgStageContext): BullwhipParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'bullwhip-scene');
  const short = Math.min(width, height);

  // 配色：鞭身是深棕皮革，梢端与音爆是白热，声纹偏冷。
  const leather = color.clone().lerp(new THREE.Color('#5A3A22'), 0.78);
  const hot = color.clone().lerp(new THREE.Color('#FFF1CC'), 0.82);
  const gold = color.clone().lerp(new THREE.Color('#FFC24A'), 0.7);
  const cool = color.clone().lerp(new THREE.Color('#CFE4FF'), 0.6);
  const dust = color.clone().lerp(new THREE.Color('#B9A88E'), 0.72);

  // 鞭路横贯全屏（规格「全屏」）：整鞭长取全宽的 0.92 倍。
  const lashLength = width * 0.92;
  // 手柄在画面左下：鞭甩出去后正好横贯到右侧屏缘。
  const handAnchor = new THREE.Vector2(-width * 0.36, -height * 0.2);

  // ⑥ 摆动枢轴：鞭身与残影挂它，阻尼转角施加一处、整鞭跟着摆。
  const swayRig = new THREE.Group();
  swayRig.name = 'sway-rig';
  swayRig.position.set(handAnchor.x, handAnchor.y, 0);
  res.group.add(swayRig);

  // ① 鞭身：每段一片细长 plane，段长沿链递减（真鞭由粗到细）。
  const segPx = lashLength / CHAIN_SEGMENTS;
  const lash: BasicMesh[] = [];
  for (let i = 0; i < CHAIN_SEGMENTS; i += 1) {
    const u = i / (CHAIN_SEGMENTS - 1);
    // 粗细锥度：手端约屏短边的 1.4%，梢端收到两成。
    const thick = short * 0.014 * (1 - u * 0.8);
    const mesh = res.mesh(
      `lash-${i}`,
      new THREE.PlaneGeometry(segPx, Math.max(1.2, thick)),
      // 鞭身是实体皮革，用常规混合；梢端几段掺入热光。
      res.track(new THREE.MeshBasicMaterial({
        color: leather.clone().lerp(hot, u * u * 0.7),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })),
    );
    mesh.position.z = 4;
    swayRig.add(mesh);
    lash.push(mesh);
  }

  // ⑥ 阻尼残影：稀疏采样鞭身，透明度更低，滞后于本体。
  const ghosts: BasicMesh[] = [];
  for (let i = 0; i < GHOST_SEGMENTS; i += 1) {
    const mesh = res.mesh(
      `ghostseg-${i}`,
      new THREE.PlaneGeometry(segPx * 1.6, Math.max(1, short * 0.008)),
      additiveMaterial(leather.clone().lerp(gold, 0.35)),
    );
    mesh.position.z = 3;
    swayRig.add(mesh);
    ghosts.push(mesh);
  }

  // ② 鞭梢光点：高速末梢的白热光斑。
  const tipGlow = res.mesh(
    'tip-glow',
    new THREE.PlaneGeometry(short * 0.09, short * 0.09),
    additiveMaterial(hot),
  );
  tipGlow.position.z = 6;
  res.group.add(tipGlow);

  // ③ 音爆环：位置在 update 里设到「音爆那一刻梢的位置」。
  const sonicRing = res.mesh(
    'sonic-ring',
    new THREE.PlaneGeometry(short * 1.5, short * 1.5),
    createAdditivePlaneMaterial({
      fragmentShader: SONIC_RING_FRAGMENT,
      uniforms: {
        uColor: { value: gold },
        uCoreColor: { value: hot },
        uProgress: { value: 0 },
        uAlpha: { value: 0 },
      },
    }),
  );
  sonicRing.position.z = 5;
  res.group.add(sonicRing);

  // ⑤ 鞭声纹：与音爆环同源点，铺得更开（声波跑得比激波远）。
  const acousticRing = res.mesh(
    'acoustic-ring',
    new THREE.PlaneGeometry(short * 2.2, short * 2.2),
    createAdditivePlaneMaterial({
      fragmentShader: WHIP_ACOUSTIC_FRAGMENT,
      uniforms: {
        uColor: { value: cool },
        uProgress: { value: 0 },
        uAlpha: { value: 0 },
      },
    }),
  );
  acousticRing.position.z = 2;
  res.group.add(acousticRing);

  // ⑦ 手部剪影：持柄的暗影，挂在手柄锚点。
  const hand = res.mesh(
    'hand-silhouette',
    new THREE.PlaneGeometry(short * 0.11, short * 0.14),
    res.track(new THREE.MeshBasicMaterial({
      color: leather.clone().lerp(new THREE.Color('#1A1208'), 0.7),
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })),
  );
  hand.position.set(handAnchor.x, handAnchor.y, 7);
  res.group.add(hand);

  // ⑧ 搅动气流：贴地涡，位于鞭路下方的地面高度。
  const vortex = res.mesh(
    'ground-vortex',
    new THREE.PlaneGeometry(short * 1.1, short * 1.1),
    createAdditivePlaneMaterial({
      fragmentShader: WHIP_VORTEX_FRAGMENT,
      uniforms: {
        uColor: { value: dust },
        uTime: { value: 0 },
        uAlpha: { value: 0 },
        uSwirl: { value: 0 },
      },
    }),
  );
  vortex.position.set(0, -height * 0.34, 1);
  res.group.add(vortex);

  return {
    res, lash, tipGlow, sonicRing, acousticRing, ghosts, hand, vortex,
    swayRig, lashLength, handAnchor, short,
  };
}
