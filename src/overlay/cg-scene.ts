/**
 * CG 场景类型体系。
 *
 * 场景键是 packId：42 个内置素材各自拥有一个独立 `CgScene`，互不共享场景构成
 * （设计规格 §4.1 独立性规则 1）。preset 仅提供物理档案与族分派，不再决定场景内容
 * ——同用 `dash` 的 katana / bow / spear 是三个完全不同的场景。
 *
 * 本文件只放类型：注册与查找在 `cg-scene-registry.ts`，
 * 具体场景在 `cg-scenes/cg-<packId>.ts`。
 */
import type * as THREE from 'three';
import type { BuiltinPackId, EffectPresetId } from '../shared/material-packs';
import type { EffectQuality } from '../shared/config';

/**
 * 一个 CG 场景的静态声明（不含运行时对象）。
 *
 * `elements` 与 `signature` 取自设计规格 §4.2 对应场景条目，
 * 既是实现清单，也是「场景互不重复」的可测断言依据。
 */
export type CgSceneConfig = {
  /** 场景唯一键，与 `BUILTIN_PACK_IDS` 一一对应。 */
  packId: BuiltinPackId;
  /** 场景标题（中文，如「发射升空」）。 */
  title: string;
  /** 元素清单：构成本场景的可见部件。 */
  elements: readonly string[];
  /** 独立签名：其它素材不具备的唯一机制。 */
  signature: string;
  /** 关联预设，仅用于物理档案与族分派。 */
  preset: EffectPresetId;
};

/**
 * 场景创建上下文。
 *
 * 字段与 `FamilyContext`（three-family-shared.ts）保持同构，
 * 额外带 `quality` 与 `now`，使场景可按档位裁剪元素、按绝对时刻起算。
 */
export type CgStageContext = {
  /** 场景挂载根节点，dispose 时由场景自行摘除子节点。 */
  root: THREE.Group;
  /** 触发点（世界坐标）。 */
  origin: THREE.Vector3;
  /** 素材主色。 */
  color: THREE.Color;
  /** 能量系数（挥鞭强度归一化）。 */
  energy: number;
  /** 触发方向（屏幕平面单位向量）。 */
  direction: THREE.Vector2;
  /** 覆盖层像素宽。 */
  width: number;
  /** 覆盖层像素高。 */
  height: number;
  /** 当前生效画质档位（已解析，不会是 auto 之外的运行时歧义）。 */
  quality: EffectQuality;
  /** 素材包参数（effect params）。 */
  params: Record<string, number>;
  /** 创建时刻（ms，`performance.now()` 量纲）。 */
  now: number;
};

/**
 * 一个已创建的 CG 场景实例。
 *
 * `update` 由渲染循环每帧调用；`t` 是 0→1 归一化进度（用于三幕编排），
 * `now` 是绝对时刻（用于与音频/脉冲对齐），`quality` 允许运行时自适应降档。
 */
export interface CgStage {
  update(t: number, now: number, quality: EffectQuality): void;
  dispose(): void;
}

/** 场景工厂：由上下文构造一个场景实例。 */
export interface CgStageFactory {
  (ctx: CgStageContext): CgStage;
}

/** 注册表查找结果。 */
export type ResolvedCgScene = {
  config: CgSceneConfig;
  create: CgStageFactory;
};
