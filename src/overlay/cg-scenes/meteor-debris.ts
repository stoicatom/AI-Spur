/**
 * 场景 17 meteor 的 ③ 剥落碎片层：cannon-es 刚体沿轨迹甩出。
 *
 * 与 bomb 的碎片场（同点起爆、径向散开）机制不同：这里碎片是
 * **沿飞行轨迹陆续剥离**的——每片有自己的剥离时刻，剥离瞬间继承
 * 陨核当时的位置与速度，再叠加一个侧向甩出分量。这让碎片轨迹
 * 呈「沿主轨排开的扇面」而非「一朵球」。
 */
import * as THREE from 'three';
import { Body, Box, NaiveBroadphase, Plane, Vec3, World } from 'cannon-es';
import type { CgStageContext } from '../cg-scene';
import { scaledCount } from '../cg-particle-kit';
import { additiveMaterial, type SceneResources } from '../cg-scene-kit';
import { MATERIAL_IDENTITIES } from '../material-identity';

/** 物理步长固定 1/60：确定性步进，渲染帧率不影响碎片轨迹。 */
const FIXED_STEP = 1 / 60;
/** 单帧最多追赶的物理步数，防止大跳时卡死。 */
const MAX_CATCHUP = 240;

const GROUP_GROUND = 1;
const GROUP_PIECE = 2;

export type DebrisPiece = {
  readonly mesh: THREE.Mesh;
  readonly body: Body;
  /** 剥离时刻（整幕归一化），到点才入物理世界。 */
  readonly at: number;
  /** 侧向甩出方向（-1 或 +1）与幅度系数。 */
  readonly lateral: number;
  released: boolean;
};

export interface DebrisField {
  readonly group: THREE.Group;
  readonly pieces: readonly DebrisPiece[];
  /**
   * 按场景进度推进：先释放到点的碎片，再把物理推到目标时刻。
   *
   * @param t 整幕归一化进度
   * @param elapsedS 自碎片层启动以来的场景秒数（不是渲染 delta）
   * @param core 陨核当前位置，剥离时碎片继承它
   * @param coreVel 陨核当前速度（像素/秒）
   */
  advance(t: number, elapsedS: number, core: THREE.Vector3, coreVel: THREE.Vector3): void;
  setOpacity(value: number): void;
  dispose(): void;
}

/**
 * 建立剥落碎片场。
 *
 * @param res 场景资源容器
 * @param ctx 场景上下文，quality 决定刚体数量
 * @param scale 长度尺度（像素），重力与初速都以它为基准
 * @param groundY 地面高度（局部坐标）
 * @param firstAt 第一片剥离时刻
 * @param lastAt 最后一片剥离时刻
 */
export function createDebrisField(
  res: SceneResources,
  ctx: CgStageContext,
  scale: number,
  groundY: number,
  firstAt: number,
  lastAt: number,
): DebrisField {
  const identity = MATERIAL_IDENTITIES.meteor.physical;
  const group = new THREE.Group();
  group.name = 'debris-field';
  res.group.add(group);

  const world = new World({
    gravity: new Vec3(0, -scale * 26 * (1 + identity.gravity), 0),
    broadphase: new NaiveBroadphase(),
    allowSleep: true,
  });

  // 地面：静态平面，碎片在此按 restitution 反弹。
  // 碰撞分组让碎片只与地面互撞——碎片互撞既非规格所需，又是 O(n²)。
  const ground = new Body({
    mass: 0,
    type: Body.STATIC,
    shape: new Plane(),
    collisionFilterGroup: GROUP_GROUND,
    collisionFilterMask: GROUP_PIECE,
  });
  ground.position.set(0, groundY, 0);
  // Plane 默认法线朝 +z，转到朝 +y 才是水平地面。
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);

  const half = scale * 0.028;
  const geometry = res.track(new THREE.BoxGeometry(half * 2, half * 2, half * 2));
  const material = res.track(additiveMaterial('#FFB878'));
  material.blending = THREE.NormalBlending;
  material.opacity = 0;

  const count = scaledCount(28, ctx.quality);
  const pieces: DebrisPiece[] = [];
  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(geometry, material);
    // 命名前缀 `debris-` 与场景其它节点（`meteor-core` / `dust-ring`）
    // 互不包含，避免前缀匹配的断言测错对象。
    mesh.name = `debris-${i}`;
    mesh.visible = false;
    group.add(mesh);

    const body = new Body({
      mass: identity.mass,
      shape: new Box(new Vec3(half, half, half)),
      position: new Vec3(0, 0, 0),
      // drag 签名（.969）转线性阻尼：越接近 1 阻力越小。
      linearDamping: 1 - identity.drag,
      angularDamping: 0.08,
      allowSleep: true,
      sleepSpeedLimit: scale * 0.04,
      collisionFilterGroup: GROUP_PIECE,
      collisionFilterMask: GROUP_GROUND,
    });
    // 未剥离前不参与积分：加入世界但先睡下，release 时唤醒。
    world.addBody(body);
    body.sleep();

    pieces.push({
      mesh,
      body,
      at: firstAt + (lastAt - firstAt) * (i / Math.max(1, count - 1)),
      lateral: (i % 2 === 0 ? 1 : -1) * (0.4 + ((i * 37) % 100) / 220),
      released: false,
    });
  }

  let physicsElapsed = 0;

  return {
    group,
    pieces,

    advance(t: number, elapsedS: number, core: THREE.Vector3, coreVel: THREE.Vector3): void {
      // ① 释放到点的碎片：继承陨核位姿与速度，叠加侧向甩出。
      for (const piece of pieces) {
        if (piece.released || t < piece.at) continue;
        piece.released = true;
        piece.mesh.visible = true;
        piece.body.position.set(core.x, core.y, core.z);
        // 侧向分量取轨迹法向（把速度旋 90°），碎片才是「甩出」而非「掉队」。
        const nx = -coreVel.y;
        const ny = coreVel.x;
        const nl = Math.hypot(nx, ny) || 1;
        // 初速由 stiffness（1.6）驱动。identity.force 是类型枚举
        // 字符串（'gravity'），当乘数用会算出 NaN 让刚体冻结。
        const kick = scale * 2.2 * identity.stiffness * piece.lateral;
        piece.body.velocity.set(
          coreVel.x * 0.55 + (nx / nl) * kick,
          coreVel.y * 0.55 + (ny / nl) * kick,
          0,
        );
        piece.body.angularVelocity.set(
          (((piece.at * 991) % 100) / 100 - 0.5) * 12,
          (((piece.at * 733) % 100) / 100 - 0.5) * 12,
          (((piece.at * 557) % 100) / 100 - 0.5) * 12,
        );
        piece.body.wakeUp();
      }

      // ② 物理由场景时间轴驱动而非渲染 delta：验收会在稀疏 t 上调用，
      // 用 frameDelta（上限 50ms）会让物理几乎不前进。
      let guard = 0;
      while (physicsElapsed + FIXED_STEP <= elapsedS && guard < MAX_CATCHUP) {
        world.step(FIXED_STEP);
        physicsElapsed += FIXED_STEP;
        guard += 1;
        for (const { body, released } of pieces) {
          if (!released) continue;
          // cannon 默认 ContactMaterial 无弹性，Plane 只挡穿透不反弹；
          // 反弹要按 restitution 手动施加，否则石质碎片落地不跳。
          if (body.position.y <= groundY + half * 1.05 && body.velocity.y < 0) {
            body.position.y = groundY + half * 1.05;
            body.velocity.y = -body.velocity.y * identity.restitution;
            body.velocity.x *= 1 - identity.friction * 0.5;
          }
        }
      }

      for (const { mesh, body, released } of pieces) {
        if (!released) continue;
        mesh.position.set(body.position.x, body.position.y, body.position.z);
        mesh.quaternion.set(
          body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w,
        );
      }
    },

    setOpacity(value: number): void {
      material.opacity = value;
    },

    dispose(): void {
      for (const { body } of pieces) world.removeBody(body);
      world.removeBody(ground);
    },
  };
}
