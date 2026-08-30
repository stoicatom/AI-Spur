/**
 * 场景 05 ninja-star 的 ② 残影环：**5 层 ghost，全库唯一**。
 *
 * 残影的可测内涵是「它是历史位置的采样」，不是五个各飞各的独立物体：
 * 第 k 层在 t 时刻的位置 ≡ 本体在 `t − k·GHOST_LAG` 时刻的位置。取值走
 * `orbitAt` 的**闭式重算**而不是缓存历史帧——闭式让稀疏 update 也画对
 * （R-PERF-001；缓存帧的实现在稀疏调用下层间距会随调用频率变化）。
 *
 * 因此本模块**不持有任何时间状态**：drive 只吃当帧 t，任意跳跃都自洽。
 *
 * 层数 5 是签名载体，**不过 `scaledCount`**：降档要减的是火星、光带颗粒
 * 那类量大而单调的东西。revolver 的三枚弹壳踩过这个坑——签名被降档削到
 * 1 枚，「一族同源抛物线」就读不出来了；这里若削到 1 层，「5 层残影」
 * 这条全库唯一的机制在低档直接消失。
 */
import * as THREE from 'three';
import type { SceneResources } from '../cg-scene-kit';
import {
  GHOST_LAG,
  GHOST_LAYERS,
  ghostAlpha,
  ghostSampleTime,
  orbitAt,
  spinAngle,
} from './shuriken-orbit';

export { GHOST_LAG, GHOST_LAYERS };

type GhostMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

/** 一层残影：显示体 + 它的滞后身份。 */
export type GhostLayer = {
  readonly mesh: GhostMesh;
  /** 层序（1..GHOST_LAYERS），0 号是本体不在此列。 */
  readonly index: number;
  /** 该层的滞后量（归一化幕）= index × GHOST_LAG。 */
  readonly lag: number;
};

export interface GhostRing {
  readonly group: THREE.Group;
  readonly layers: readonly GhostLayer[];
  /**
   * 把各层推到 t 时刻。
   *
   * @param t 整幕归一化进度
   * @param scale 环的世界尺度：归一化位置乘它得到场景坐标
   * @param center 环在场景局部坐标里的起点（手里剑的掷出点）
   * @param alpha 整层不透明度基准（三幕包络）
   * @param size 本体当前尺寸，残影按层递减
   */
  drive(t: number, scale: THREE.Vector2, center: THREE.Vector2, alpha: number, size: number): void;
}

/**
 * 建一层残影环。
 *
 * 材质各层独立（透明度不同），几何体共享一份。
 *
 * @param res 资源容器
 * @param bodyGeometry 与本体同形的几何体（残影必须是同一个形状的历史像）
 * @param fragmentShader 与本体同一段 shader（残影不是另一种东西）
 * @param color 主色
 * @param hiColor 高光色
 */
export function buildGhostRing(
  res: SceneResources,
  bodyGeometry: THREE.PlaneGeometry,
  fragmentShader: string,
  color: THREE.Color,
  hiColor: THREE.Color,
): GhostRing {
  const group = new THREE.Group();
  group.name = 'ghost-ring';
  res.group.add(group);

  const layers: GhostLayer[] = [];
  // ★ 循环上界是 GHOST_LAYERS 常量，**不经 scaledCount**：见文件头注释。
  for (let k = 1; k <= GHOST_LAYERS; k += 1) {
    const material = res.track(new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: color.clone() },
        uHiColor: { value: hiColor.clone() },
        uAlpha: { value: 0 },
        uSweep: { value: 0 },
        uSharp: { value: 0 },
      },
      vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
      fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    }));
    const mesh = new THREE.Mesh(bodyGeometry, material);
    // `ghost-<k>` 与本场景其它前缀互不包含，验收用 /^ghost-\d+$/ 精确收集。
    mesh.name = `ghost-${k}`;
    group.add(mesh);
    layers.push({ mesh, index: k, lag: k * GHOST_LAG });
  }

  return {
    group,
    layers,

    drive(t, scale, center, alpha, size): void {
      for (const layer of layers) {
        // ★ 签名本体：位置来自**本体轨迹在历史时刻的闭式重算**。
        // 换成任何与 orbitAt 脱钩的轨迹（直线拖尾、固定偏移）都会让
        // 「残影贴合曲线」失效——这正是验收要杀掉的那类实现。
        const sampleT = ghostSampleTime(t, layer.index);
        const p = orbitAt(sampleT);
        layer.mesh.position.set(
          center.x + p.x * scale.x,
          center.y + p.y * scale.y,
          // 越旧的层压在越后面，避免与本体抢深度。
          10 - layer.index * 0.4,
        );
        // 自旋也取历史值：残影是那一刻的完整姿态，不只是位置。
        layer.mesh.rotation.z = spinAngle(Math.max(0, sampleT));
        // 残影比本体小一点：远近感 + 让五层不完全重叠。
        layer.mesh.scale.setScalar(size * (1 - layer.index * 0.045));
        // 开幕前的层还没有历史可采（sampleT<0），此时不显示。
        layer.mesh.material.uniforms.uAlpha.value =
          sampleT <= 0 ? 0 : alpha * ghostAlpha(layer.index);
        // 高光扫掠也跟着历史姿态走。
        layer.mesh.material.uniforms.uSweep.value = Math.sin(spinAngle(Math.max(0, sampleT)) * 2) * 0.8;
        layer.mesh.material.uniforms.uSharp.value = 0.35;
      }
    },
  };
}
