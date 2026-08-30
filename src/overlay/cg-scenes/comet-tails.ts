/**
 * 场景 18 comet 的签名机制：双向彗尾的物理区分。
 *
 * 真实彗星有两条形态不同的尾：
 * - **离子尾**：气体被太阳风电离后沿磁场线加速，几乎**严格背日**，是直的。
 * - **尘埃尾**：尘粒质量大、只受光压推离，同时保留脱离时的轨道速度，
 *   因此沿轨道**滞后弯曲**，呈扇形展开。
 *
 * 这个区分是本场景全库唯一的签名，所以把两条尾的形状写成纯函数——
 * 验收可以直接量「直」和「弯」而不必经过渲染。
 */
import * as THREE from 'three';

/** 一条尾的采样点数：足够画出弯曲又不至于过密。 */
export const TAIL_SEGMENTS = 24;

/**
 * 离子尾的第 i 个采样点（相对彗核的偏移，像素）。
 *
 * 严格沿背日方向的直线，只随距离展宽一点。
 *
 * @param i 采样序号（0 = 彗核处）
 * @param sunDir 由彗核指向太阳的单位向量
 * @param length 尾长（像素）
 */
export function ionTailPoint(i: number, sunDir: THREE.Vector2, length: number): THREE.Vector2 {
  const u = i / (TAIL_SEGMENTS - 1);
  // 背日：与 sunDir 反向。
  return new THREE.Vector2(-sunDir.x, -sunDir.y).multiplyScalar(length * u);
}

/**
 * 尘埃尾的第 i 个采样点（相对彗核的偏移，像素）。
 *
 * 背日推离 + 沿轨道方向的滞后量。滞后量随 u² 增长——离核越远的尘粒
 * 脱离越早、被轨道运动带得越偏，这是尘埃尾弯曲的物理来源。
 *
 * @param i 采样序号
 * @param sunDir 由彗核指向太阳的单位向量
 * @param orbitDir 轨道运动方向的单位向量
 * @param length 尾长（像素）
 * @param lag 滞后强度（0 = 与离子尾重合，越大越弯）
 */
export function dustTailPoint(
  i: number,
  sunDir: THREE.Vector2,
  orbitDir: THREE.Vector2,
  length: number,
  lag: number,
): THREE.Vector2 {
  const u = i / (TAIL_SEGMENTS - 1);
  const away = new THREE.Vector2(-sunDir.x, -sunDir.y).multiplyScalar(length * u * 0.86);
  // 滞后沿轨道**反**方向：尘粒留在彗星走过的位置上。
  const behind = new THREE.Vector2(-orbitDir.x, -orbitDir.y)
    .multiplyScalar(length * u * u * lag);
  return away.add(behind);
}

/**
 * 一串采样点的「弯曲度」：首尾连线与中点的最大偏离，按尾长归一化。
 *
 * 直尾接近 0，弯尾显著大于 0。这是验收「双向彗尾」的判别量——
 * 若实现让两条尾都是直线，两者的弯曲度会同为 0 而无法区分。
 *
 * @param points 采样点（相对彗核）
 */
export function curvature(points: readonly THREE.Vector2[]): number {
  if (points.length < 3) return 0;
  const a = points[0];
  const b = points[points.length - 1];
  const span = a.distanceTo(b);
  if (span < 1e-6) return 0;

  // 点到首尾直线的距离取最大值。
  const dx = (b.x - a.x) / span;
  const dy = (b.y - a.y) / span;
  let maxOff = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const p = points[i];
    const rx = p.x - a.x;
    const ry = p.y - a.y;
    // 叉积的绝对值即垂距（方向向量已单位化）。
    maxOff = Math.max(maxOff, Math.abs(rx * dy - ry * dx));
  }
  return maxOff / span;
}

/** 建一条尾的几何：沿采样点生成带宽度的三角带。 */
export function buildTailGeometry(
  points: readonly THREE.Vector2[],
  headWidth: number,
  tailWidth: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const u0 = i / (points.length - 1);
    const u1 = (i + 1) / (points.length - 1);
    // 段法向：把段方向旋 90°，用于左右撑开宽度。
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const w0 = headWidth + (tailWidth - headWidth) * u0;
    const w1 = headWidth + (tailWidth - headWidth) * u1;

    // 两个三角形拼一段。
    positions.push(
      p0.x + nx * w0, p0.y + ny * w0, 0,
      p0.x - nx * w0, p0.y - ny * w0, 0,
      p1.x + nx * w1, p1.y + ny * w1, 0,

      p1.x + nx * w1, p1.y + ny * w1, 0,
      p0.x - nx * w0, p0.y - ny * w0, 0,
      p1.x - nx * w1, p1.y - ny * w1, 0,
    );
    uvs.push(u0, 1, u0, 0, u1, 1, u1, 1, u0, 0, u1, 0);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}
