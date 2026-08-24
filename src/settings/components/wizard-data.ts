/**
 * 新建素材包向导 — 静态数据：声音采样要求 + 配色方案 + 特效预设元数据。
 * 与组件分离，保持单文件行数 ≤ 250。
 */

import type { EffectIconName } from './EffectIcon';

// ── 声音采样要求 ────────────────────────────────────────────────────────────

export const SOUND_UPLOAD_HINT = '上传 WAV、M4A、MP3、AAC 或 OGG；建议 44.1/48 kHz、24-bit、-1 dBFS 峰值以内的真实录音或 Foley。';

// ── 配色方案 ──────────────────────────────────────────────────────────────────

export interface AccentColor {
  hue: number;
  c1: string;
  c2: string;
  label: string;
}

export const ACCENT_COLORS: AccentColor[] = [
  { hue: 24,  c1: '#FF6B35', c2: '#C23E00', label: '橙焰' },
  { hue: 55,  c1: '#FFD700', c2: '#B88A00', label: '金芒' },
  { hue: 150, c1: '#4DEBA0', c2: '#008A50', label: '翠绿' },
  { hue: 200, c1: '#4DA6FF', c2: '#0040C8', label: '晴蓝' },
  { hue: 270, c1: '#A060FF', c2: '#5020C8', label: '幽紫' },
  { hue: 330, c1: '#FF4D8B', c2: '#C80048', label: '玫红' },
  { hue: 190, c1: '#A0F0FF', c2: '#3A88C8', label: '冰青' },
  { hue: 0,   c1: '#B0B0C0', c2: '#606070', label: '钢灰' },
];

// ── 特效预设显示元数据 ────────────────────────────────────────────────────────

export const PRESET_META: Record<string, { icon: EffectIconName; label: string }> = {
  jet:           { icon: 'jet', label: '喷射' },
  rise:          { icon: 'wing', label: '腾升' },
  bolt:          { icon: 'bolt', label: '闪电' },
  wave:          { icon: 'wave', label: '波浪' },
  orbit:         { icon: 'orbit', label: '环绕' },
  dash:          { icon: 'slash', label: '疾驰' },
  shatter:       { icon: 'shatter', label: '碎裂' },
  burst:         { icon: 'burst', label: '爆散' },
  'flame-rise':  { icon: 'flame', label: '火焰' },
  'shatter-ice': { icon: 'ice', label: '冰裂' },
  'shock-ring':  { icon: 'ring', label: '冲击' },
  'water-splash':{ icon: 'water', label: '水花' },
  whirl:         { icon: 'vortex', label: '旋风' },
  'star-burst':  { icon: 'burst', label: '星爆' },
  impact:        { icon: 'impact', label: '重击' },
  comet:         { icon: 'trail', label: '坠击' },
  'trail-burst': { icon: 'trail', label: '拖尾' },
  pulse:         { icon: 'pulse', label: '脉冲' },
  ring:          { icon: 'ring', label: '声波' },
  petal:         { icon: 'petal', label: '花瓣' },
  echo:          { icon: 'ring', label: '回响' },
  arc:           { icon: 'slash', label: '弧光' },
  spiral:        { icon: 'vortex', label: '螺旋' },
  split:         { icon: 'split', label: '分身' },
  chain:         { icon: 'chain', label: '锁链' },
  glow:          { icon: 'glow', label: '辉光' },
  twinkle:       { icon: 'burst', label: '闪烁' },
  vortex:        { icon: 'vortex', label: '漩涡' },
  rain:          { icon: 'rain', label: '雨丝' },
  explode:       { icon: 'burst', label: '爆炸' },
  tornado:       { icon: 'vortex', label: '龙卷' },
  downpour:      { icon: 'rain', label: '暴雨' },
  wildfire:      { icon: 'flame', label: '野火' },
  gunshot:       { icon: 'trail', label: '枪击' },
  'glass-break': { icon: 'shatter', label: '玻璃' },
  boxing:        { icon: 'impact', label: '拳击' },
  'whip-crack':  { icon: 'wave', label: '甩鞭' },
  'note-dance':  { icon: 'note', label: '音符' },
  groove:        { icon: 'groove', label: '黑胶' },
  fireworks:     { icon: 'burst', label: '烟花' },
  singularity:   { icon: 'singularity', label: '奇点' },
  'drum-beat':   { icon: 'drum', label: '鼓点' },
};
