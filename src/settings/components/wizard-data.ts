/**
 * 新建素材包向导 — 静态数据：声音情绪预设 + 配色方案 + 特效预设元数据。
 * 与组件分离，保持单文件行数 ≤ 250。
 */

// ── 声音情绪预设 ──────────────────────────────────────────────────────────────

export interface SoundMood {
  id: string;
  label: string;
  glyph: string;
  desc: string;
  recipe: {
    masterGain: number;
    layers: Array<{
      type: string;
      attack: number;
      decay: number;
      gain: number;
      filter?: { type: string; freq: number; freqEnd?: number; q?: number };
      osc?: { type: string; freq: number; freqEnd?: number };
      noiseColor?: string;
    }>;
  };
}

export const SOUND_MOODS: SoundMood[] = [
  { id: 'explosive', label: '爆裂', glyph: '💥', desc: '低频冲击 + 白噪爆发',
    recipe: { masterGain: 0.85, layers: [
      { type: 'noise', attack: 0.008, decay: 0.4, gain: 0.7, filter: { type: 'lowpass', freq: 3000, freqEnd: 300, q: 0.7 } },
      { type: 'impact', attack: 0.002, decay: 0.3, gain: 0.8, osc: { type: 'sine', freq: 150, freqEnd: 40 } },
    ]}},
  { id: 'electric', label: '电击', glyph: '⚡', desc: '高频撕裂 + 电波扫频',
    recipe: { masterGain: 0.8, layers: [
      { type: 'noise', attack: 0.01, decay: 0.2, gain: 0.8, filter: { type: 'highpass', freq: 3000, q: 1 } },
      { type: 'tone', attack: 0.004, decay: 0.3, gain: 0.5, osc: { type: 'square', freq: 200, freqEnd: 60 } },
    ]}},
  { id: 'chime', label: '钟鸣', glyph: '🔔', desc: '清脆铃声 + 泛音共鸣',
    recipe: { masterGain: 0.75, layers: [
      { type: 'chime', attack: 0.002, decay: 1.4, gain: 0.6, osc: { type: 'sine', freq: 2093 } },
      { type: 'chime', attack: 0.002, decay: 1.0, gain: 0.4, osc: { type: 'sine', freq: 2637 } },
    ]}},
  { id: 'wind', label: '风声', glyph: '🌪', desc: '粉噪呼啸 + 低频扫频',
    recipe: { masterGain: 0.75, layers: [
      { type: 'noise', attack: 0.01, decay: 0.8, gain: 0.5, noiseColor: 'pink', filter: { type: 'bandpass', freq: 1200, freqEnd: 300, q: 2 } },
      { type: 'sweep', attack: 0.01, decay: 0.7, gain: 0.4, osc: { type: 'triangle', freq: 500, freqEnd: 80 } },
    ]}},
  { id: 'heavy', label: '重击', glyph: '🥁', desc: '超低频轰鸣 + 鼓面冲击',
    recipe: { masterGain: 0.9, layers: [
      { type: 'impact', attack: 0.002, decay: 0.5, gain: 0.9, osc: { type: 'sine', freq: 100, freqEnd: 25 } },
      { type: 'rumble', attack: 0.01, decay: 1.0, gain: 0.6, osc: { type: 'sine', freq: 60, freqEnd: 30 } },
    ]}},
  { id: 'magic', label: '魔法', glyph: '✨', desc: '空灵泛音 + 三重琶音',
    recipe: { masterGain: 0.75, layers: [
      { type: 'chime', attack: 0.002, decay: 0.8, gain: 0.5, osc: { type: 'sine', freq: 1318 } },
      { type: 'chime', attack: 0.01, decay: 1.2, gain: 0.35, osc: { type: 'sine', freq: 1760 } },
      { type: 'tone', attack: 0.004, decay: 0.5, gain: 0.25, osc: { type: 'triangle', freq: 880 } },
    ]}},
];

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

export const PRESET_META: Record<string, { glyph: string; label: string }> = {
  jet:           { glyph: '🚀', label: '喷射' },
  rise:          { glyph: '🦅', label: '腾升' },
  bolt:          { glyph: '⚡', label: '闪电' },
  wave:          { glyph: '🌊', label: '波浪' },
  orbit:         { glyph: '🌀', label: '环绕' },
  dash:          { glyph: '💨', label: '疾驰' },
  shatter:       { glyph: '💎', label: '碎裂' },
  burst:         { glyph: '👻', label: '爆散' },
  'flame-rise':  { glyph: '🔥', label: '火焰' },
  'shatter-ice': { glyph: '🧊', label: '冰裂' },
  'shock-ring':  { glyph: '💥', label: '冲击' },
  'water-splash':{ glyph: '💦', label: '水花' },
  whirl:         { glyph: '🌪', label: '旋风' },
  'star-burst':  { glyph: '✨', label: '星爆' },
  impact:        { glyph: '🔨', label: '重击' },
  comet:         { glyph: '☄', label: '坠击' },
  'trail-burst': { glyph: '🌠', label: '拖尾' },
  pulse:         { glyph: '🎸', label: '脉冲' },
  ring:          { glyph: '📣', label: '声波' },
  petal:         { glyph: '🌸', label: '花瓣' },
  echo:          { glyph: '🔔', label: '回响' },
  arc:           { glyph: '🌙', label: '弧光' },
  spiral:        { glyph: '🌀', label: '螺旋' },
  split:         { glyph: '💫', label: '分身' },
  chain:         { glyph: '⛓', label: '锁链' },
  glow:          { glyph: '☀', label: '辉光' },
  twinkle:       { glyph: '🌟', label: '闪烁' },
  vortex:        { glyph: '🎯', label: '漩涡' },
  rain:          { glyph: '🌧', label: '雨丝' },
  explode:       { glyph: '💣', label: '爆炸' },
};
