/**
 * 场景 28 bomb 的 ⑤ 碎片层：cannon-es 刚体弹射。
 *
 * 规格要求碎片有「物理特性」，所以这里不是脚本化抛物线，而是真刚体：
 * 重力积分 + 地面碰撞 + 按 bomb 物理签名（stone / restitution .52）反弹。
 * 独立成文件是因为物理世界的建立与同步逻辑与视觉元素无关，且受 250 行上限约束。
 */
import * as THREE from 'three';
import { Body, Box, NaiveBroadphase, Plane, Vec3, World } from 'cannon-es';
import type { CgStageContext } from '../cg-scene';
import { scaledCount } from '../cg-particle-kit';
import { additiveMaterial, type SceneResources } from '../cg-scene-kit';
import { MATERIAL_IDENTITIES } from '../material-identity';

/** 一片碎片：视觉 mesh 与刚体一一绑定。 */
export type ShrapnelPiece = {
  mesh: THREE.Mesh;
  body: Body;
};

export interface ShrapnelField {
  readonly group: THREE.Group;
  readonly pieces: readonly ShrapnelPiece[];
  /** 起爆：给全部碎片施加径向冲量，只生效一次。 */
  detonate(): void;
  /** 推进物理并把刚体位姿同步到 mesh。 */
  update(delta: number): void;
  /** 落在给定包围盒内的碎片数（互动②的穿烟计数）。 */
  countInside(box: THREE.Box3): number;
  /** 统一设置碎片不透明度。 */
  setOpacity(value: number): void;
  dispose(): void;
}

/** 物理步长固定 1/60：与 CLAUDE.md 的确定性步进要求一致。 */
const FIXED_STEP = 1 / 60;

/**
 * 建立碎片场。
 *
 * @param res 场景资源容器，几何/材质登记其中统一释放
 * @param ctx 场景上下文，quality 决定刚体数量（§3.1 低档减半）
 * @param blast 爆炸参考半径（像素）
 * @param groundY 地面高度（局部坐标），与焦圈同高
 */
export function createShrapnelField(
  res: SceneResources,
  ctx: CgStageContext,
  blast: number,
  groundY: number,
): ShrapnelField {
  const identity = MATERIAL_IDENTITIES.bomb.physical;
  const group = new THREE.Group();
  group.name = 'shrapnel';
  group.position.z = 18;
  res.group.add(group);

  // 重力用像素量纲：正交相机下 1 世界单位 = 1 像素，取 blast 为长度尺度，
  // 让下落速度与画面尺寸解耦（大屏不会显得碎片飘）。
  const world = new World({
    gravity: new Vec3(0, -blast * 12 * (1 + identity.gravity), 0),
    broadphase: new NaiveBroadphase(),
    allowSleep: true,
  });

  // 地面：与焦圈同高的静态平面，碎片在此反弹（规格「碎片弹射」的落点）。
  // 碰撞分组：碎片只与地面互撞，彼此穿透。
  // 全部刚体在起爆前同处爆心一点，若开启碎片间碰撞，cannon 的穿透分离
  // 冲量会把它们炸向随机深度（实测 z 冲到 ±1400，早已飞出画面与烟体）。
  // 规格要的物理是「重力 + 落地反弹」，碎片互撞既非必需，还是 O(n²)。
  const GROUP_GROUND = 1;
  const GROUP_PIECE = 2;

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

  const half = blast * 0.045;
  const geometry = res.track(new THREE.BoxGeometry(half * 2, half * 2, half * 2));
  const material = res.track(additiveMaterial('#C9A88F'));
  material.blending = THREE.NormalBlending;

  const count = scaledCount(34, ctx.quality);
  const pieces: ShrapnelPiece[] = [];
  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `shrapnel-${i}`;
    group.add(mesh);

    const body = new Body({
      mass: identity.mass,
      shape: new Box(new Vec3(half, half, half)),
      position: new Vec3(0, 0, 0),
      // drag 签名（.962）转成线性阻尼：数值越接近 1 阻力越小。
      linearDamping: 1 - identity.drag,
      angularDamping: 0.1,
      allowSleep: true,
      sleepSpeedLimit: blast * 0.05,
      collisionFilterGroup: GROUP_PIECE,
      collisionFilterMask: GROUP_GROUND,
    });
    world.addBody(body);
    pieces.push({ mesh, body });
  }

  let detonated = false;
  let accumulator = 0;

  return {
    group,
    pieces,

    detonate(): void {
      if (detonated) return;
      detonated = true;
      for (let i = 0; i < pieces.length; i += 1) {
        const { body } = pieces[i];
        // 球面均匀散布：黄金角螺旋避免极点堆积。
        const u = (i + 0.5) / pieces.length;
        const phi = Math.acos(1 - 2 * u);
        const theta = i * 2.399963;
        const dir = new Vec3(
          Math.sin(phi) * Math.cos(theta),
          Math.abs(Math.cos(phi)) * 0.85 + 0.35,
          // z 压到 6%：正交相机下深度不产生透视，飞太远只会跑出烟体与画面，
          // 让碎片留在浅景深带里才看得见它穿烟。
          Math.sin(phi) * Math.sin(theta) * 0.06,
        );
        // 初速由 stiffness（爆轰刚度 1.35）驱动。force 是力的类型枚举
        // （'recoil'），不是可乘的量级，别把它当乘数用。
        const speed = blast * (7 + (((i * 47) % 100) / 100) * 6) * identity.stiffness * 0.4;
        body.velocity.set(dir.x * speed, dir.y * speed, dir.z * speed);
        body.angularVelocity.set(
          (((i * 31) % 100) / 100 - 0.5) * 14,
          (((i * 17) % 100) / 100 - 0.5) * 14,
          (((i * 23) % 100) / 100 - 0.5) * 14,
        );
        body.wakeUp();
      }
    },

    update(delta: number): void {
      if (!detonated) return;
      // 固定步长累加：渲染帧率变化不会改变碎片轨迹。
      accumulator = Math.min(accumulator + delta, FIXED_STEP * 6);
      while (accumulator >= FIXED_STEP) {
        world.step(FIXED_STEP);
        accumulator -= FIXED_STEP;
        for (const { body } of pieces) {
          // cannon 的 Plane 只挡住穿透，反弹要按 restitution 手动给：
          // 默认 ContactMaterial 无弹性，石质碎片落地应该跳一下。
          if (body.position.y <= groundY + half * 1.05 && body.velocity.y < 0) {
            body.position.y = groundY + half * 1.05;
            body.velocity.y = -body.velocity.y * identity.restitution;
            body.velocity.x *= 1 - identity.friction * 0.5;
            body.velocity.z *= 1 - identity.friction * 0.5;
          }
        }
      }
      for (const { mesh, body } of pieces) {
        mesh.position.set(body.position.x, body.position.y, body.position.z);
        mesh.quaternion.set(
          body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w,
        );
      }
    },

    countInside(box: THREE.Box3): number {
      if (!detonated) return 0;
      let inside = 0;
      const probe = new THREE.Vector3();
      for (const { mesh } of pieces) {
        mesh.getWorldPosition(probe);
        if (box.containsPoint(probe)) inside += 1;
      }
      return inside;
    },

    setOpacity(value: number): void {
      material.opacity = value;
    },

    dispose(): void {
      for (const { body } of pieces) world.removeBody(body);
      world.removeBody(ground);
      pieces.length = 0;
      group.clear();
      group.removeFromParent();
    },
  };
}
