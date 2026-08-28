import { PARAM_META, PRESET_PARAMS } from './effect-params-data';

/**
 * 特效参数的查询 API。数据表在 `effect-params-data.ts`（键名/默认值来自内置
 * pack.json，区间来自 overlay 引擎的 clamp）；这里只做查表与投影。
 */

export interface EffectParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  fallback: number;
}

/** 某预设的全部可调参数定义（未知预设返回空数组 —— UI 隐藏滑块区）。 */
export function effectParamDefs(presetId: string): EffectParamDef[] {
  const rows = PRESET_PARAMS[presetId];
  if (!rows) return [];
  return rows.flatMap(([key, fallback]) => {
    const meta = PARAM_META[key];
    if (!meta) return [];
    const [label, min, max, step] = meta;
    return [{ key, label, min, max, step, fallback }];
  });
}

/** 某预设的默认参数值（新建素材包 / 切换预设时的起点）。 */
export function effectParamDefaults(presetId: string): Record<string, number> {
  return Object.fromEntries(effectParamDefs(presetId).map((def) => [def.key, def.fallback]));
}

/**
 * 把已有素材包的参数投影到目标预设：命中的键沿用用户值，缺失的补默认值，
 * 不属于该预设的键丢弃 —— 否则切换预设后 pack.json 里会堆积再没人读的死数据。
 */
export function mergeEffectParams(
  presetId: string,
  existing: Record<string, number> | undefined,
): Record<string, number> {
  return Object.fromEntries(
    effectParamDefs(presetId).map((def) => {
      const value = existing?.[def.key];
      return [def.key, Number.isFinite(value) ? (value as number) : def.fallback];
    }),
  );
}
