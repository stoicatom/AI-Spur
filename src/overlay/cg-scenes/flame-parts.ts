/**
 * 场景 09 flame 的元素搭建。
 *
 * 命名规则：不同性质的节点前缀互不包含（`billet-N` 圆木 /
 * `emberdot-N` 余烬光斑 / `smokewisp-N` 烟丝），避免前缀匹配的
 * 断言测错对象（本项目 cg-scene 命名撞车踩过这个坑）。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createSceneResources, additiveMaterial, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial } from '../cg-shaders';
import {
  FLAME_HEAT_FRAGMENT,
  FLAME_NIGHT_FRAGMENT,
  FLAME_POOL_FRAGMENT,
  FLAME_TONGUE_FRAGMENT,
} from './flame-shaders';

/** 柴堆圆木数：交叉架起的三根。 */
export const BILLET_COUNT = 3;
/** 余烬光斑数（柴堆表面的暗红炭点）。 */
export const EMBER_DOT_COUNT = 7;
/** 烟丝条数。 */
export const SMOKE_WISP_COUNT = 5;

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
type BasicMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

export type SmokeWisp = {
  readonly mesh: BasicMesh;
  /** 该条烟的横向起点偏移与相位。 */
  readonly x0: number;
  readonly phase: number;
  /** 上升速率（归一化高度/幕）。 */
  readonly rise: number;
};

export type FlameParts = {
  readonly res: SceneResources;
  readonly tongue: ShaderMesh;
  readonly heat: ShaderMesh;
  readonly pool: ShaderMesh;
  readonly night: ShaderMesh;
  readonly billets: BasicMesh[];
  readonly emberDots: BasicMesh[];
  readonly smokeWisps: SmokeWisp[];
  /** ⑤ 光影脉动：篝火照亮环境的光晕（正交叠加层里用大范围软光代替 point light）。 */
  readonly glow: BasicMesh;
  readonly tongueWidth: number;
  readonly tongueHeight: number;
  readonly groundY: number;
  readonly short: number;
};

/** 建 flame 场景的全部元素（火星粒子层在 cg-flame.ts 里经 particle hub 建）。 */
export function buildFlameParts(ctx: CgStageContext): FlameParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'flame-scene');
  const short = Math.min(width, height);
  const groundY = -height * 0.34;

  // 火色：素材色往橙红推；内焰取青蓝（完全燃烧的高温色）。
  const outer = color.clone().lerp(new THREE.Color('#FF6A18'), 0.78);
  const inner = color.clone().lerp(new THREE.Color('#4FB4FF'), 0.72);
  const woodColor = new THREE.Color('#4A3524');
  const nightColor = new THREE.Color('#C8D8FF');

  // ⑦ 背景星火：铺满全屏的远景光点，最先建所以压在最底层。
  const night = res.mesh(
    'night-sparks',
    new THREE.PlaneGeometry(width, height),
    createAdditivePlaneMaterial({
      fragmentShader: FLAME_NIGHT_FRAGMENT,
      uniforms: {
        uColor: { value: nightColor },
        uAlpha: { value: 0 },
        uTime: { value: 0 },
      },
    }),
  );
  night.position.set(0, 0, -30);
  res.group.add(night);

  // ⑧ 地面光池：柴堆脚下。
  const pool = res.mesh(
    'ground-pool',
    new THREE.PlaneGeometry(short * 1.05, short * 0.42),
    createAdditivePlaneMaterial({
      fragmentShader: FLAME_POOL_FRAGMENT,
      uniforms: {
        uColor: { value: outer },
        uAlpha: { value: 0 },
        uGate: { value: 0 },
      },
    }),
  );
  pool.position.set(0, groundY, -16);
  res.group.add(pool);

  // ⑤ 光影脉动：大范围软光晕。正交叠加层里 point light 不参与光照，
  // 用一枚随门控缩放的软光片代替，观感等价且成本近零。
  const glow = res.mesh(
    'light-pulse',
    new THREE.CircleGeometry(short * 0.62, 48),
    additiveMaterial(outer),
  );
  glow.position.set(0, groundY + short * 0.24, -18);
  res.group.add(glow);

  // ④ 柴堆：三根交叉圆木。规格「柴堆+光影脉动全库唯一」。
  const billets: BasicMesh[] = [];
  for (let i = 0; i < BILLET_COUNT; i += 1) {
    const len = short * (0.3 + (i % 2) * 0.06);
    const geometry = res.track(new THREE.CylinderGeometry(short * 0.022, short * 0.02, len, 12));
    const material = res.track(new THREE.MeshBasicMaterial({ color: woodColor, transparent: true, opacity: 0 }));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `billet-${i}`;
    // 交叉架起：绕 z 转不同角度后横放，形成经典的井字堆。
    mesh.rotation.z = Math.PI / 2 + (i - 1) * 0.52;
    mesh.position.set((i - 1) * short * 0.05, groundY + short * 0.02, -10 + i);
    res.group.add(mesh);
    billets.push(mesh);
  }

  // 余烬光斑：柴堆表面的炭点，第三幕明焰退去后最亮。
  const emberDots: BasicMesh[] = [];
  for (let i = 0; i < EMBER_DOT_COUNT; i += 1) {
    const geometry = res.track(new THREE.CircleGeometry(short * (0.008 + (i % 3) * 0.003), 12));
    const material = res.track(additiveMaterial('#FF4A10'));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `emberdot-${i}`;
    // 撒在柴堆宽度内、贴着圆木表面。
    mesh.position.set(
      ((i / (EMBER_DOT_COUNT - 1)) - 0.5) * short * 0.26,
      groundY + short * (0.016 + ((i * 37) % 5) * 0.006),
      -9,
    );
    res.group.add(mesh);
    emberDots.push(mesh);
  }

  // ① 火舌：驻留在柴堆上方的连续火焰流。
  const tongueWidth = short * 0.46;
  // 规格「火舌中心覆盖 1/3 屏高」。
  const tongueHeight = height * 0.36;
  const tongue = res.mesh(
    'flame-tongue',
    new THREE.PlaneGeometry(tongueWidth, tongueHeight),
    createAdditivePlaneMaterial({
      fragmentShader: FLAME_TONGUE_FRAGMENT,
      uniforms: {
        uColor: { value: outer },
        uCoreColor: { value: inner },
        uAlpha: { value: 0 },
        uTime: { value: 0 },
        uHeight: { value: 0 },
        uFlicker: { value: 0 },
      },
    }),
  );
  // 贴片下沿贴住柴堆顶面：火从柴上烧起来。
  tongue.position.set(0, groundY + short * 0.03 + tongueHeight * 0.5, -8);
  res.group.add(tongue);

  // ⑥ 烟丝：细烟上升。用窄长条 mesh，不用粒子——烟丝是连续的丝状体。
  const smokeWisps: SmokeWisp[] = [];
  for (let i = 0; i < SMOKE_WISP_COUNT; i += 1) {
    const geometry = res.track(new THREE.PlaneGeometry(
      Math.max(1.4, short * 0.008),
      short * (0.16 + (i % 3) * 0.05),
    ));
    const material = res.track(new THREE.MeshBasicMaterial({
      color: '#8A8478',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
    }));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `smokewisp-${i}`;
    mesh.position.z = -7;
    res.group.add(mesh);
    smokeWisps.push({
      mesh,
      x0: ((i / (SMOKE_WISP_COUNT - 1)) - 0.5) * short * 0.2,
      phase: (i * 2.399963) % (Math.PI * 2),
      rise: 0.6 + ((i * 29) % 100) / 100 * 0.5,
    });
  }

  // ③ 热浪：压在火舌之上、覆盖火柱与其上方一带。
  const heat = res.mesh(
    'heat-shimmer',
    new THREE.PlaneGeometry(short * 0.9, height * 0.72),
    createAdditivePlaneMaterial({
      fragmentShader: FLAME_HEAT_FRAGMENT,
      uniforms: {
        uColor: { value: outer },
        uAlpha: { value: 0 },
        uTime: { value: 0 },
        uStrength: { value: 0 },
      },
    }),
  );
  heat.position.set(0, groundY + height * 0.3, -4);
  res.group.add(heat);

  return {
    res, tongue, heat, pool, night, billets, emberDots, smokeWisps, glow,
    tongueWidth, tongueHeight, groundY, short,
  };
}
