#!/usr/bin/env node
/**
 * 生成 30 个内置素材包的 pack.json（特效预设 + 程序化合成声音配方 + 配色）。
 *
 * 每个包：
 *  - effect: 30 预设之一 + 每素材独家参数（内置素材动画 = 预设 + 定制）
 *  - sound: 多层 SoundRecipe（主击 + 共鸣 + 余韵），程序化合成，零音频资产
 *  - palette: 鞭身渐变 + 粒子色相（图标主色推导）
 *
 * 产物：src-tauri/packs/<id>/pack.json
 */

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'src-tauri', 'packs');

// 色相 helper: hex -> hsl hue (0-359)
function hueOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h;
  if (d === 0) h = 0;
  else if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return h % 360;
}

// ── 音色配方工厂 ──────────────────────────────────────────────────────────
// 每个素材的声音 = 主击层 + 共鸣层 + 余韵层（多层合成，触发时微随机变体）

function noiseLayer(over) {
  return Object.assign({ type: 'noise', attack: 0.008, decay: 0.35, gain: 0.55, noiseColor: 'white' }, over);
}
function toneLayer(over) {
  return Object.assign({ type: 'tone', attack: 0.004, decay: 0.4, gain: 0.4, osc: { type: 'sine', freq: 440 } }, over);
}
function sweepLayer(over) {
  return Object.assign({ type: 'sweep', attack: 0.01, decay: 0.5, gain: 0.5, osc: { type: 'sawtooth', freq: 300, freqEnd: 60 } }, over);
}
function impactLayer(over) {
  return Object.assign({ type: 'impact', attack: 0.002, decay: 0.25, gain: 0.8, osc: { type: 'sine', freq: 180, freqEnd: 40 } }, over);
}
function chimeLayer(over) {
  return Object.assign({ type: 'chime', attack: 0.002, decay: 1.1, gain: 0.35, osc: { type: 'sine', freq: 880 } }, over);
}
function rumbleLayer(over) {
  return Object.assign({ type: 'rumble', attack: 0.01, decay: 0.8, gain: 0.6, osc: { type: 'sine', freq: 60, freqEnd: 30 } }, over);
}

function recipe(layers, masterGain = 0.8) {
  return { layers, masterGain };
}

// ── 30 个素材包定义 ───────────────────────────────────────────────────────

const PACKS = [
  {
    id: 'rocket', name: '火箭', c1: '#ff7a29', c2: '#c23e00',
    preset: 'jet',
    params: { thrust: 1.35, tailLength: 1.5, climb: 1.2 },
    sound: recipe([
      noiseLayer({ decay: 0.5, gain: 0.7, filter: { type: 'lowpass', freq: 4000, freqEnd: 300, q: 0.7 } }),
      sweepLayer({ decay: 0.7, gain: 0.6, osc: { type: 'sawtooth', freq: 500, freqEnd: 80 } }),
      rumbleLayer({ decay: 0.9, gain: 0.5 }),
    ]),
  },
  {
    id: 'phoenix', name: '凤凰', c1: '#ff6a3d', c2: '#b02800',
    preset: 'rise',
    params: { spread: 1.4, riseSpeed: 1.1, wingFlap: 1.6 },
    sound: recipe([
      chimeLayer({ decay: 1.6, gain: 0.45, osc: { type: 'sine', freq: 1568 } }),
      sweepLayer({ decay: 1.0, gain: 0.4, osc: { type: 'triangle', freq: 800, freqEnd: 120 } }),
      noiseLayer({ decay: 0.8, gain: 0.3, noiseColor: 'pink', filter: { type: 'highpass', freq: 2000, q: 1 } }),
    ]),
  },
  {
    id: 'lightning', name: '闪电', c1: '#ffd93d', c2: '#c49000',
    preset: 'bolt',
    params: { branches: 3, jaggedness: 1.8, flicker: 2.2 },
    sound: recipe([
      noiseLayer({ decay: 0.18, gain: 0.9, filter: { type: 'highpass', freq: 3000, q: 1 } }),
      toneLayer({ decay: 0.3, gain: 0.5, osc: { type: 'square', freq: 200, freqEnd: 60 } }),
    ]),
  },
  {
    id: 'dragon', name: '神龙', c1: '#2ee88a', c2: '#007a3d',
    preset: 'wave',
    params: { amplitude: 1.6, wavelength: 0.7, undulation: 1.4 },
    sound: recipe([
      rumbleLayer({ decay: 1.2, gain: 0.7 }),
      sweepLayer({ decay: 1.4, gain: 0.4, osc: { type: 'sawtooth', freq: 120, freqEnd: 40 } }),
      toneLayer({ decay: 0.8, gain: 0.3, osc: { type: 'sine', freq: 96 } }),
    ]),
  },
  {
    id: 'ninja-star', name: '手里剑', c1: '#b8b8c8', c2: '#4a4a58',
    preset: 'orbit',
    params: { orbits: 2.5, radius: 1.3, spin: 3.0 },
    sound: recipe([
      toneLayer({ decay: 0.5, gain: 0.6, osc: { type: 'triangle', freq: 1244, freqEnd: 300 } }),
      noiseLayer({ decay: 0.25, gain: 0.4, filter: { type: 'highpass', freq: 5000, q: 1 } }),
    ]),
  },
  {
    id: 'katana', name: '武士刀', c1: '#e8e8f5', c2: '#8a8aa0',
    preset: 'dash',
    params: { dashLength: 1.8, afterimage: 2.0, shear: 1.4 },
    sound: recipe([
      sweepLayer({ decay: 0.4, gain: 0.7, osc: { type: 'sawtooth', freq: 1200, freqEnd: 200 } }),
      toneLayer({ decay: 0.6, gain: 0.5, osc: { type: 'square', freq: 600, freqEnd: 90 } }),
    ]),
  },
  {
    id: 'crystal', name: '水晶', c1: '#7ae2ff', c2: '#0077cc',
    preset: 'shatter',
    params: { shards: 2.0, sparkle: 1.8, shardSpeed: 1.3 },
    sound: recipe([
      chimeLayer({ decay: 0.9, gain: 0.6, osc: { type: 'sine', freq: 2093 } }),
      chimeLayer({ decay: 0.7, gain: 0.4, osc: { type: 'sine', freq: 2637 } }),
      noiseLayer({ decay: 0.3, gain: 0.35, filter: { type: 'highpass', freq: 4000, q: 1 } }),
    ]),
  },
  {
    id: 'skull', name: '骷髅', c1: '#d0d0d8', c2: '#70707c',
    preset: 'burst',
    params: { count: 1.5, ghostly: 2.0, drift: 1.2 },
    sound: recipe([
      rumbleLayer({ decay: 0.9, gain: 0.5, osc: { type: 'sine', freq: 70, freqEnd: 35 } }),
      sweepLayer({ decay: 1.0, gain: 0.4, osc: { type: 'triangle', freq: 300, freqEnd: 60 } }),
      toneLayer({ decay: 1.5, gain: 0.25, osc: { type: 'sine', freq: 130 } }),
    ]),
  },
  {
    id: 'flame', name: '烈焰', c1: '#ff5a1f', c2: '#a01500',
    preset: 'flame-rise',
    params: { turbulence: 2.0, riseSpeed: 1.3, heat: 1.6 },
    sound: recipe([
      noiseLayer({ decay: 0.6, gain: 0.7, filter: { type: 'lowpass', freq: 2000, freqEnd: 400, q: 0.8 } }),
      noiseLayer({ decay: 0.9, gain: 0.4, noiseColor: 'pink', filter: { type: 'lowpass', freq: 1200, q: 1 } }),
      sweepLayer({ decay: 0.5, gain: 0.3, osc: { type: 'triangle', freq: 400, freqEnd: 100 } }),
    ]),
  },
  {
    id: 'ice', name: '寒冰', c1: '#9fe8ff', c2: '#2a7ab8',
    preset: 'shatter-ice',
    params: { shards: 1.8, chill: 1.9, shardSpeed: 1.5 },
    sound: recipe([
      chimeLayer({ decay: 0.6, gain: 0.5, osc: { type: 'sine', freq: 3135 } }),
      chimeLayer({ decay: 0.4, gain: 0.4, osc: { type: 'sine', freq: 1760 } }),
      noiseLayer({ decay: 0.2, gain: 0.5, filter: { type: 'highpass', freq: 5000, q: 1 } }),
    ]),
  },
  {
    id: 'thunder', name: '雷鼓', c1: '#ffe04d', c2: '#a87800',
    preset: 'shock-ring',
    params: { rings: 3, intensity: 2.2, expansion: 1.8 },
    sound: recipe([
      rumbleLayer({ decay: 1.5, gain: 0.9, osc: { type: 'sine', freq: 50, freqEnd: 20 } }),
      noiseLayer({ decay: 0.5, gain: 0.6, filter: { type: 'lowpass', freq: 1500, q: 0.6 } }),
      impactLayer({ gain: 0.7, decay: 0.3 }),
    ]),
  },
  {
    id: 'water', name: '碧波', c1: '#4a8cff', c2: '#0040a0',
    preset: 'water-splash',
    params: { droplets: 2.0, splashHeight: 1.4, ripple: 1.7 },
    sound: recipe([
      noiseLayer({ decay: 0.5, gain: 0.6, filter: { type: 'lowpass', freq: 2500, freqEnd: 500, q: 0.8 } }),
      toneLayer({ decay: 0.8, gain: 0.3, osc: { type: 'sine', freq: 880, freqEnd: 300 } }),
      chimeLayer({ decay: 0.5, gain: 0.25, osc: { type: 'sine', freq: 1568 } }),
    ]),
  },
  {
    id: 'wind', name: '疾风', c1: '#a8e8ff', c2: '#3a88c8',
    preset: 'whirl',
    params: { spirals: 2.2, suction: 1.5, gust: 1.8 },
    sound: recipe([
      noiseLayer({ decay: 0.8, gain: 0.5, noiseColor: 'pink', filter: { type: 'bandpass', freq: 1200, freqEnd: 300, q: 2 } }),
      sweepLayer({ decay: 0.9, gain: 0.4, osc: { type: 'triangle', freq: 600, freqEnd: 80 } }),
    ]),
  },
  {
    id: 'star', name: '星芒', c1: '#ffd94d', c2: '#b88400',
    preset: 'star-burst',
    params: { points: 1.5, twinkle: 2.4, sparkle: 2.0 },
    sound: recipe([
      chimeLayer({ decay: 0.8, gain: 0.6, osc: { type: 'sine', freq: 2637 } }),
      chimeLayer({ decay: 1.0, gain: 0.4, osc: { type: 'sine', freq: 1760 } }),
      toneLayer({ decay: 0.4, gain: 0.3, osc: { type: 'triangle', freq: 3520 } }),
    ]),
  },
  {
    id: 'moon', name: '月刃', c1: '#c8d4ff', c2: '#5a6ab8',
    preset: 'arc',
    params: { arcLength: 1.6, glowTrail: 2.0, elegance: 1.3 },
    sound: recipe([
      toneLayer({ decay: 0.8, gain: 0.5, osc: { type: 'triangle', freq: 1568, freqEnd: 500 } }),
      chimeLayer({ decay: 1.4, gain: 0.3, osc: { type: 'sine', freq: 1174 } }),
      noiseLayer({ decay: 0.3, gain: 0.2, filter: { type: 'highpass', freq: 4000, q: 1 } }),
    ]),
  },
  {
    id: 'sun', name: '烈日', c1: '#ffc42e', c2: '#cc7a00',
    preset: 'glow',
    params: { radiance: 2.4, heatWaves: 1.6, bloom: 2.2 },
    sound: recipe([
      rumbleLayer({ decay: 1.2, gain: 0.6 }),
      toneLayer({ decay: 0.9, gain: 0.4, osc: { type: 'sine', freq: 220, freqEnd: 110 } }),
      chimeLayer({ decay: 1.0, gain: 0.3, osc: { type: 'sine', freq: 880 } }),
    ]),
  },
  {
    id: 'meteor', name: '流星', c1: '#ff7a4d', c2: '#a83a00',
    preset: 'comet',
    params: { trail: 2.2, impact: 1.8, debris: 1.6 },
    sound: recipe([
      sweepLayer({ decay: 0.6, gain: 0.7, osc: { type: 'sawtooth', freq: 800, freqEnd: 60 } }),
      impactLayer({ decay: 0.5, gain: 0.9 }),
      noiseLayer({ decay: 0.4, gain: 0.5, filter: { type: 'lowpass', freq: 3000, q: 0.8 } }),
    ]),
  },
  {
    id: 'comet', name: '彗星', c1: '#a8f0ff', c2: '#3a88c8',
    preset: 'trail-burst',
    params: { trailLength: 2.4, burstSpread: 1.7, glide: 1.2 },
    sound: recipe([
      sweepLayer({ decay: 0.7, gain: 0.6, osc: { type: 'triangle', freq: 1000, freqEnd: 120 } }),
      chimeLayer({ decay: 0.9, gain: 0.4, osc: { type: 'sine', freq: 1318 } }),
      noiseLayer({ decay: 0.5, gain: 0.3, noiseColor: 'pink', filter: { type: 'highpass', freq: 3000, q: 1 } }),
    ]),
  },
  {
    id: 'guitar', name: '电吉他', c1: '#ff9c4d', c2: '#a84a00',
    preset: 'pulse',
    params: { strum: 1.8, resonance: 1.9, punch: 1.4 },
    sound: recipe([
      toneLayer({ decay: 1.1, gain: 0.7, osc: { type: 'sawtooth', freq: 330, freqEnd: 110 }, filter: { type: 'bandpass', freq: 1500, q: 4 } }),
      chimeLayer({ decay: 0.7, gain: 0.5, osc: { type: 'square', freq: 660 } }),
      impactLayer({ gain: 0.5, decay: 0.2 }),
    ]),
  },
  {
    id: 'drum', name: '战鼓', c1: '#ff7a4d', c2: '#a82a00',
    preset: 'shock-ring',
    params: { rings: 2, intensity: 2.0, bass: 2.4 },
    sound: recipe([
      impactLayer({ decay: 0.4, gain: 0.9, osc: { type: 'sine', freq: 120, freqEnd: 30 } }),
      rumbleLayer({ decay: 0.8, gain: 0.6, osc: { type: 'sine', freq: 80, freqEnd: 40 } }),
      noiseLayer({ decay: 0.15, gain: 0.4, filter: { type: 'highpass', freq: 2000, q: 1 } }),
    ]),
  },
  {
    id: 'bell', name: '铃铛', c1: '#ffd94d', c2: '#b88400',
    preset: 'echo',
    params: { echoes: 3, ring: 1.8, decay: 1.6 },
    sound: recipe([
      chimeLayer({ decay: 1.8, gain: 0.7, osc: { type: 'sine', freq: 2093 } }),
      chimeLayer({ decay: 1.4, gain: 0.5, osc: { type: 'sine', freq: 2793 } }),
      toneLayer({ decay: 0.3, gain: 0.4, osc: { type: 'triangle', freq: 3135 } }),
    ]),
  },
  {
    id: 'harp', name: '竖琴', c1: '#ffc48a', c2: '#b8703a',
    preset: 'petal',
    params: { arpeggio: 1.9, scatter: 1.5, grace: 1.4 },
    sound: recipe([
      chimeLayer({ decay: 1.3, gain: 0.5, osc: { type: 'sine', freq: 1318 } }),
      chimeLayer({ decay: 1.1, gain: 0.4, osc: { type: 'sine', freq: 1760 } }),
      chimeLayer({ decay: 0.9, gain: 0.3, osc: { type: 'sine', freq: 2093 } }),
    ]),
  },
  {
    id: 'trumpet', name: '号角', c1: '#ffd66a', c2: '#cc8a00',
    preset: 'ring',
    params: { fanfare: 2.0, brass: 1.8, projection: 1.6 },
    sound: recipe([
      toneLayer({ decay: 0.9, gain: 0.7, osc: { type: 'square', freq: 440, freqEnd: 660 }, filter: { type: 'bandpass', freq: 1200, q: 2 } }),
      chimeLayer({ decay: 1.2, gain: 0.4, osc: { type: 'sine', freq: 880 } }),
      rumbleLayer({ decay: 0.6, gain: 0.3 }),
    ]),
  },
  {
    id: 'bow', name: '长弓', c1: '#c8904d', c2: '#7a4a1a',
    preset: 'dash',
    params: { dashLength: 1.2, twang: 1.9, release: 1.3 },
    sound: recipe([
      sweepLayer({ decay: 0.3, gain: 0.6, osc: { type: 'sawtooth', freq: 900, freqEnd: 300 } }),
      toneLayer({ decay: 0.9, gain: 0.5, osc: { type: 'triangle', freq: 660, freqEnd: 220 }, filter: { type: 'bandpass', freq: 2000, q: 3 } }),
      noiseLayer({ decay: 0.2, gain: 0.3, filter: { type: 'highpass', freq: 4000, q: 1 } }),
    ]),
  },
  {
    id: 'shield', name: '坚盾', c1: '#6aa8ff', c2: '#1a5ad8',
    preset: 'impact',
    params: { block: 1.7, resonance: 1.5, deflection: 1.2 },
    sound: recipe([
      impactLayer({ decay: 0.4, gain: 0.8, osc: { type: 'sine', freq: 200, freqEnd: 60 } }),
      toneLayer({ decay: 0.7, gain: 0.4, osc: { type: 'square', freq: 440, freqEnd: 150 } }),
      noiseLayer({ decay: 0.3, gain: 0.3, filter: { type: 'bandpass', freq: 2000, q: 2 } }),
    ]),
  },
  {
    id: 'axe', name: '战斧', c1: '#c8b0e8', c2: '#6a3aa8',
    preset: 'impact',
    params: { chop: 1.9, weight: 2.1, cleave: 1.5 },
    sound: recipe([
      sweepLayer({ decay: 0.3, gain: 0.7, osc: { type: 'sawtooth', freq: 700, freqEnd: 100 } }),
      impactLayer({ decay: 0.5, gain: 0.9, osc: { type: 'sine', freq: 150, freqEnd: 35 } }),
      noiseLayer({ decay: 0.4, gain: 0.4, filter: { type: 'lowpass', freq: 2500, q: 0.7 } }),
    ]),
  },
  {
    id: 'spear', name: '长矛', c1: '#e8e8c8', c2: '#9a9a5a',
    preset: 'dash',
    params: { thrust: 1.6, pierce: 1.4, speed: 1.9 },
    sound: recipe([
      sweepLayer({ decay: 0.35, gain: 0.7, osc: { type: 'sawtooth', freq: 1000, freqEnd: 250 } }),
      noiseLayer({ decay: 0.25, gain: 0.5, filter: { type: 'highpass', freq: 5000, q: 1 } }),
      toneLayer({ decay: 0.5, gain: 0.3, osc: { type: 'triangle', freq: 523 } }),
    ]),
  },
  {
    id: 'bomb', name: '炸弹', c1: '#6a6a78', c2: '#1a1a24',
    preset: 'explode',
    params: { blast: 2.6, shockwave: 2.2, debris: 2.0 },
    sound: recipe([
      impactLayer({ decay: 0.6, gain: 1.0, osc: { type: 'sine', freq: 100, freqEnd: 25 } }),
      noiseLayer({ decay: 0.8, gain: 0.9, filter: { type: 'lowpass', freq: 3000, freqEnd: 200, q: 0.6 } }),
      rumbleLayer({ decay: 1.4, gain: 0.7 }),
    ]),
  },
  {
    id: 'lotus', name: '莲花', c1: '#ff9cce', c2: '#d84a8a',
    preset: 'petal',
    params: { bloom: 1.7, serenity: 1.8, scatter: 1.3 },
    sound: recipe([
      chimeLayer({ decay: 1.6, gain: 0.45, osc: { type: 'sine', freq: 1046 } }),
      chimeLayer({ decay: 1.3, gain: 0.35, osc: { type: 'sine', freq: 1318 } }),
      sweepLayer({ decay: 1.2, gain: 0.25, osc: { type: 'triangle', freq: 500, freqEnd: 150 } }),
    ]),
  },
  {
    id: 'aurora', name: '极光', c1: '#4dffa6', c2: '#00b87a',
    preset: 'wave',
    params: { shimmer: 2.4, flow: 1.8, spectral: 2.0 },
    sound: recipe([
      sweepLayer({ decay: 1.5, gain: 0.5, osc: { type: 'triangle', freq: 1200, freqEnd: 200 } }),
      chimeLayer({ decay: 1.8, gain: 0.35, osc: { type: 'sine', freq: 1568 } }),
      noiseLayer({ decay: 1.2, gain: 0.25, noiseColor: 'pink', filter: { type: 'bandpass', freq: 1500, q: 1.5 } }),
    ]),
  },
];

for (const pack of PACKS) {
  const hue = hueOf(pack.c1);
  const json = {
    id: pack.id,
    name: pack.name,
    icon: 'icon.svg',
    effect: { preset: pack.preset, params: pack.params },
    sound: pack.sound,
    palette: {
      bodyGradient: [pack.c1, pack.c2],
      particleHue: hue,
    },
  };
  const dir = path.join(OUT, pack.id);
  fs.writeFileSync(path.join(dir, 'pack.json'), JSON.stringify(json, null, 2) + '\n');
  console.log(`${pack.id}: effect=${pack.preset} layers=${pack.sound.layers.length} hue=${hue}`);
}
console.log(`\nGenerated ${PACKS.length} pack.json files.`);
