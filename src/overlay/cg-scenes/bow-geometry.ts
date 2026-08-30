/**
 * 场景 24 bow 的几何构造（纯函数，无副作用）。
 *
 * 从 bow-parts 拆出来只为满足 250 行上限，同时让箭矢形状可以
 * 单独验收（顶点数、长宽比）而不必建整个场景。
 */
import * as THREE from 'three';

/**
 * 箭矢几何：细长杆 + 三角箭头 + 尾羽。
 *
 * 用 Shape 一笔画完而非拼三个 mesh：箭是一个整体，拼装件在高速
 * 旋转时会露出接缝。
 *
 * @param length 全长（像素）
 * @param width 杆宽（像素）
 */
export function arrowGeometry(length: number, width: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const half = width * 0.5;
  const headLen = length * 0.16;
  // 从尾端起画，顺时针一圈。
  shape.moveTo(-length * 0.5, -half * 0.4);
  shape.lineTo(length * 0.5 - headLen, -half * 0.4);
  shape.lineTo(length * 0.5 - headLen, -half);
  shape.lineTo(length * 0.5, 0);
  shape.lineTo(length * 0.5 - headLen, half);
  shape.lineTo(length * 0.5 - headLen, half * 0.4);
  shape.lineTo(-length * 0.5, half * 0.4);
  // 尾羽：尾端两片小三角。
  shape.lineTo(-length * 0.5 - headLen * 0.5, half * 1.6);
  shape.lineTo(-length * 0.42, 0);
  shape.lineTo(-length * 0.5 - headLen * 0.5, -half * 1.6);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}
