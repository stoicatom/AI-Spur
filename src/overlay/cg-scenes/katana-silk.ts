/**
 * 场景 06 katana 的 ⑦ 绸布层：cannon-es 约束网格。
 *
 * 规格要的是「cloth 约束网格，被刀风撩起」，所以这里不是脚本化摆动，
 * 而是真约束布：质点 + DistanceConstraint 织成网，重力积分 + 刀风推力。
 * 独立成文件是因为「布的织法与截断」和视觉编排无关，且受 250 行上限约束。
 *
 * 互动① 的下半场在这里落地：`severAcross` 把落在弧后方的横向约束整排拆掉，
 * 布因此真的断成两片、各自坠落——不是把贴图换成「断了」的样子。
 */
import * as THREE from 'three';
import { Body, DistanceConstraint, GSSolver, Particle, Vec3, World } from 'cannon-es';
import type { CgStageContext } from '../cg-scene';
import { scaledCount } from '../cg-particle-kit';
import { additiveMaterial, type SceneResources } from '../cg-scene-kit';
import { MATERIAL_IDENTITIES } from '../material-identity';

/** 物理步长固定 1/60：与 CLAUDE.md 的确定性步进要求一致。 */
const FIXED_STEP = 1 / 60;
/** 布的列数固定：横向分辨率决定「断口」的位置精度，不随档位缩。 */
const COLUMNS = 7;

type SilkNode = {
  mesh: THREE.Mesh;
  body: Body;
  /** 网格坐标，severAcross 按行列定位要拆哪些约束。 */
  col: number;
  row: number;
};

/** 一根横向约束：拆掉整排同 row 的它就把布切成上下两片。 */
type Rung = {
  constraint: DistanceConstraint;
  row: number;
  /** 该约束中点沿斩击轴的投影（像素），弧扫到这里才拆。 */
  axial: number;
  removed: boolean;
};

export interface SilkCloth {
  readonly group: THREE.Group;
  readonly nodes: readonly SilkNode[];
  /**
   * 推进布的物理。
   *
   * @param delta 帧间隔（秒）
   * @param wind 刀风推力（像素/秒²，沿斩击轴），第二幕撩起布的那一下
   */
  update(delta: number, wind: THREE.Vector2): void;
  /**
   * 互动①：把弧已扫过的横排约束拆掉。
   *
   * @param axial 弧前沿沿斩击轴的投影（像素）
   */
  severAcross(axial: number): void;
  dispose(): void;
}

/**
 * 织一块绸布。
 *
 * @param res 场景资源容器，几何/材质登记其中统一释放
 * @param ctx 场景上下文，quality 决定行数（§3.1 低档更稀疏）
 * @param axis 斩击轴单位向量，截断顺序沿它排序
 * @param center 布的中心（局部坐标）
 */
export function createSilkCloth(
  res: SceneResources,
  ctx: CgStageContext,
  axis: THREE.Vector2,
  center: THREE.Vector2,
): SilkCloth {
  // fabric 档案在 katana 行里不存在（katana 是 metal/recoil），
  // 绸布借 lotus 的 fabric 档案：布的垂感与阻尼是布料自身的属性，
  // 不该跟着刀的金属签名走。
  const fabric = MATERIAL_IDENTITIES.lotus.physical;
  const group = new THREE.Group();
  group.name = 'silk-cloth';
  group.position.set(center.x, center.y, 6);
  res.group.add(group);

  const rows = scaledCount(9, ctx.quality);
  const span = Math.min(ctx.width, ctx.height) * 0.34;
  const stepX = span / COLUMNS;
  const stepY = span / Math.max(2, rows);

  // 约束布需要多次迭代才收敛，默认 10 次会让布看着松垮。
  // 显式建 GSSolver 而不是改 world.solver.iterations——基类 Solver
  // 没有那个字段，靠 as 断言绕过去只是把类型问题藏起来。
  const solver = new GSSolver();
  solver.iterations = 14;
  const world = new World({
    // 重力用像素量纲：正交相机下 1 世界单位 = 1 像素。
    gravity: new Vec3(0, -span * 3.4 * (1 + fabric.gravity), 0),
    allowSleep: false,
    solver,
  });

  const patch = res.track(new THREE.PlaneGeometry(stepX * 0.92, stepY * 0.92));
  const material = res.track(additiveMaterial('#F0E4FF', 0));
  material.blending = THREE.NormalBlending;

  const nodes: SilkNode[] = [];
  const grid: Body[][] = [];
  for (let row = 0; row < rows; row += 1) {
    const line: Body[] = [];
    for (let col = 0; col < COLUMNS; col += 1) {
      const x = (col - (COLUMNS - 1) / 2) * stepX;
      const y = ((rows - 1) / 2 - row) * stepY;
      // 顶排是挂点：静态体，布才会垂着而不是整块掉下去。
      const pinned = row === 0;
      const body = new Body({
        mass: pinned ? 0 : fabric.mass,
        type: pinned ? Body.STATIC : Body.DYNAMIC,
        shape: new Particle(),
        position: new Vec3(x, y, 0),
        linearDamping: 1 - fabric.drag,
      });
      world.addBody(body);
      line.push(body);

      const mesh = new THREE.Mesh(patch, material);
      mesh.name = `silk-node-${row}-${col}`;
      mesh.position.set(x, y, 0);
      // severed 由 severAcross 置位，是互动①的可断言标记。
      mesh.userData.severed = false;
      group.add(mesh);
      nodes.push({ mesh, body, col, row });
    }
    grid.push(line);
  }

  const rungs: Rung[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < COLUMNS; col += 1) {
      // 横向：同排相邻，这些是被刀气弧拆掉的那一组。
      if (col + 1 < COLUMNS) {
        world.addConstraint(new DistanceConstraint(grid[row][col], grid[row][col + 1], stepX));
      }
      // 纵向：上下相邻，拆掉整排纵向约束才算「横着斩断」。
      if (row + 1 < rows) {
        const constraint = new DistanceConstraint(grid[row][col], grid[row + 1][col], stepY);
        world.addConstraint(constraint);
        const mid = new THREE.Vector2(
          center.x + (col - (COLUMNS - 1) / 2) * stepX,
          center.y + ((rows - 1) / 2 - row - 0.5) * stepY,
        );
        rungs.push({ constraint, row, axial: mid.x * axis.x + mid.y * axis.y, removed: false });
      }
    }
  }

  let accumulator = 0;

  return {
    group,
    nodes,

    update(delta: number, wind: THREE.Vector2): void {
      if (wind.lengthSq() > 0) {
        for (const { body, row } of nodes) {
          if (body.type === Body.STATIC) continue;
          // 刀风越往下摆越大：挂点附近被顶排拉住，布尾才会被撩起来。
          const lever = row / Math.max(1, rows - 1);
          body.applyForce(
            new Vec3(wind.x * lever * fabric.mass, wind.y * lever * fabric.mass, 0),
            body.position,
          );
        }
      }
      // 固定步长累加：渲染帧率变化不改变布的形态。
      accumulator = Math.min(accumulator + delta, FIXED_STEP * 6);
      while (accumulator >= FIXED_STEP) {
        world.step(FIXED_STEP);
        accumulator -= FIXED_STEP;
      }
      for (const { mesh, body } of nodes) {
        mesh.position.set(body.position.x, body.position.y, body.position.z);
      }
    },

    severAcross(axial: number): void {
      for (const rung of rungs) {
        if (rung.removed || rung.axial > axial) continue;
        rung.removed = true;
        world.removeConstraint(rung.constraint);
        // 断口下方那一排开始自由坠落：标记打在下侧节点上，
        // 因为「被切下来的是弧后方的部分」。
        for (const item of nodes) {
          if (item.row === rung.row + 1) item.mesh.userData.severed = true;
        }
      }
    },

    dispose(): void {
      while (world.constraints.length > 0) world.removeConstraint(world.constraints[0]);
      while (world.bodies.length > 0) world.removeBody(world.bodies[0]);
      nodes.length = 0;
      group.clear();
      group.removeFromParent();
    },
  };
}
