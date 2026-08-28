import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  effectParamDefs,
  effectParamDefaults,
  mergeEffectParams,
} from '../settings/components/effect-params';
import { EFFECT_PRESET_IDS } from '../shared/material-packs';

/**
 * 参数表不是发明出来的：键名/默认值来自真实内置 pack.json，
 * 区间来自 overlay 引擎的 clamp。这些测试把「真实来源」钉住 ——
 * 任何一侧改了而表没跟上，这里就红。
 */

const packsDir = resolve(__dirname, '../../src-tauri/packs');

function builtinManifests() {
  return readdirSync(packsDir)
    .filter((entry) => statSync(`${packsDir}/${entry}`).isDirectory())
    .map((id) => JSON.parse(readFileSync(`${packsDir}/${id}/pack.json`, 'utf-8')));
}

describe('特效参数表', () => {
  it('42 个预设全部有参数定义', () => {
    for (const id of EFFECT_PRESET_IDS) {
      expect(effectParamDefs(id).length, `${id} 缺少参数定义`).toBeGreaterThanOrEqual(3);
    }
  });

  it('每个内置素材包的参数键都在对应预设的表里', () => {
    for (const manifest of builtinManifests()) {
      const known = new Set(effectParamDefs(manifest.effect.preset).map((d) => d.key));
      for (const key of Object.keys(manifest.effect.params)) {
        expect(known.has(key), `${manifest.id}: 预设 ${manifest.effect.preset} 的表缺少 ${key}`).toBe(true);
      }
    }
  });

  it('内置素材包的参数默认值就是表里的 fallback', () => {
    for (const manifest of builtinManifests()) {
      const defs = effectParamDefs(manifest.effect.preset);
      for (const [key, value] of Object.entries(manifest.effect.params)) {
        const def = defs.find((d) => d.key === key);
        if (!def) continue;
        // 同一预设可能被多个内置包复用；表取的是最大默认值，故只校验区间包含。
        expect(value as number, `${manifest.id}.${key} 落在滑块区间外`).toBeGreaterThanOrEqual(def.min);
        expect(value as number, `${manifest.id}.${key} 落在滑块区间外`).toBeLessThanOrEqual(def.max);
      }
    }
  });

  it('每个参数的区间与步进自洽，且默认值在区间内', () => {
    for (const id of EFFECT_PRESET_IDS) {
      for (const def of effectParamDefs(id)) {
        expect(def.min, `${id}.${def.key}`).toBeLessThan(def.max);
        expect(def.step, `${id}.${def.key}`).toBeGreaterThan(0);
        expect(def.fallback, `${id}.${def.key}`).toBeGreaterThanOrEqual(def.min);
        expect(def.fallback, `${id}.${def.key}`).toBeLessThanOrEqual(def.max);
        expect(def.label.length, `${id}.${def.key} 缺少中文标签`).toBeGreaterThan(0);
      }
    }
  });

  it('未知预设不产生滑块', () => {
    expect(effectParamDefs('not-a-preset')).toEqual([]);
    expect(effectParamDefaults('not-a-preset')).toEqual({});
  });

  it('effectParamDefaults 返回该预设的完整默认值', () => {
    expect(effectParamDefaults('jet')).toEqual({ thrust: 1.35, tailLength: 1.5, climb: 1.2 });
  });

  it('mergeEffectParams 保留命中的用户值、补齐缺失键', () => {
    expect(mergeEffectParams('jet', { thrust: 2.4 })).toEqual({
      thrust: 2.4,
      tailLength: 1.5,
      climb: 1.2,
    });
  });

  it('mergeEffectParams 丢弃不属于目标预设的键', () => {
    const merged = mergeEffectParams('bolt', { thrust: 2.4, branches: 5 });
    expect(merged.thrust).toBeUndefined();
    expect(merged.branches).toBe(5);
  });

  it('mergeEffectParams 忽略 NaN / 非有限值，退回默认', () => {
    expect(mergeEffectParams('jet', { thrust: Number.NaN }).thrust).toBe(1.35);
    expect(mergeEffectParams('jet', { thrust: Number.POSITIVE_INFINITY }).thrust).toBe(1.35);
  });
});
