/**
 * 场景 31 tornado 的 ⑥ 碎物层：cannon-es 刚体在气柱里绕飞。
 *
 * 与其它场景的刚体层机制都不同：这里的力场是**三分量**的——切向
 * （绕轴转）、径向（向心吸入）、竖向（上升气流）。规格互动①「碎物沿
 * 螺旋上升后被甩出」是这三者的**共同后果**，不是脚本化的三段动画：
 * 物体先被吸近 → 进入上升区被抬起 → 升到高处漏斗变宽、离心力超过
 * 入流 → 被甩出去。
 */
import * as THREE from 'three';
import { Body, Box, NaiveBroadphase, Vec3, World } from 'cannon-es';
import type { CgStageContext } from '../cg-scene';
import { scaledCount } from '../cg-particle-kit';
import { additiveMaterial, type SceneResources } from '../cg-scene-kit';
import { MATERIAL_IDENTITIES } from '../material-identity';
import {
  TORNADO_DURATION_S,
  funnelRadius,
  inflowRate,
  swirlOmega,
  updraftRate,
} from './tornado-funnel';

/** 物理步长固定 1/60：确定性步进。 */
const FIXED_STEP = 1 / 60;
/** 单帧最多追赶的物理步数。 */
const MAX_CATCHUP = 320;
/** 碎物不与任何刚体碰撞（只受力场），mask 置 0。 */
const COLLIDE_WITH_NOTHING = 0;
/**
 * 入流作用半径 ÷ 漏斗顶半径。
 *
 * 龙卷的入流范围远大于可见漏斗——可见的只是水汽凝结的那一段，
 * 气流早在更外围就开始向心汇聚。取 2.4 让撒在 0.28–0.62 短边处的碎物
 * 落在 rNorm 0.3–0.7 区间（核边界附近入流最强），从而真的被吸进来。
 */
const INFLOW_REACH = 2.4;

export type JunkPiece = {
  readonly mesh: THREE.Mesh;
  readonly body: Body;
  /** 初始到轴的距离（像素），决定它多久被吸到。 */
  readonly startR: number;
  /** 初始相位，让碎物不成队列。 */
  readonly phase0: number;
};

export interface JunkField {
  readonly group: THREE.Group;
  readonly pieces: readonly JunkPiece[];
  /**
   * 按场景进度推进。
   *
   * @param t 整幕归一化进度
   * @param elapsedS 自碎物层启动以来的场景秒数
   * @param maturityAt 成形度取值函数——**必须逐步采样**，取快照会让
   *   漏斗半径在整个追赶循环里冻结，吸入与甩出的时机全错
   *   （本项目 wind 场景踩过这个坑）
   */
  advance(t: number, elapsedS: number, maturityAt: (sceneT: number) => number): void;
  setOpacity(value: number): void;
  dispose(): void;
}

/**
 * 建立碎物场。
 *
 * @param res 场景资源容器
 * @param ctx 场景上下文，quality 决定刚体数量
 * @param short 画面短边（像素），力场尺度基准
 * @param groundY 地面高度（局部坐标）
 * @param startAt 碎物开始被卷入的时刻（整幕归一化）
 */
export function createJunkField(
  res: SceneResources,
  ctx: CgStageContext,
  short: number,
  groundY: number,
  startAt: number,
): JunkField {
  const identity = MATERIAL_IDENTITIES.tornado.physical;
  const group = new THREE.Group();
  group.name = 'junk-field';
  res.group.add(group);
  // 嵌套容器由工具层的递归清理负责，此处无需自己登记回收。

  // 重力很弱：龙卷里的碎物主要受气流控制，重力只提供一点下坠倾向。
  const world = new World({
    gravity: new Vec3(0, -short * 1.6 * (1 + identity.gravity), 0),
    broadphase: new NaiveBroadphase(),
    allowSleep: false,
  });

  const half = short * 0.012;
  const geometry = res.track(new THREE.BoxGeometry(half * 2, half * 2, half * 2));
  const material = res.track(additiveMaterial('#A89880'));
  material.blending = THREE.NormalBlending;
  material.opacity = 0;

  const count = scaledCount(26, ctx.quality);
  const pieces: JunkPiece[] = [];
  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(geometry, material);
    // 前缀 `junk-` 与场景其它节点（`ring-N` / `rainline-N`）互不包含。
    mesh.name = `junk-${i}`;
    group.add(mesh);

    // 初始撒在漏斗外围：由外往内被吸。
    const startR = short * (0.28 + (i / count) * 0.34);
    const phase0 = (i * 2.399963) % (Math.PI * 2);

    const body = new Body({
      mass: identity.mass,
      shape: new Box(new Vec3(half, half, half)),
      position: new Vec3(
        Math.cos(phase0) * startR,
        groundY + short * 0.02 + (i % 5) * short * 0.01,
        Math.sin(phase0) * startR * 0.3,
      ),
      // drag 转线性阻尼：气流拖曳。
      linearDamping: 1 - identity.drag,
      angularDamping: 0.05,
      allowSleep: false,
      collisionFilterMask: COLLIDE_WITH_NOTHING,
    });
    body.angularVelocity.set(
      ((i * 31) % 100) / 100 * 6 - 3,
      ((i * 17) % 100) / 100 * 6 - 3,
      ((i * 23) % 100) / 100 * 6 - 3,
    );
    world.addBody(body);
    pieces.push({ mesh, body, startR, phase0 });
  }

  let physicsElapsed = 0;
  const force = new Vec3();

  return {
    group,
    pieces,

    advance(t, elapsedS, maturityAt): void {
      if (t < startAt) return;
      let guard = 0;
      while (physicsElapsed + FIXED_STEP <= elapsedS && guard < MAX_CATCHUP) {
        // 时变场：成形度在追赶循环内**逐步采样**。取快照会让漏斗半径
        // 冻结，吸入与甩出的时机全错。
        const sceneT = startAt + physicsElapsed / TORNADO_DURATION_S;
        const maturity = maturityAt(sceneT);

        for (const { body } of pieces) {
          const px = body.position.x;
          const pz = body.position.z;
          // 到轴的水平距离——**龙卷的半径是水平的**，不含高度。
          // 把高度算进半径会让贴地物体「远离轴心」而拿不到上升气流
          // （本项目 wind 场景踩过这个坑，24 片叶子里 12 片从未升起）。
          const rPx = Math.hypot(px, pz) || 1e-6;

          // 归一化半径以**气柱的作用半径**为基准，不是该高度的局部半径。
          //
          // 用局部半径会让贴地物体永远落在远场：地面处漏斗只有 59px 宽，
          // 而碎物撒在 300px 外 → rNorm≈5 → updraftRate≈0，永远拿不到
          // 上升气流，一路往下掉（实测 y 从 -456 掉到 -843）。
          // 真实龙卷的入流是**整个气柱**的作用范围（远大于可见漏斗），
          // 物体先被水平吸近，靠近后才进入上升区。
          // 本项目 wind 场景踩过同源的坑（把高度算进半径，24 片叶子里
          // 12 片从未升起）。
          const reach = funnelRadius(1, short, 1) * INFLOW_REACH;
          const rNorm = rPx / Math.max(1e-6, reach * Math.max(0.25, maturity));

          // ① 切向：绕轴转。方向 = 半径向量旋 90°。
          const omega = swirlOmega(rNorm) * maturity;
          const tx = -pz / rPx;
          const tz = px / rPx;
          // 切向线速度 = ω × r。
          const vTan = omega * rPx;

          // ② 径向：向心吸入（负值表示向内）。
          const vRad = inflowRate(rNorm) * short * maturity;

          // ③ 竖向：上升气流，近轴最强。
          const vUp = updraftRate(rNorm) * short * 1.9 * maturity;

          // 目标速度 = 三分量合成。用「拖向目标速度」的力而非直接改
          // velocity——直接赋值会抹掉重力与角动量。
          const targetX = tx * vTan + (px / rPx) * vRad;
          const targetZ = tz * vTan + (pz / rPx) * vRad;
          const k = 6.5 * body.mass;
          force.set(
            (targetX - body.velocity.x) * k,
            (vUp - body.velocity.y) * k * 0.55,
            (targetZ - body.velocity.z) * k,
          );
          body.applyForce(force);
        }

        world.step(FIXED_STEP);
        physicsElapsed += FIXED_STEP;
        guard += 1;
      }

      for (const { mesh, body } of pieces) {
        mesh.position.set(body.position.x, body.position.y, body.position.z);
        mesh.quaternion.set(
          body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w,
        );
      }
    },

    setOpacity(value): void {
      material.opacity = value;
    },

    dispose(): void {
      for (const { body } of pieces) world.removeBody(body);
    },
  };
}
