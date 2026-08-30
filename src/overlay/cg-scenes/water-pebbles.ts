/**
 * 场景 12 water 的 ⑥ 鹅卵石：cannon-es 刚体被涌起的水推动。
 *
 * 独立成文件：刚体世界的建立与碰撞配置和「摆一批发光平面」不是一件事，
 * 且 water-parts 已顶到 250 行上限（CLAUDE.md）。
 *
 * 为什么卵石用刚体而水珠用闭式弹道：卵石要**落回泉底并反弹**，
 * 接触约束与姿态积分靠公式写不出来；水珠只受重力、且必须任意 t 可重放。
 * 两种运动模型各取所需，不是同一套代码的两个参数。
 */
import * as THREE from 'three';
import { Body, NaiveBroadphase, Sphere, Vec3, World } from 'cannon-es';
import type { CgStageContext } from '../cg-scene';
import { scaledCount } from '../cg-particle-kit';
import { additiveMaterial, type SceneResources } from '../cg-scene-kit';
import { MATERIAL_IDENTITIES } from '../material-identity';
import { pebbleGeometry } from './water-geometry';
import { waterRand } from './water-motion';

/** 一枚鹅卵石：three 显示体 + cannon 刚体。 */
export type Pebble = {
  mesh: THREE.Mesh;
  body: Body;
  /** 碰撞半径，落地夹紧与反弹判定要用。 */
  radius: number;
  /** 被水推动的时刻（物理秒），错峰受推。 */
  pushAt: number;
  pushed: boolean;
};

export type PebbleBed = {
  group: THREE.Group;
  pebbles: Pebble[];
  world: World;
};

/**
 * 卵石**不与任何刚体碰撞**（mask 0），泉底也不是 cannon 的 Plane。
 *
 * 两条各自的理由：
 *
 * 1. 彼此不撞——卵石沿水面密排，开启互撞时 cannon 的穿透分离冲量会把相邻
 *    两枚弹到画面外（同 bomb 的实测事故），而且是 O(n²)。规格要的物理是
 *    「被水推动 + 落回泉底」，卵石互撞既非必需也非规格所求。
 *
 * 2. 泉底不用 Plane——落地响应（夹紧 + 按 restitution 反弹）在编排层解析给出，
 *    位置永远不会掉到接触面以下，因此一个 Plane 刚体的接触**永远不会产生冲量**。
 *    起初这里确实摆了一个，变异验证时发现把它的法线转错、甚至整个从 world 里
 *    删掉，全部 15 条断言依旧全绿——它是一具无人测试也无人使用的尸体。
 *    与其留着假装「物理由 cannon 兜底」，不如只留一条真正生效的路径。
 *
 * cannon 在此负责的是货真价实的那部分：重力积分、线性/角阻尼、
 * 角速度→四元数姿态、睡眠。这些都由 world.step 以固定 1/60 推进。
 */
const GROUP_PEBBLE = 2;
const COLLIDE_WITH_NOTHING = 0;

/**
 * 建立卵石层。
 *
 * @param res 场景资源容器
 * @param ctx 场景上下文，quality 决定卵石数量
 * @param surfaceY 水面/泉底高度（局部坐标），静态平面就在这条线上
 * @param gravity 重力加速度（正值 px/s²），与水珠闭式弹道共用同一个值
 */
export function buildPebbleBed(
  res: SceneResources,
  ctx: CgStageContext,
  surfaceY: number,
  gravity: number,
): PebbleBed {
  const { width, quality } = ctx;
  const short = Math.min(width, ctx.height);
  const identity = MATERIAL_IDENTITIES.water.physical;

  const world = new World({
    gravity: new Vec3(0, -gravity, 0),
    broadphase: new NaiveBroadphase(),
    allowSleep: true,
  });

  const group = new THREE.Group();
  group.name = 'pebble-bed';
  group.position.z = 12;
  res.group.add(group);

  const count = scaledCount(14, quality);
  const pebbles: Pebble[] = [];
  for (let i = 0; i < count; i += 1) {
    const radius = short * (0.012 + waterRand(i, 23) * 0.014);
    const mesh = res.mesh(
      // 前缀与水珠 `drop-` / 白沫 `spray-` 三者互不包含：
      // 按前缀收集刚体时不会误收贴片（见 water-droplets 的命名说明）。
      `pebble-${i}`,
      pebbleGeometry(radius, 0.62 + waterRand(i, 29) * 0.22),
      additiveMaterial('#7C93A8', 0.72),
    );
    // 沿水面横向铺开：卵石是泉底的一层，不是堆在中心的一坨。
    const x = (waterRand(i, 31) - 0.5) * width * 0.78;
    mesh.position.set(x, surfaceY + radius, 0);
    group.add(mesh);

    const body = new Body({
      mass: identity.mass * (0.6 + waterRand(i, 37) * 0.8),
      shape: new Sphere(radius),
      position: new Vec3(x, surfaceY + radius, 0),
      // 受水推动前是 STATIC：水柱还没涌起，泉底的石头不该自己动。
      type: Body.STATIC,
      // drag 签名（.991）转成线性阻尼：水里的阻力，数值越接近 1 阻力越小。
      linearDamping: 1 - identity.drag,
      angularDamping: 0.2,
      allowSleep: true,
      sleepSpeedLimit: short * 0.02,
      collisionFilterGroup: GROUP_PEBBLE,
      collisionFilterMask: COLLIDE_WITH_NOTHING,
    });
    world.addBody(body);
    // 越靠中心越早被推：水柱在中心涌起，冲量向外传播需要时间。
    const distance = Math.abs(x) / (width * 0.4);
    pebbles.push({ mesh, body, radius, pushAt: distance * 0.34, pushed: false });
  }

  return { group, pebbles, world };
}
