/**
 * 场景 05 ninja-star 的 ⑥ 落地火星：cannon-es 小碎片弹跳。
 *
 * 与 revolver 弹壳（纯抛物线）的分野在**起因**：火星不是一次抛射，而是
 * **在切点被崩出来的**（规格互动②「火星从切点崩出」）。所以每颗火星有
 * 自己的诞生时刻 `bornAt`，取自 `orbitCuspTimes()` 的两个切点——切点时刻
 * 改了，火星的崩出时刻跟着改，这是数据依赖而非各自定时。
 *
 * 崩出前刚体被**冻结**（不参与积分）：否则整幕从头就在下落，落地时刻会
 * 早于切点，「从切点崩出」就成了一句注释里的话。
 *
 * 地面接触解析给出（与 revolver / thunder 同源的理由）：cannon 的 Plane
 * 穿透修正会掺入向上的速度噪声，把「火星真的弹了一下」和「求解器在推它」
 * 混成一笔。解析夹紧后弹跳的单步升幅才有干净的判据。
 */
import * as THREE from 'three';
import { Body, NaiveBroadphase, Sphere, Vec3, World } from 'cannon-es';
import type { CgStageContext } from '../cg-scene';
import { additiveMaterial, type SceneResources } from '../cg-scene-kit';
import { scaledCount } from '../cg-particle-kit';
import { MATERIAL_IDENTITIES } from '../material-identity';
import { NINJA_DURATION_S, orbitAt, orbitCuspTimes } from './shuriken-orbit';

/** 物理步长固定 1/60 秒（CLAUDE.md 的确定性步进要求）。 */
export const SPARK_STEP = 1 / 60;
/**
 * 电影级火星数。
 *
 * 这一层**是**密度堆料而非签名载体，所以走 `scaledCount`：降档后更稀疏，
 * 但元素不会消失（§3.1）。签名载体是残影层数与回旋曲线，那两处不缩放。
 */
export const SPARK_COUNT = 16;
/** 单次 update 最多补齐的步数：1200ms 整幕 72 步，留一倍余量。 */
const MAX_CATCHUP = 150;

/** 重力系数（× 画面短边）：火星要在半幕内落到地面并弹几下。 */
const GRAVITY_K = 6.4;
/** 崩出初速（× 画面短边 / 秒）。 */
const BURST_SPEED = 0.62;

/**
 * 火星弹性增益。
 *
 * `identity.restitution`（.66）是**整枚手里剑**这块实心钢的碰撞响应；
 * 崩下来的火星是更小更硬的碎屑，弹得更脆。用增益而非另写常数：
 * 改素材身份仍会传导过来，两者不脱钩。
 */
const SPARK_BOUNCE_GAIN = 1.25;

/** 一颗火星：显示体 + 刚体 + 它的崩出身份。 */
export type SparkBit = {
  readonly mesh: THREE.Mesh;
  readonly body: Body;
  readonly radius: number;
  /** 崩出时刻（归一化）：取自某个回旋切点。 */
  readonly bornAt: number;
  /** 它来自哪个切点（0 或 1）——「从切点崩出」的可查证据。 */
  readonly cusp: number;
  /** **实际**首次触地时刻（归一化），未落地为 -1。 */
  landedAt: number;
  /** 触地次数：弹跳的可数证据。 */
  bounces: number;
};

export interface SparkField {
  readonly group: THREE.Group;
  readonly bits: readonly SparkBit[];
  /** cannon world 当前持有的刚体数，dispose 彻底性的唯一可观测量。 */
  readonly bodyCount: number;
  advance(t: number): void;
  setOpacity(value: number): void;
  dispose(): void;
}

/** 伪随机：同一 (i, salt) 每次一致，火星散布可重现。 */
function rand(i: number, salt: number): number {
  return ((Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1 + 1) % 1;
}

/**
 * 建立火星场。
 *
 * @param res 场景资源容器
 * @param ctx 场景上下文（quality 只影响火星数）
 * @param orbitScale 环的世界尺度
 * @param center 环起点（场景局部坐标）
 * @param groundY 地面高度
 */
export function createSparkField(
  res: SceneResources,
  ctx: CgStageContext,
  orbitScale: THREE.Vector2,
  center: THREE.Vector2,
  groundY: number,
): SparkField {
  const identity = MATERIAL_IDENTITIES['ninja-star'].physical;
  const short = Math.min(ctx.width, ctx.height);
  const group = new THREE.Group();
  group.name = 'spark-swarm';
  res.group.add(group);
  // 嵌套容器由工具层的递归清理负责，此处无需自己登记回收。

  const world = new World({
    gravity: new Vec3(0, -short * GRAVITY_K, 0),
    broadphase: new NaiveBroadphase(),
    allowSleep: false,
  });

  const bounce = Math.min(0.95, identity.restitution * SPARK_BOUNCE_GAIN);
  const material = res.track(additiveMaterial('#FFD9A0', 0));
  const count = scaledCount(SPARK_COUNT, ctx.quality);
  const cuspTimes = orbitCuspTimes();

  const bits: SparkBit[] = [];
  for (let i = 0; i < count; i += 1) {
    // 两个切点各分一半火星：崩出点与崩出时刻都取自切点。
    const cusp = i % 2;
    const bornAt = cuspTimes[cusp];
    // 崩出位置 = 手里剑在该切点时刻的所在（闭式求值，不靠运行期抓位置）。
    const p = orbitAt(bornAt);
    const radius = short * 0.006 * (0.6 + rand(i, 3) * 0.9);
    const x = center.x + p.x * orbitScale.x + (rand(i, 7) - 0.5) * short * 0.02;
    const y = center.y + p.y * orbitScale.y + (rand(i, 13) - 0.5) * short * 0.02;
    const z = 6 + (i % 4);

    const mesh = new THREE.Mesh(
      res.track(new THREE.CircleGeometry(radius, 8)),
      material,
    );
    // `spark-<i>` 与 `ghost-` / `rimline-` 互不包含，验收用精确正则收集。
    mesh.name = `spark-${i}`;
    mesh.position.set(x, y, z);
    group.add(mesh);

    const body = new Body({
      mass: identity.mass * 0.04,
      shape: new Sphere(radius),
      position: new Vec3(x, y, z),
      linearDamping: 1 - identity.drag,
      angularDamping: 0.05,
      allowSleep: false,
      // 火星彼此不撞：同点附近生成时互撞的分离冲量会把它们弹出画面
      // （bomb 场景的实测事故），而且地面已解析处理。
      collisionFilterMask: 0,
      // 崩出前冻结：整幕从头下落会让落地早于切点。
      type: Body.STATIC,
    });
    // 崩出速度朝外下方散开（被刃口刮下来的方向）。
    const spread = (rand(i, 17) - 0.5) * Math.PI * 0.9;
    const dir = cusp === 0 ? 1 : -1;
    body.velocity.set(
      Math.sin(spread) * short * BURST_SPEED * dir * (0.6 + rand(i, 19) * 0.8),
      Math.abs(Math.cos(spread)) * short * BURST_SPEED * (0.3 + rand(i, 23) * 0.7),
      0,
    );
    world.addBody(body);
    bits.push({ mesh, body, radius, bornAt, cusp, landedAt: -1, bounces: 0 });
  }

  /** 已推进的物理秒数（自最早崩出时刻起算），追赶循环的游标。 */
  let elapsed = 0;
  const firstBorn = Math.min(...bits.map((b) => b.bornAt));

  return {
    group,
    bits,
    get bodyCount() { return world.bodies.length; },

    advance(t: number): void {
      if (t < firstBorn) return;
      // 目标由**场景时间轴**折算，不用 frameDelta：后者为防跳帧压在 50ms
      // 上限，而 update 可能以任意 t 稀疏调用。
      const target = (t - firstBorn) * NINJA_DURATION_S;
      let guard = 0;
      while (elapsed + SPARK_STEP <= target && guard < MAX_CATCHUP) {
        const stepT = firstBorn + (elapsed + SPARK_STEP) / NINJA_DURATION_S;
        // 到点的火星在这一步解冻：崩出时刻是切点，不是开幕。
        for (const bit of bits) {
          if (bit.body.type === Body.STATIC && stepT >= bit.bornAt) {
            bit.body.type = Body.DYNAMIC;
            bit.body.updateMassProperties();
          }
        }
        world.step(SPARK_STEP);
        elapsed += SPARK_STEP;
        guard += 1;

        for (const bit of bits) {
          if (bit.body.type === Body.STATIC) continue;
          const rest = groundY + bit.radius;
          const body = bit.body;
          if (body.position.y > rest || body.velocity.y >= 0) continue;
          // 地面接触**完全**在这里给：夹紧 + 按弹性翻转竖直速度。
          body.position.y = rest;
          body.velocity.y = -body.velocity.y * bounce;
          body.velocity.x *= 1 - identity.friction;
          if (bit.landedAt < 0) bit.landedAt = stepT;
          bit.bounces += 1;
        }
      }

      for (const bit of bits) {
        // 位姿原样抄自刚体：显示层再夹一次地面会把「没穿透」变成一句
        // 显示层的谎，验收就测不到物理（water 场景已证实）。
        const p = bit.body.position;
        bit.mesh.position.set(p.x, p.y, p.z);
      }
    },

    setOpacity(value: number): void {
      material.opacity = value;
    },

    dispose(): void {
      for (const bit of bits) world.removeBody(bit.body);
    },
  };
}
