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

/** 每预设的展示元数据（用于向导卡片）。 */
export const PRESET_META: Record<EffectPresetId, { glyph: string; label: string }> = {
  jet: { glyph: '🚀', label: '喷射升空' },
  rise: { glyph: '🕊️', label: '展翅上腾' },
  bolt: { glyph: '⚡', label: '闪电劈裂' },
  wave: { glyph: '🌊', label: '龙腾蜿蜒' },
  orbit: { glyph: '🌀', label: '飞旋环绕' },
  dash: { glyph: '💨', label: '拔刀一斩' },
  shatter: { glyph: '💥', label: '晶体碎裂' },
  burst: { glyph: '✨', label: '幽魂爆散' },
  'flame-rise': { glyph: '🔥', label: '火焰升腾' },
  'shatter-ice': { glyph: '❄️', label: '冰晶爆碎' },
  'shock-ring': { glyph: '⚡', label: '雷震环波' },
  'water-splash': { glyph: '💧', label: '水花四溅' },
  whirl: { glyph: '🌪️', label: '旋风回旋' },
  'star-burst': { glyph: '⭐', label: '星形爆发' },
  impact: { glyph: '🛠️', label: '重击冲击' },
  comet: { glyph: '☄️', label: '坠击爆燃' },
  'trail-burst': { glyph: '💥', label: '拖尾爆裂' },
  pulse: { glyph: '💓', label: '弦振脉冲' },
  ring: { glyph: '🔊', label: '声波回荡' },
  petal: { glyph: '🌸', label: '花瓣飘散' },
  echo: { glyph: '🔔', label: '余韵回荡' },
  arc: { glyph: '🗡️', label: '弧光斩击' },
  spiral: { glyph: '🌀', label: '螺旋上升' },
  split: { glyph: '✨', label: '分身四散' },
  chain: { glyph: '⛓️', label: '锁链波动' },
  glow: { glyph: '💫', label: '辉光膨胀' },
  twinkle: { glyph: '✨', label: '星光闪烁' },
  vortex: { glyph: '🌀', label: '漩涡聚拢' },
  rain: { glyph: '🌧️', label: '雨丝斜落' },
  explode: { glyph: '💣', label: '猛烈爆炸' },
  tornado: { glyph: '🌪️', label: '龙卷风漏斗' },
  downpour: { glyph: '🌧️', label: '满屏暴雨' },
  wildfire: { glyph: '🔥', label: '熊熊野火' },
  gunshot: { glyph: '🔫', label: '枪击弹道' },
  'glass-break': { glyph: '🪟', label: '屏幕碎裂' },
  boxing: { glyph: '🥊', label: '拳击冲击' },
  'whip-crack': { glyph: '〰️', label: '鞭梢音爆' },
  'note-dance': { glyph: '🎵', label: '音符跳动' },
  groove: { glyph: '💿', label: '黑胶律动' },
  fireworks: { glyph: '🎆', label: '烟花绽放' },
  singularity: { glyph: '🕳️', label: '奇点吸入' },
  'drum-beat': { glyph: '🥁', label: '鼓点震膜' },
};
