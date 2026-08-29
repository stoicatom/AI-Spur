/**
 * 场景 08 skull 的 ④ 骨屑：cannon-es 实心碎块。
 *
 * 规格要求「cannon 刚体，实心碎块」，所以是真刚体积分而非脚本抛物线，
 * 并按 skull 物理签名（bone / restitution .34 / gravity .04）落地反弹。
 *
 * 三个已知坑（bomb-shrapnel 踩过，此处沿用其解法）：
 * 1. 固定步长 1/60，渲染帧率不改变轨迹；
 * 2. cannon 默认 ContactMaterial 无弹性，反弹要手动按 restitution 施加；
 * 3. 全部刚体在爆裂前同处一点，开启彼此碰撞会被穿透分离冲量炸飞——
 *    用碰撞分组让骨屑只与地面互撞。
 */
import * as THREE from 'three';
import { Body, Box, NaiveBroadphase, Plane, Vec3, World } from 'cannon-es';
import type { CgStageContext } from '../cg-scene';
import { scaledCount } from '../cg-particle-kit';
import { type SceneResources } from '../cg-scene-kit';
import { MATERIAL_IDENTITIES } from '../material-identity';

/** 物理步长固定 1/60：与 CLAUDE.md 的确定性步进要求一致。 */
const FIXED_STEP = 1 / 60;

/** 碰撞分组：骨屑只与地面互撞（见文件头坑 3）。 */
const GROUP_GROUND = 1;
const GROUP_BIT = 2;

/** 骨屑半高相对 spread 的比例，静止时刚体中心即停在地面之上这么高。 */
const BIT_HALF_RATIO = 0.05;
/** 刚体静止中心相对地面的抬升：Box 的中心不可能与地面共面。 */
const REST_LIFT_RATIO = BIT_HALF_RATIO * 1.2;

/**
 * 落地判定线：低于此高度即算落地。
 *
 * 必须由刚体静止几何反推，不能拍一个固定像素带宽——静止时刚体中心停在
 * 地面上方 spread*0.06 处，带宽窄于这个抬升量会让**已经躺在地上**的骨屑
 * 永远计不进落地数，互动②就再也不会发生（实测：带宽 6px 而抬升 10.4px，
 * 30 片全落地却计得 0 片）。留 1.5 倍余量吸收反弹末段的残余抖动。
 *
 * 实现与测试共用这一个函数，两边就不会各自取阈值而永远差几片。
 */
export function debrisSettleY(groundY: number, spread: number): number {
  return groundY + spread * REST_LIFT_RATIO * 1.5;
}

/** 一片骨屑：视觉 mesh 与刚体一一绑定。 */
export type BoneBit = {
  mesh: THREE.Mesh;
  body: Body;
};

export interface DebrisField {
  readonly group: THREE.Group;
  readonly bits: readonly BoneBit[];
  /** 爆裂：给全部骨屑施加径向冲量，只生效一次。 */
  burst(): void;
  /** 推进物理并把刚体位姿同步到 mesh。 */
  update(delta: number): void;
  /** 已落到地面带内的骨屑数（互动②的驱动真值）。 */
  landedCount(): number;
  setOpacity(value: number): void;
  dispose(): void;
}

/**
 * 建立骨屑场。
 *
 * @param res 场景资源容器
 * @param ctx 场景上下文，quality 决定刚体数量（§3.1 低档更稀疏）
 * @param spread 爆裂参考半径（像素）
 * @param groundY 地面高度（局部坐标），与灰烬环同高
 */
export function createDebrisField(
  res: SceneResources,
  ctx: CgStageContext,
  spread: number,
  groundY: number,
): DebrisField {
  const identity = MATERIAL_IDENTITIES.skull.physical;
  const group = new THREE.Group();
  group.name = 'bone-debris';
  group.position.z = 16;
  res.group.add(group);

  // 重力用像素量纲：正交相机下 1 世界单位 = 1 像素。
  // 倍率 26 不是随手取的：爆裂在 250ms 发生，规格要求骨屑在
  // 750–1200ms 这一幕内**落地**，可用下落时间只有约 0.9s。
  // 按本场景的初速与地面高度反解，倍率低于 ~20 时骨屑会在窗口结束时
  // 仍悬在空中，第三幕的「落地」与由它驱动的灰烬环都不会发生。
  const world = new World({
    gravity: new Vec3(0, -spread * 26 * (1 + identity.gravity), 0),
    broadphase: new NaiveBroadphase(),
    allowSleep: true,
  });

  const ground = new Body({
    mass: 0,
    type: Body.STATIC,
    shape: new Plane(),
    collisionFilterGroup: GROUP_GROUND,
    collisionFilterMask: GROUP_BIT,
  });
  ground.position.set(0, groundY, 0);
  // Plane 默认法线朝 +z，转到朝 +y 才是水平地面。
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);

  const half = spread * BIT_HALF_RATIO;
  // 实心碎块：骨屑要有厚度感，不是薄片。
  const geometry = res.track(new THREE.BoxGeometry(half * 2, half * 2.4, half * 1.5));
  const material = res.track(new THREE.MeshBasicMaterial({
    color: 0xe8e2d2, transparent: true, opacity: 0, depthWrite: false,
  }));

  const count = scaledCount(30, ctx.quality);
  const bits: BoneBit[] = [];
  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(geometry, material);
    // 前缀 bonebit- 与 bone-debris 组名不共前缀：按前缀点刚体时不会误命中容器
    // （glass-shot 曾因 shard- 同时命中刚体与反光片，物理断言实际测了非物理体）。
    mesh.name = `bonebit-${i}`;
    group.add(mesh);

    const body = new Body({
      mass: identity.mass,
      shape: new Box(new Vec3(half, half * 1.2, half * 0.75)),
      position: new Vec3(0, 0, 0),
      // drag 签名（.979）转成线性阻尼：数值越接近 1 阻力越小。
      linearDamping: 1 - identity.drag,
      angularDamping: 0.08,
      allowSleep: true,
      sleepSpeedLimit: spread * 0.04,
      collisionFilterGroup: GROUP_BIT,
      collisionFilterMask: GROUP_GROUND,
    });
    world.addBody(body);
    bits.push({ mesh, body });
  }

  let burst = false;
  let accumulator = 0;

  return {
    group,
    bits,

    burst(): void {
      if (burst) return;
      burst = true;
      for (let i = 0; i < bits.length; i += 1) {
        const { body } = bits[i];
        // 球面均匀散布：黄金角螺旋避免极点堆积。
        const u = (i + 0.5) / bits.length;
        const phi = Math.acos(1 - 2 * u);
        const theta = i * 2.399963;
        const dir = new Vec3(
          Math.sin(phi) * Math.cos(theta),
          Math.abs(Math.cos(phi)) * 0.8 + 0.3,
          // z 压到 6%：正交相机无透视，飞太深只会离开画面。
          Math.sin(phi) * Math.sin(theta) * 0.06,
        );
        // 初速由 stiffness（骨裂刚度 1.1）驱动。identity.force 是力的类型
        // 枚举（'gravity'），不是可乘的量级，别把它当乘数用。
        const speed = spread * (6.5 + (((i * 41) % 100) / 100) * 5) * identity.stiffness * 0.42;
        body.velocity.set(dir.x * speed, dir.y * speed, dir.z * speed);
        body.angularVelocity.set(
          (((i * 29) % 100) / 100 - 0.5) * 12,
          (((i * 19) % 100) / 100 - 0.5) * 12,
          (((i * 37) % 100) / 100 - 0.5) * 12,
        );
        body.wakeUp();
      }
    },

    update(delta: number): void {
      if (!burst) return;
      // 固定步长累加：渲染帧率变化不会改变骨屑轨迹。
      accumulator = Math.min(accumulator + delta, FIXED_STEP * 6);
      const restY = groundY + half * 1.2;
      while (accumulator >= FIXED_STEP) {
        world.step(FIXED_STEP);
        accumulator -= FIXED_STEP;
        for (const { body } of bits) {
          // cannon 的 Plane 只挡穿透，反弹要按 restitution 手动给：
          // 默认 ContactMaterial 无弹性，骨块落地应该磕一下。
          if (body.position.y <= restY && body.velocity.y < 0) {
            body.position.y = restY;
            body.velocity.y = -body.velocity.y * identity.restitution;
            body.velocity.x *= 1 - identity.friction * 0.5;
            body.velocity.z *= 1 - identity.friction * 0.5;
          }
        }
      }
      for (const { mesh, body } of bits) {
        mesh.position.set(body.position.x, body.position.y, body.position.z);
        mesh.quaternion.set(
          body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w,
        );
      }
    },

    landedCount(): number {
      if (!burst) return 0;
      const settleY = debrisSettleY(groundY, spread);
      let landed = 0;
      const probe = new THREE.Vector3();
      for (const { mesh } of bits) {
        mesh.getWorldPosition(probe);
        if (probe.y <= settleY) landed += 1;
      }
      return landed;
    },

    setOpacity(value: number): void {
      material.opacity = value;
    },

    dispose(): void {
      for (const { body } of bits) world.removeBody(body);
      world.removeBody(ground);
      bits.length = 0;
      group.clear();
      group.removeFromParent();
    },
  };
}
