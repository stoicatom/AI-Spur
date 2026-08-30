/**
 * CG 场景构件工具层：资源追踪与通用几何体。
 *
 * 42 个场景都要做同一件事——建一批 geometry/material、挂到 group、
 * 结束时逐个 dispose。这个模块把它收成一个 track 闭包，
 * 场景代码因此只描述「有什么元素」，不再重复写释放逻辑。
 *
 * 设计规格 §4.1 独立性规则 2：只导出构件，不导出成品场景。
 */
import * as THREE from 'three';

/** 可释放资源：geometry 与 material 都满足这个形状。 */
type Disposable = { dispose(): void };

export interface SceneResources {
  /** 场景根节点，已挂到 ctx.root 并对齐 origin。 */
  readonly group: THREE.Group;
  /** 登记一个资源并原样返回，便于在建对象时内联调用。 */
  track<T extends Disposable>(resource: T): T;
  /** 建一个具名 mesh，几何体与材质自动登记。 */
  mesh<G extends THREE.BufferGeometry, M extends THREE.Material>(
    name: string,
    geometry: G,
    material: M,
  ): THREE.Mesh<G, M>;
  /** 释放全部登记资源并摘除 group，幂等。 */
  dispose(): void;
  /** 是否已释放，供 update 做失效保护。 */
  readonly disposed: boolean;
}

/**
 * 创建场景资源容器。
 *
 * @param root 宿主根节点（来自 CgStageContext.root）
 * @param origin 特效原点，group 直接对齐到它
 * @param name group 名，便于调试时在场景树里定位
 */
export function createSceneResources(
  root: THREE.Group,
  origin: THREE.Vector3,
  name: string,
): SceneResources {
  const group = new THREE.Group();
  group.name = name;
  group.position.copy(origin);
  root.add(group);

  const resources: Disposable[] = [];
  let disposed = false;

  return {
    group,
    get disposed() { return disposed; },

    track<T extends Disposable>(resource: T): T {
      resources.push(resource);
      return resource;
    },

    mesh<G extends THREE.BufferGeometry, M extends THREE.Material>(
      meshName: string,
      geometry: G,
      material: M,
    ): THREE.Mesh<G, M> {
      resources.push(geometry, material);
      const created = new THREE.Mesh(geometry, material);
      created.name = meshName;
      return created;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const resource of resources) resource.dispose();
      resources.length = 0;
      group.removeFromParent();
      // 递归清空整棵子树：`group.clear()` 只摘直接子节点，场景里常见的
      // 嵌套容器（碎片场、粒子层、编队容器）清空后仍持有各自的子节点，
      // 互相引用让整片 mesh 无法回收。审计发现 42 个场景里有 17 个中招，
      // 最重的一处残留 150 个子节点。
      clearSubtree(group);
    },
  };
}

/**
 * 自底向上摘净一棵子树。
 *
 * 先递归到叶子再 clear，避免遍历中修改 children 数组导致漏摘。
 */
function clearSubtree(node: THREE.Object3D): void {
  // children 会在 clear 时被清空，所以先复制一份再递归。
  for (const child of [...node.children]) clearSubtree(child);
  node.clear();
}

/** 叠加发光的实体材质，特效层最常用的一种。 */
export function additiveMaterial(color: THREE.ColorRepresentation, opacity = 0): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

/**
 * 三幕进度切分：把归一化总进度切成三个各自 0→1 的幕内进度。
 *
 * 场景里的动作几乎都是「某一幕内从 0 演到 1」，直接用总进度写会
 * 到处出现魔法数区间判断。
 *
 * @param t 归一化总进度
 * @param act1End 第一幕结束点（归一化）
 * @param act2End 第二幕结束点（归一化）
 */
export function acts(t: number, act1End: number, act2End: number): [number, number, number] {
  const a1 = Math.min(1, Math.max(0, t / act1End));
  const a2 = t <= act1End ? 0 : Math.min(1, (t - act1End) / (act2End - act1End));
  const a3 = t <= act2End ? 0 : Math.min(1, (t - act2End) / (1 - act2End));
  return [a1, a2, a3];
}

/**
 * 帧间隔（秒），带上限保护。
 *
 * 标签页切后台再回来时 now 会跳很大一步，不设上限会让粒子瞬间老化一整轮。
 */
export function frameDelta(now: number, last: number): number {
  return Math.min(0.05, Math.max(0, (now - last) / 1000));
}
