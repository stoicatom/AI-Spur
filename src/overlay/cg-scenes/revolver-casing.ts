/**
 * 场景 34 revolver 的 ③ 弹壳层：cannon-es 刚体走**纯抛物线**并落地弹跳。
 *
 * 这是本场景的第二条签名，与全库其它刚体层的分别在**受力谱**：
 * tornado 的碎物整幕被三分量气流场托着、thunder 的碎石被环波逐块掀起、
 * wind 的叶子被涡场推着 —— 它们的轨迹由持续外力塑造。弹壳只在抛出的
 * **那一瞬**吃一次冲量，之后除重力（与微弱空气阻尼）外**不受任何力**，
 * 所以轨迹是教科书抛物线。这条性质是可测的：自由段的竖向位置二阶差分
 * 恒等于 `-g·dt²`。任何补一脚力的实现都会立刻破坏它。
 *
 * 地面不是 cannon 的 Plane，接触在下面解析给出（与 thunder 同源的理由）：
 * Plane 的穿透修正会给出一点向上的速度噪声，把「弹壳真的弹了一下」和
 * 「求解器在推它」混成一笔；解析夹紧后 restitution=0 的单步升幅严格为 0,
 * 弹跳断言才有干净的判据。
 */
import * as THREE from 'three';
import { Body, Box, NaiveBroadphase, Vec3, World } from 'cannon-es';
import type { CgStageContext } from '../cg-scene';
import { additiveMaterial, type SceneResources } from '../cg-scene-kit';
import { MATERIAL_IDENTITIES } from '../material-identity';
import { REVOLVER_DURATION_S } from './revolver-discharge';

/** 物理步长固定 1/60 秒（CLAUDE.md 的确定性步进要求）。 */
export const CASING_STEP = 1 / 60;
/**
 * 弹壳枚数：**不随档位缩放**。
 *
 * 三枚壳是签名载体而非密度堆料——抛物线是本场景与全库其余 41 个场景的
 * 分野，一族同源异相的抛物线才读得出「刚体自由飞行」，只剩一条时读起来
 * 与一个被脚本推着走的装饰物无从区分。降档要减的是火药颗粒那类量大而
 * 单调的东西，不是签名本身（设计规格 §3.1 的「只减密度不移除元素」）。
 */
export const CASING_COUNT = 3;
/** 单次 update 最多补齐的步数：720ms 整幕只需 44 步，留一倍余量。 */
const MAX_CATCHUP = 90;

/**
 * 重力系数（× 画面短边）。
 *
 * 比其它场景（thunder 4.8 / tornado 1.6）大得多，因为整幕只有 720ms：
 * 抛物线必须在约 350ms 内走完「抛出 → 顶点 → 落地」，否则观众看到的是
 * 一个飘着的方块。像素量纲下重力是自由标度量，按幕长反推即可。
 */
const GRAVITY_K = 13;
/**
 * 抛壳初速（× 画面短边 / 秒）的竖向与横向分量。
 *
 * 真左轮的抽壳是手动的，但银幕语言里弹壳总是「叮」地跳出来 —— 取一个
 * 让顶点落在第二幕中段、落地落在第二幕末的初速。
 */
const EJECT_UP = 1.42;
const EJECT_SIDE = 0.42;

/**
 * 弹壳弹性系数。
 *
 * `identity.restitution`（.2）描述的是**整枪**这块实心钢的碰撞响应；
 * 弹壳是薄壁黄铜空壳，落在硬地上会清脆地连跳几下，弹性远高于枪身本体。
 * 用 2.6 倍而非另写一个常数：改素材身份仍会传导过来，两者不脱钩。
 */
const CASING_BOUNCE_GAIN = 2.6;

/** 一枚弹壳：视觉 mesh 与刚体一一绑定。 */
export type CasingShell = {
  readonly mesh: THREE.Mesh;
  readonly body: Body;
  /** 半高（像素），落地夹紧用。 */
  readonly half: number;
  /**
   * **实际**首次触地的时刻（归一化），未落地为 -1。
   *
   * 由运行期的接触判据写入，不存预算值：验收要能区分「真的落地了」
   * 与「按表演到该落地了」。
   */
  landedAt: number;
  /** 触地次数：弹跳的可数证据。 */
  bounces: number;
};

export interface CasingField {
  readonly group: THREE.Group;
  readonly shells: readonly CasingShell[];
  /**
   * cannon world 当前持有的刚体数，dispose 彻底性的唯一可观测量。
   *
   * world 是闭包私有的，外部无从判断 `removeBody` 有没有真的调用——
   * 漏掉它，场景树看起来干净而物理世界仍持有全部刚体。
   */
  readonly bodyCount: number;
  /** 按场景进度推进物理（内部固定步长追赶）。 */
  advance(t: number): void;
  setOpacity(value: number): void;
  dispose(): void;
}

/** 伪随机：同一 (i, salt) 每次一致，抛壳散布可重现。 */
function rand(i: number, salt: number): number {
  return ((Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1 + 1) % 1;
}

/**
 * 建立弹壳场。
 *
 * @param res 场景资源容器
 * @param ctx 场景上下文，quality 决定弹壳数（§3.1 降档只减密度）
 * @param muzzle 抛壳口位置（局部坐标，取转轮附近）
 * @param groundY 地面高度（局部坐标）
 * @param aim 射击朝向符号（+1 向右），弹壳往反侧后上方抛
 * @param startAt 抛壳时刻（整幕归一化，第二幕起）
 */
export function createCasingField(
  res: SceneResources,
  ctx: CgStageContext,
  muzzle: THREE.Vector3,
  groundY: number,
  aim: number,
  startAt: number,
): CasingField {
  const identity = MATERIAL_IDENTITIES.revolver.physical;
  const short = Math.min(ctx.width, ctx.height);
  const group = new THREE.Group();
  group.name = 'casing-field';
  res.group.add(group);
  // 嵌套容器由工具层的递归清理负责，此处无需自己登记回收。

  const world = new World({
    gravity: new Vec3(0, -short * GRAVITY_K, 0),
    broadphase: new NaiveBroadphase(),
    allowSleep: false,
  });

  const bounce = Math.min(0.95, identity.restitution * CASING_BOUNCE_GAIN);
  const material = res.track(additiveMaterial('#C9A227', 0));
  // 黄铜是实体反光而非发光：叠加混合会让弹壳在暗背景上糊成一团。
  material.blending = THREE.NormalBlending;

  const shells: CasingShell[] = [];
  for (let i = 0; i < CASING_COUNT; i += 1) {
    const half = short * 0.011;
    // 抛壳口在转轮侧后方，各壳错开一点避免同点生成。
    const x = muzzle.x - aim * short * (0.05 + rand(i, 5) * 0.04);
    const y = muzzle.y + short * (0.02 + i * 0.03);
    const z = 8 + i;

    const mesh = new THREE.Mesh(
      res.track(new THREE.BoxGeometry(half * 1.1, half * 2.4, half * 1.1)),
      material,
    );
    // `casing-<i>` 与本场景其它前缀互不包含，验收用 /^casing-\d+$/ 精确收集。
    mesh.name = `casing-${i}`;
    mesh.position.set(x, y, z);
    group.add(mesh);

    const body = new Body({
      mass: identity.mass * 0.06,
      shape: new Box(new Vec3(half * 0.55, half * 1.2, half * 0.55)),
      position: new Vec3(x, y, z),
      // drag 身份（.97）转线性阻尼：薄壁空壳有一点空气阻力，但远不足以
      // 破坏抛物线（每步约损 0.05% 速度）。
      linearDamping: 1 - identity.drag,
      angularDamping: 0.04,
      allowSleep: false,
      // 弹壳彼此不撞：三枚同时抛出时互撞的分离冲量会把它们弹出画面
      // （bomb 场景的实测事故），而且地面已解析处理。
      collisionFilterMask: 0,
    });
    // ★ 抛壳冲量在**这里一次性**给完（写成初速），之后 advance 内不再对
    // 刚体施加任何力 —— 这正是「纯抛物线」签名的实现要点。
    body.velocity.set(
      -aim * short * EJECT_SIDE * (0.7 + rand(i, 11) * 0.6),
      short * EJECT_UP * (0.85 + rand(i, 17) * 0.3),
      0,
    );
    body.angularVelocity.set(
      (rand(i, 23) - 0.5) * 18,
      (rand(i, 29) - 0.5) * 18,
      (rand(i, 31) - 0.5) * 26,
    );
    world.addBody(body);
    shells.push({ mesh, body, half, landedAt: -1, bounces: 0 });
  }

  /** 已推进的物理秒数（自 startAt 起算），追赶循环的游标。 */
  let elapsed = 0;

  return {
    group,
    shells,
    get bodyCount() { return world.bodies.length; },

    advance(t: number): void {
      if (t < startAt) return;
      // 目标由**场景时间轴**折算，不用 frameDelta：后者为防跳帧压在 50ms
      // 上限，而 update 可能以任意 t 稀疏调用。
      const target = (t - startAt) * REVOLVER_DURATION_S;
      let guard = 0;
      while (elapsed + CASING_STEP <= target && guard < MAX_CATCHUP) {
        // 自由飞行段**不施加任何力**：重力由 world 积分，别处不再插手。
        world.step(CASING_STEP);
        elapsed += CASING_STEP;
        guard += 1;
        const stepT = startAt + elapsed / REVOLVER_DURATION_S;

        for (const shell of shells) {
          const rest = groundY + shell.half * 1.2;
          const body = shell.body;
          if (body.position.y > rest || body.velocity.y >= 0) continue;
          // 地面接触**完全**在这里给：夹紧 + 按弹性翻转竖直速度。
          body.position.y = rest;
          body.velocity.y = -body.velocity.y * bounce;
          // 摩擦只吃横向：黄铜壳落地会打滑一段再停。
          body.velocity.x *= 1 - identity.friction;
          body.velocity.z *= 1 - identity.friction;
          // 撞地把转动能量甩掉一部分（听得见的那声"叮"）。
          body.angularVelocity.scale(1 - identity.friction, body.angularVelocity);
          if (shell.landedAt < 0) shell.landedAt = stepT;
          shell.bounces += 1;
        }
      }

      for (const shell of shells) {
        // 位姿原样抄自刚体：显示层再夹一次地面会把「没穿透」变成一句
        // 显示层的谎，验收就测不到物理（water 场景已证实）。
        const p = shell.body.position;
        shell.mesh.position.set(p.x, p.y, p.z);
        const q = shell.body.quaternion;
        shell.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      }
    },

    setOpacity(value: number): void {
      material.opacity = value;
    },

    dispose(): void {
      for (const shell of shells) world.removeBody(shell.body);
    },
  };
}
