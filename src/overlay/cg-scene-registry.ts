/**
 * CG 场景注册表：packId → 独立场景。
 *
 * 每个场景文件（`cg-scenes/cg-<packId>.ts`）在模块顶层调用 `registerScene` 自注册，
 * barrel（`cg-scenes/index.ts`）副作用导入触发全部注册。
 * 这样 42 个场景可并行实现，各改各的文件，不争抢注册表。
 */
import { BUILTIN_PACK_IDS } from '../shared/material-packs';
import type { CgSceneConfig, CgStageFactory, ResolvedCgScene } from './cg-scene';

/** 应有场景的素材 id 全集，测试据此断言无缺漏。 */
export const ALL_SCENE_PACK_IDS: readonly string[] = BUILTIN_PACK_IDS;

const registry = new Map<string, ResolvedCgScene>();

/**
 * 注册一个素材专属场景。
 *
 * 同一 packId 重复注册直接抛错：注册表是唯一键映射，
 * 静默覆盖会让「某素材用错场景」变成不可见故障。
 */
export function registerScene(scene: CgSceneConfig, factory: CgStageFactory): void {
  if (registry.has(scene.packId)) {
    throw new Error(`duplicate CG scene registration（重复注册）: ${scene.packId}`);
  }
  registry.set(scene.packId, { config: scene, create: factory });
}

/** 按 packId 查找场景；未注册（含用户自定义包）返回 null，由调用方回退 legacy。 */
export function resolveScene(packId: string): ResolvedCgScene | null {
  return registry.get(packId) ?? null;
}

/** 已注册场景数量，用于覆盖率断言与启动自检。 */
export function registeredSceneCount(): number {
  return registry.size;
}

/** 仅测试用：清空注册表，避免用例间互相污染。 */
export function resetRegistry(): void {
  registry.clear();
}
