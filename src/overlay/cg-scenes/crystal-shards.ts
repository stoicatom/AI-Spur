/**
 * 场景 07 crystal 的 ④ 晶屑层：cannon-es 四面体刚体真实碰撞反弹。
 *
 * 规格要「真实碰撞反弹」，所以这里不是脚本化抛物线，而是真刚体：
 * 重力积分 + 地面碰撞 + 按 crystal 物理签名（glass / restitution .16）反弹。
 * 落地事件对外暴露，供互动①「晶屑弹跳扬起尘雾」耦合尘雾强度。
 *
 * 独立成文件是因为物理世界的建立与同步逻辑与视觉元素无关，且受 250 行上限约束。
 */
import * as THREE from 'three';
import {
  Body, ContactMaterial, Material, NaiveBroadphase, Plane, Vec3, World,
} from 'cannon-es';
import type { CgStageContext } from '../cg-scene';
import { scaledCount } from '../cg-particle-kit';
import type { SceneResources } from '../cg-scene-kit';
import { rand, tetraGeometry, tetraShape } from './crystal-geometry';
import { MATERIAL_IDENTITIES } from '../material-identity';

/** 一枚晶屑：视觉 mesh 与刚体一一绑定。 */
export type CrystalChip = {
  mesh: THREE.Mesh;
  body: Body;
  /** 拖影相位，让 ⑤ 光斑拖影错峰闪。 */
  phase: number;
};

export interface ChipField {
  readonly group: THREE.Group;
  readonly chips: readonly CrystalChip[];
  /** 累计落地次数（去抖后），互动①的驱动量。 */
  readonly landings: number;
  /** 最近一次落地距今的秒数；无落地时为 Infinity。 */
  readonly sinceLanding: number;
  /** 崩解：给全部晶屑施加冲量，只生效一次。 */
  burst(): void;
  /** 推进物理并把刚体位姿同步到 mesh。 */
  update(delta: number): void;
  dispose(): void;
}

/** 物理步长固定 1/60：与 CLAUDE.md 的确定性步进要求一致。 */
const FIXED_STEP = 1 / 60;

/** 碰撞分组：晶屑只与地面互撞，彼此穿透。 */
const GROUP_GROUND = 1;
const GROUP_CHIP = 2;

/**
 * 建立晶屑场。
 *
 * @param res 场景资源容器，几何/材质登记其中统一释放
 * @param ctx 场景上下文，quality 决定刚体数量
 * @param span 塔高参考尺度（像素）
 * @param groundY 地面高度（局部坐标）
 * @param material 晶屑共用材质（折射晶体，由 parts 层建好传入）
 */
export function createChipField(
  res: SceneResources,
  ctx: CgStageContext,
  span: number,
  groundY: number,
  material: THREE.Material,
): ChipField {
  const identity = MATERIAL_IDENTITIES.crystal.physical;
  const group = new THREE.Group();
  group.name = 'crystal-chips';
  group.position.z = 16;
  // 物理签名挂在容器上供验收：弹性/摩擦取自 crystal 行，不是随手写的魔法数。
  group.userData.restitution = identity.restitution;
  group.userData.friction = identity.friction;
  group.userData.landings = 0;
  res.group.add(group);

  // 重力用像素量纲：正交相机下 1 世界单位 = 1 像素。
  const world = new World({
    gravity: new Vec3(0, -span * 5.5 * (1 + identity.gravity), 0),
    broadphase: new NaiveBroadphase(),
    allowSleep: true,
  });

  // 反弹必须走 ContactMaterial：cannon 默认接触无弹性，
  // 只靠 Body.restitution 不参与求解，晶屑落地会直接贴死。
  const groundMaterial = new Material('crystal-ground');
  const chipMaterial = new Material('crystal-chip');
  world.addContactMaterial(new ContactMaterial(groundMaterial, chipMaterial, {
    restitution: identity.restitution,
    friction: identity.friction,
  }));

  const ground = new Body({
    mass: 0,
    type: Body.STATIC,
    shape: new Plane(),
    material: groundMaterial,
    collisionFilterGroup: GROUP_GROUND,
    collisionFilterMask: GROUP_CHIP,
  });
  ground.position.set(0, groundY, 0);
  // Plane 默认法线朝 +z，转到朝 +y 才是水平地面。
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);

  const count = scaledCount(30, ctx.quality);
  const chips: CrystalChip[] = [];
  /** 每片是否处于「空中」——落地去抖的闸门，索引与 chips 对齐。 */
  const airborne: boolean[] = [];
  let landings = 0;
  let sinceLanding = Number.POSITIVE_INFINITY;

  for (let i = 0; i < count; i += 1) {
    const radius = span * (0.012 + rand(i, 3) * 0.016);
    const mesh = new THREE.Mesh(res.track(tetraGeometry(radius)), material);
    mesh.name = `chip-${i}`;
    group.add(mesh);

    const body = new Body({
      mass: identity.mass * (0.6 + rand(i, 5) * 0.8),
      shape: tetraShape(radius),
      material: chipMaterial,
      // 起始堆在塔身高处：崩解前不可见，崩解时从塔体各高度散出。
      position: new Vec3(0, span * (0.1 + rand(i, 7) * 0.62), 0),
      // drag 签名（.972）转成线性阻尼：数值越接近 1 阻力越小。
      linearDamping: 1 - identity.drag,
      angularDamping: 0.08,
      allowSleep: true,
      sleepSpeedLimit: span * 0.02,
      collisionFilterGroup: GROUP_CHIP,
      collisionFilterMask: GROUP_GROUND,
    });
    // 起爆前不许自由落体：崩解是第二幕的事。
    body.type = Body.STATIC;
    world.addBody(body);

    // 落地事件去抖：cannon 每个接触点各发一次 collide，
    // 一次落地会连报 3-4 声（四面体有多个顶点同时触面），
    // 不去抖会把「一次弹跳」计成四次，尘雾强度虚高。
    const slot = i;
    body.addEventListener('collide', () => {
      if (!airborne[slot]) return;
      airborne[slot] = false;
      landings += 1;
      sinceLanding = 0;
      group.userData.landings = landings;
    });
    airborne.push(true);
    chips.push({ mesh, body, phase: rand(i, 11) * Math.PI * 2 });
  }

  let burst = false;
  let accumulator = 0;

  return {
    group,
    chips,
    get landings() { return landings; },
    get sinceLanding() { return sinceLanding; },

    burst(): void {
      if (burst) return;
      burst = true;
      for (let i = 0; i < chips.length; i += 1) {
        const { body } = chips[i];
        body.type = Body.DYNAMIC;
        // 质量在构建时已给好，这里只让 cannon 重算惯性张量。
        body.updateMassProperties();
        // 横向散开为主、略带上抛：晶塔是被击中而崩，碎片沿晶面法向飞出。
        // z 压到 8%：正交相机下深度不产生透视，飞太远只会跑出画面。
        const angle = rand(i, 13) * Math.PI * 2;
        const speed = span * (1.1 + rand(i, 17) * 2.4) * identity.stiffness * 0.5;
        body.velocity.set(
          Math.cos(angle) * speed,
          Math.abs(Math.sin(angle)) * speed * 0.45 + span * 0.35,
          Math.sin(angle) * speed * 0.08,
        );
        body.angularVelocity.set(
          (rand(i, 19) - 0.5) * 16,
          (rand(i, 23) - 0.5) * 16,
          (rand(i, 29) - 0.5) * 16,
        );
        body.wakeUp();
      }
    },

    update(delta: number): void {
      if (!burst) return;
      if (Number.isFinite(sinceLanding)) sinceLanding += delta;
      // 固定步长累加：渲染帧率变化不会改变晶屑轨迹。
      accumulator = Math.min(accumulator + delta, FIXED_STEP * 6);
      while (accumulator >= FIXED_STEP) {
        world.step(FIXED_STEP);
        accumulator -= FIXED_STEP;
        // 重新离地（被弹起）后才允许再次计数，否则贴地滑行会持续刷落地数。
        for (let i = 0; i < chips.length; i += 1) {
          if (chips[i].body.velocity.y > span * 0.08) airborne[i] = true;
        }
      }
      for (const { mesh, body } of chips) {
        mesh.position.set(body.position.x, body.position.y, body.position.z);
        mesh.quaternion.set(
          body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w,
        );
      }
    },

    dispose(): void {
      for (const { body } of chips) world.removeBody(body);
      world.removeBody(ground);
      chips.length = 0;
      group.clear();
      group.removeFromParent();
    },
  };
}
