/**
 * 素材包运动轨迹特效库。
 *
 * 基础预设按物理语义拆分，系列专属预设由 effects-family-presets 提供。
 * 所有预设均为纯计算，并统一受 115 粒子的单次发射预算约束。
 */

import type { EffectPresetId } from '../shared/material-packs';
import { petal, spiral, glow, twinkle } from './effects-ambient-presets';
import { whirl, vortex, rain } from './effects-air-presets';
import { bolt, flameRise, shatterIce, waterSplash } from './effects-elemental-presets';
import { FAMILY_PRESETS } from './effects-family-presets';
import { shatter, burst, shockRing, starBurst, explode, impact } from './effects-impact-presets';
import { jet, rise, wave, orbit, dash } from './effects-motion-presets';
import { pulse, ring, echo } from './effects-rhythm-presets';
import { comet, trailBurst, arc, split, chain } from './effects-trajectory-presets';
import type { EffectPreset } from './effects-core';

export type { EffectPreset, SpriteFrame } from './effects-core';

const PRESETS: EffectPreset[] = [
  jet, rise, bolt, wave, orbit, dash, shatter, burst, flameRise, shatterIce,
  shockRing, waterSplash, whirl, starBurst, impact, comet, trailBurst, pulse,
  ring, petal, echo, arc, spiral, split, chain, glow, twinkle, vortex, rain,
  explode,
  ...FAMILY_PRESETS,
];

const PRESET_MAP = new Map<EffectPresetId, EffectPreset>(PRESETS.map((preset) => [preset.id, preset]));

export function resolveEffect(presetId: string): EffectPreset {
  return PRESET_MAP.get(presetId as EffectPresetId) ?? PRESET_MAP.get('jet')!;
}

export const EFFECT_PRESETS: Record<EffectPresetId, EffectPreset> = Object.fromEntries(
  PRESETS.map((preset) => [preset.id, preset]),
) as Record<EffectPresetId, EffectPreset>;
