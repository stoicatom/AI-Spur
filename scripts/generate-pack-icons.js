#!/usr/bin/env node
/**
 * 生成 30 个内置素材包的立体 SVG 图标。
 *
 * 设计语言（区别于旧 game-icons 平涂）：
 *  - 512 viewBox，图标主体 200px 居中
 *  - 双层线性渐变（主色 → 深色）+ 顶部高光路径 + 底部投影光晕
 *  - 每个图标有独特造型（火箭/凤凰/闪电/龙…）
 *  - 输出 < 8KB/枚，满足体积预算
 *
 * 产物：src-tauri/packs/<id>/icon.svg
 */

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'src-tauri', 'packs');

// ── 30 个图标定义 ─────────────────────────────────────────────────────────
// 每个: { id, name, hue: [主色, 深色, 高光色], body: SVG 路径/元素 }

function gradient(id, c1, c2) {
  return `<linearGradient id="g${id}" x1="0.3" y1="0" x2="0.7" y2="1">
    <stop offset="0" stop-color="${c1}"/>
    <stop offset="1" stop-color="${c2}"/>
  </linearGradient>`;
}

function highlight(id, c) {
  return `<ellipse cx="256" cy="120" rx="90" ry="38" fill="${c}" opacity="0.5">
    <animate attributeName="opacity" values="0.5;0.25;0.5" dur="2s" repeatCount="indefinite"/>
  </ellipse>`;
}

// 主体形状（512 空间内）
const ICONS = [
  // 火箭：尖头+机身+尾焰
  { id: 'rocket', name: '火箭', c1: '#ff7a29', c2: '#c23e00', glow: '#ff8c42',
    body: `<path fill="url(#grocket)" d="M256 96c-28 42-48 78-48 118 0 56 22 90 48 118 26-28 48-62 48-118 0-40-20-76-48-118zm-36 128c-8-26 4-48 36-80 32 32 44 54 36 80-8 26-28 42-36 42s-28-16-36-42z"/>
      <path fill="#ffd9b0" d="M256 96c-6 10-10 22-12 34l12-6 12 6c-2-12-6-24-12-34z"/>
      <path fill="#ff8c42" d="M256 332c-20-24-34-52-34-84 0-8 2-16 4-24 10 40 20 68 30 108z" opacity="0.8">
        <animate attributeName="opacity" values="0.8;0.4;0.8" dur="0.9s" repeatCount="indefinite"/>
      </path>`,
  },
  // 凤凰：展翅 + 尾羽
  { id: 'phoenix', name: '凤凰', c1: '#ff6a3d', c2: '#b02800', glow: '#ff7a5c',
    body: `<path fill="url(#gphoenix)" d="M256 96c-30 20-56 52-66 88-6 22-4 46 6 66 20-18 42-30 60-30s40 12 60 30c10-20 12-44 6-66-10-36-36-68-66-88zm-10 60c-8 24-22 44-40 58 8-26 22-44 40-58zm20 0c18 14 32 32 40 58-18-14-32-32-40-58z"/>
      <path fill="#ffb199" d="M256 96c-14 10-26 24-36 40l36-20 36 20c-10-16-22-30-36-40z"/>
      <path fill="url(#gphoenix)" d="M256 300c-30 12-52 32-68 56l68-16 68 16c-16-24-38-44-68-56z" opacity="0.9"/>`,
  },
  // 闪电：之字形
  { id: 'lightning', name: '闪电', c1: '#ffd93d', c2: '#c49000', glow: '#ffe066',
    body: `<path fill="url(#glightning)" d="M286 96 150 272h88l-28 144 150-188h-88l14-132z"/>
      <path fill="#fff6d0" d="M286 96c-4 20-10 38-18 54l18-10 18 10c-8-16-14-34-18-54z"/>`,
  },
  // 龙：蛇形身体 + 角
  { id: 'dragon', name: '神龙', c1: '#2ee88a', c2: '#007a3d', glow: '#4dffa6',
    body: `<path fill="url(#gdragon)" d="M256 96c-60 0-100 36-100 80 0 36 28 60 64 60 28 0 44-14 44-30 0-14-10-24-26-24-14 0-26 8-26 20 0 10 8 18 20 18 8 0 14-4 14-10 0-6-4-10-10-10-4 0-8 4-8 8 0 4 2 6 6 6 2 0 4-2 4-4s-2-4-4-4c-2 0-4 2-4 4 0 2 2 4 4 4 2 0 2-2 2-4 0-2-2-2-2 0 0 2 2 2 2 0 0-2-2-2-2 0 0 2 0 4 2 4 4 0 6-6 6-14 0-22-10-22-24 0-16 14-28 34-28 20 0 34 12 34 32 0 20-18 40-48 40-40 0-72-28-72-68 0-48 44-88 108-88 64 0 108 40 108 88 0 36-26 64-60 64-24 0-42-12-42-28 0-12 8-20 20-20 8 0 14 4 14 10 0 6-6 10-14 10-10 0-16-6-16-14 0-6 4-12 12-12 8 0 14 4 14 10 0 4-4 8-8 8-4 0-6-2-6-4 0-2 2-4 6-4 2 0 4 2 4 4 0 2-2 2-4 2-2 0-4-2-4-2z"/>
      <path fill="#a8ffd0" d="M256 96c-6 0-12 0-18 2l18 18 18-18c-6-2-12-2-18-2z"/>`,
  },
  // 手里剑：四角星
  { id: 'ninja-star', name: '手里剑', c1: '#b8b8c8', c2: '#4a4a58', glow: '#d0d0e0',
    body: `<path fill="url(#gninja-star)" d="M256 96 300 212l116-44-60 88 60 88-116-44-44 116-44-116-116 44 60-88-60-88 116 44z"/>
      <path fill="#e8e8f0" d="M256 96c8 40 20 76 44 116-40 8-76 20-116 44 8-40 20-76 44-116 40-8 20-24 28-44z" opacity="0.6"/>`,
  },
  // 武士刀：刀刃 + 柄
  { id: 'katana', name: '武士刀', c1: '#e8e8f5', c2: '#8a8aa0', glow: '#f0f0ff',
    body: `<path fill="url(#gkatana)" d="M380 96 216 260l-40 40 40 40 40-40 164-164-40-40z"/>
      <path fill="#c23e00" d="M176 300l-44 44 40 40 44-44-40-40z"/>
      <path fill="#fff" d="M380 96l-40 40 164 164 40-40-164-164z" opacity="0.4"/>`,
  },
  // 水晶：六面体
  { id: 'crystal', name: '水晶', c1: '#7ae2ff', c2: '#0077cc', glow: '#a0eeff',
    body: `<path fill="url(#gcrystal)" d="M256 96 356 176v96l-100 80-100-80v-96z"/>
      <path fill="#d6f4ff" d="M256 96l100 80-100 80-100-80z" opacity="0.7"/>
      <path fill="#3a9fd8" d="M256 176v176l100-80v-96z" opacity="0.8"/>`,
  },
  // 骷髅
  { id: 'skull', name: '骷髅', c1: '#d0d0d8', c2: '#70707c', glow: '#e8e8f0',
    body: `<path fill="url(#gskull)" d="M256 96c-60 0-104 44-104 100 0 40 22 72 56 84v36c0 12 8 20 20 20h56c12 0 20-8 20-20v-36c34-12 56-44 56-84 0-56-44-100-104-100zm-56 88c-14 0-24-10-24-24s10-24 24-24 24 10 24 24-10 24-24 24zm112 0c-14 0-24-10-24-24s10-24 24-24 24 10 24 24-10 24-24 24z"/>
      <ellipse cx="200" cy="160" rx="12" ry="16" fill="#1a1a20"/>
      <ellipse cx="312" cy="160" rx="12" ry="16" fill="#1a1a20"/>`,
  },
  // 火焰
  { id: 'flame', name: '烈焰', c1: '#ff5a1f', c2: '#a01500', glow: '#ff8c42',
    body: `<path fill="url(#gflame)" d="M256 96c-36 40-72 72-72 124 0 44 32 76 72 76s72-32 72-76c0-52-36-84-72-124zm0 156c-16 0-28-12-28-28 0-20 16-40 28-52 12 12 28 32 28 52 0 16-12 28-28 28z"/>
      <path fill="#ffd9b0" d="M256 96c-8 12-12 26-14 40l14-8 14 8c-2-14-6-28-14-40z"/>`,
  },
  // 冰晶
  { id: 'ice', name: '寒冰', c1: '#9fe8ff', c2: '#2a7ab8', glow: '#c8f4ff',
    body: `<path fill="url(#gice)" d="M256 96 320 256l-64 160-64-160z"/>
      <path fill="#e8faff" d="M256 96 288 256h-64z" opacity="0.7"/>
      <path fill="#4a9ad8" d="M320 256 256 416l-64-160 64 64z" opacity="0.8"/>`,
  },
  // 雷鼓
  { id: 'thunder', name: '雷鼓', c1: '#ffe04d', c2: '#a87800', glow: '#ffe88a',
    body: `<ellipse cx="256" cy="200" rx="110" ry="96" fill="url(#gthunder)"/>
      <path fill="#7a4a00" d="M256 104 356 200 256 296 156 200z"/>
      <path fill="#fff6d0" d="M256 104l100 96h-100z" opacity="0.5"/>`,
  },
  // 水波
  { id: 'water', name: '碧波', c1: '#4a8cff', c2: '#0040a0', glow: '#6aaaff',
    body: `<path fill="url(#gwater)" d="M96 208c40-32 80-32 120 0s80 32 120 0 40-16 40-16v56c0 20-20 32-40 32H136c-20 0-40-12-40-32v-40z" opacity="0.9"/>
      <path fill="#b0d4ff" d="M96 208c40-32 80-32 120 0s80 32 120 0 40-16 40-16" fill="none" stroke="#c8e4ff" stroke-width="6" stroke-linecap="round"/>
      <path fill="url(#gwater)" d="M96 288c40-32 80-32 120 0s80 32 120 0v32c0 20-20 32-40 32H136c-20 0-40-12-40-32v-32z"/>`,
  },
  // 疾风
  { id: 'wind', name: '疾风', c1: '#a8e8ff', c2: '#3a88c8', glow: '#d0f4ff',
    body: `<path fill="none" stroke="url(#gwind)" stroke-width="28" stroke-linecap="round" d="M96 176c40 0 56-20 56-48 0-28-20-44-44-44-24 0-44 16-44 44"/>
      <path fill="none" stroke="#d0f4ff" stroke-width="18" stroke-linecap="round" d="M120 256c56 0 80-28 80-64 0-36-28-60-64-60-36 0-64 24-64 60" opacity="0.7"/>
      <path fill="none" stroke="url(#gwind)" stroke-width="22" stroke-linecap="round" d="M96 336c48 0 68-24 68-56 0-32-24-52-52-52-28 0-52 20-52 52" opacity="0.9"/>`,
  },
  // 星芒
  { id: 'star', name: '星芒', c1: '#ffd94d', c2: '#b88400', glow: '#ffe88a',
    body: `<path fill="url(#gstar)" d="M256 80 300 212l132-44-76 108 76 108-132-44-44 132-44-132-132 44 76-108-76-108 132 44z"/>
      <path fill="#fff6d0" d="M256 80c4 40 12 72 44 132-40-4-72-12-132-44 40-4 72-12 132-44 40 4 12 16 16 28 0 0 4-20-8-44z" opacity="0.6"/>`,
  },
  // 月刃
  { id: 'moon', name: '月刃', c1: '#c8d4ff', c2: '#5a6ab8', glow: '#e0e8ff',
    body: `<path fill="url(#gmoon)" d="M256 96c-80 0-144 64-144 144s64 144 144 144c20 0 40-4 56-12-60-16-100-72-100-132s40-116 100-132c-16-8-36-12-56-12z"/>
      <path fill="#f0f4ff" d="M256 96c-10 0-20 2-30 4 60 20 100 76 100 140s-40 120-100 140c10 2 20 4 30 4 80 0 144-64 144-144s-64-144-144-144z" opacity="0.5"/>`,
  },
  // 烈日
  { id: 'sun', name: '烈日', c1: '#ffc42e', c2: '#cc7a00', glow: '#ffd66a',
    body: `<ellipse cx="256" cy="240" rx="84" ry="84" fill="url(#gsun)"/>
      <g stroke="#ffc42e" stroke-width="14" stroke-linecap="round" opacity="0.9">
        <line x1="256" y1="80" x2="256" y2="120"/><line x1="256" y1="360" x2="256" y2="400"/>
        <line x1="96" y1="240" x2="136" y2="240"/><line x1="376" y1="240" x2="416" y2="240"/>
        <line x1="143" y1="127" x2="170" y2="154"/><line x1="342" y1="326" x2="369" y2="353"/>
        <line x1="143" y1="353" x2="170" y2="326"/><line x1="342" y1="154" x2="369" y2="127"/>
      </g>
      <ellipse cx="220" cy="200" rx="30" ry="22" fill="#fff6d0" opacity="0.5"/>`,
  },
  // 流星
  { id: 'meteor', name: '流星', c1: '#ff7a4d', c2: '#a83a00', glow: '#ff9c6a',
    body: `<path fill="url(#gmeteor)" d="M336 96 128 304c-16 16-16 40 0 56s40 16 56 0L392 152l-56-56z"/>
      <path fill="#ffd9b0" d="M336 96l56 56-40 40-56-56z" opacity="0.6"/>
      <path fill="#ff9c6a" d="M96 384c40-8 64-20 88-44-8 40-24 60-88 44z" opacity="0.7">
        <animate attributeName="opacity" values="0.7;0.3;0.7" dur="0.8s" repeatCount="indefinite"/>
      </path>`,
  },
  // 彗星
  { id: 'comet', name: '彗星', c1: '#a8f0ff', c2: '#3a88c8', glow: '#d0f8ff',
    body: `<ellipse cx="256" cy="240" rx="56" ry="56" fill="url(#gcomet)"/>
      <path fill="#d0f8ff" d="M256 184c-40 8-72 28-96 56 24 4 48-8 72-24l24-32z" opacity="0.8"/>
      <path fill="#a8f0ff" d="M256 184c-20 20-28 44-28 68 8-16 16-32 28-44v-24z" opacity="0.6"/>
      <ellipse cx="232" cy="220" rx="16" ry="12" fill="#e8fcff" opacity="0.7"/>`,
  },
  // 电吉他
  { id: 'guitar', name: '电吉他', c1: '#ff9c4d', c2: '#a84a00', glow: '#ffb87a',
    body: `<rect x="200" y="96" width="112" height="280" rx="20" fill="url(#gguitar)"/>
      <circle cx="256" cy="120" r="20" fill="#fff6d0"/>
      <circle cx="256" cy="180" r="12" fill="#1a1a20"/>
      <circle cx="256" cy="230" r="12" fill="#1a1a20"/>
      <circle cx="256" cy="280" r="12" fill="#1a1a20"/>
      <rect x="228" y="96" width="10" height="280" fill="#ffd9b0" opacity="0.5"/>`,
  },
  // 战鼓
  { id: 'drum', name: '战鼓', c1: '#ff7a4d', c2: '#a82a00', glow: '#ff9c6a',
    body: `<ellipse cx="256" cy="180" rx="100" ry="60" fill="url(#gdrum)"/>
      <rect x="156" y="180" width="200" height="80" fill="#c23e00"/>
      <ellipse cx="256" cy="260" rx="100" ry="60" fill="#8a1a00"/>
      <ellipse cx="256" cy="180" rx="100" ry="60" fill="#ffb07a" opacity="0.5"/>
      <g stroke="#c23e00" stroke-width="8" stroke-linecap="round">
        <line x1="156" y1="140" x2="136" y2="96"/><line x1="356" y1="140" x2="376" y2="96"/>
        <line x1="156" y1="300" x2="136" y2="344"/><line x1="356" y1="300" x2="376" y2="344"/>
      </g>`,
  },
  // 铃铛
  { id: 'bell', name: '铃铛', c1: '#ffd94d', c2: '#b88400', glow: '#ffe88a',
    body: `<path fill="url(#gbell)" d="M256 96c-56 0-96 44-96 100v56l-32 44c-8 12 0 28 16 28h224c16 0 24-16 16-28l-32-44v-56c0-56-40-100-96-100z"/>
      <path fill="#fff6d0" d="M256 96c-10 0-20 2-30 4 30 8 50 36 50 68 0 24-8 44-20 60l36 8c16-20 24-44 24-68 0-40-24-72-60-72z" opacity="0.6"/>
      <ellipse cx="256" cy="376" rx="24" ry="12" fill="#b88400"/>
      <circle cx="256" cy="388" r="10" fill="#8a5c00"/>`,
  },
  // 竖琴
  { id: 'harp', name: '竖琴', c1: '#ffc48a', c2: '#b8703a', glow: '#ffd9b0',
    body: `<path fill="url(#gharp)" d="M256 96v280c-60-12-104-48-104-96 0-60 44-120 104-184zm0 0v280c60-12 104-48 104-96 0-60-44-120-104-184z" fill-rule="evenodd"/>
      <g stroke="#fff6d0" stroke-width="4" opacity="0.7">
        <line x1="256" y1="120" x2="196" y2="280"/><line x1="256" y1="160" x2="208" y2="300"/>
        <line x1="256" y1="120" x2="316" y2="280"/><line x1="256" y1="160" x2="304" y2="300"/>
      </g>`,
  },
  // 号角
  { id: 'trumpet', name: '号角', c1: '#ffd66a', c2: '#cc8a00', glow: '#ffe8a0',
    body: `<path fill="url(#gtrumpet)" d="M96 160c0 80 40 140 120 180 8 4 16 0 16-8v-40c0-8 8-12 16-8l40 20c16 8 36-4 36-24V160H96z" opacity="0.9"/>
      <rect x="96" y="136" width="280" height="48" rx="12" fill="#ffb84d"/>
      <ellipse cx="96" cy="160" rx="12" ry="24" fill="#8a5c00"/>`,
  },
  // 长弓
  { id: 'bow', name: '长弓', c1: '#c8904d', c2: '#7a4a1a', glow: '#e0b07a',
    body: `<path fill="none" stroke="url(#gbow)" stroke-width="22" stroke-linecap="round" d="M196 96 C320 160 320 352 196 416"/>
      <path fill="none" stroke="#e8c890" stroke-width="6" d="M196 96 L196 416"/>
      <path fill="#f0d0a0" stroke="#7a4a1a" stroke-width="4" d="M196 160 L316 256 L196 352 Z"/>`,
  },
  // 坚盾
  { id: 'shield', name: '坚盾', c1: '#6aa8ff', c2: '#1a5ad8', glow: '#8abfff',
    body: `<path fill="url(#gshield)" d="M256 96 384 144v96c0 72-52 128-128 152-76-24-128-80-128-152v-96z"/>
      <path fill="#b0d4ff" d="M256 96 320 144v96c0 36-18 68-64 96v-192z" opacity="0.6"/>
      <path fill="#e8f4ff" d="M256 96l64 48-64 48z" opacity="0.8"/>`,
  },
  // 战斧
  { id: 'axe', name: '战斧', c1: '#c8b0e8', c2: '#6a3aa8', glow: '#e0d0f8',
    body: `<path fill="url(#gaxe)" d="M96 220c0-40 32-72 72-72h24v144h-24c-40 0-72-32-72-72z"/>
      <path fill="#fff6d0" d="M96 220c0-40 32-72 72-72h24l-24 144h-24c-40 0-72-32-72-72z" opacity="0.5"/>
      <rect x="168" y="148" width="160" height="36" rx="10" fill="#7a4a1a"/>
      <rect x="300" y="96" width="36" height="180" rx="10" fill="#5a2a0a"/>`,
  },
  // 长矛
  { id: 'spear', name: '长矛', c1: '#e8e8c8', c2: '#9a9a5a', glow: '#f0f0d8',
    body: `<path fill="url(#gspear)" d="M256 80 336 176l-160 240-80-80z"/>
      <path fill="#fff6d0" d="M256 80l80 96-160 240L96 336z" opacity="0.5"/>
      <rect x="150" y="320" width="220" height="30" rx="12" fill="#7a4a1a" transform="rotate(-37 150 320)"/>`,
  },
  // 炸弹
  { id: 'bomb', name: '炸弹', c1: '#6a6a78', c2: '#1a1a24', glow: '#8a8a9c',
    body: `<circle cx="256" cy="260" r="100" fill="url(#gbomb)"/>
      <path fill="#ffd9b0" d="M256 160c-10 0-20 2-28 6 28 8 48 34 48 64 0 20-8 36-20 48l24 8c20-16 32-36 32-60 0-36-28-66-56-66z" opacity="0.6"/>
      <rect x="300" y="100" width="24" height="56" rx="10" fill="#4a4a58" transform="rotate(30 312 128)"/>
      <circle cx="210" cy="220" rx="14" ry="16" fill="#fff" opacity="0.5"/>`,
  },
  // 莲花
  { id: 'lotus', name: '莲花', c1: '#ff9cce', c2: '#d84a8a', glow: '#ffb8e0',
    body: `<path fill="url(#glotus)" d="M256 96c-20 28-40 56-48 92 8-4 16-8 24-8 8 0 16 4 24 8 8-4 16-8 24-8 8 0 16 4 24 8-8-36-28-64-48-92z"/>
      <path fill="#ffc8e8" d="M256 96c-16 24-32 48-40 80 8-4 16-6 24-6 12 0 16 4 16 4 0-28-4-52-8-78z" opacity="0.7"/>
      <path fill="url(#glotus)" d="M160 264c40-20 64-44 96-72 32 28 56 52 96 72-32 8-64 12-96 12s-64-4-96-12z" opacity="0.9"/>`,
  },
  // 极光
  { id: 'aurora', name: '极光', c1: '#4dffa6', c2: '#00b87a', glow: '#8affc8',
    body: `<path fill="none" stroke="url(#gaurora)" stroke-width="18" stroke-linecap="round" d="M96 336c60-80 120-160 180-240 30 60 60 100 140 160" opacity="0.9">
        <animate attributeName="opacity" values="0.9;0.5;0.9" dur="2.4s" repeatCount="indefinite"/>
      </path>
      <path fill="none" stroke="#8affc8" stroke-width="10" stroke-linecap="round" d="M136 360c50-70 96-130 140-200 26 50 50 80 100 120" opacity="0.7">
        <animate attributeName="opacity" values="0.7;0.3;0.7" dur="2.4s" repeatCount="indefinite"/>
      </path>`,
  },
];

function renderIcon(def) {
  const gid = def.id.replace(/-/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    ${gradient(gid, def.c1, def.c2)}
  </defs>
  <g>
    ${def.body}
  </g>
</svg>`;
}

let total = 0;
for (const def of ICONS) {
  const svg = renderIcon(def);
  const dir = path.join(OUT, def.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'icon.svg'), svg);
  total += svg.length;
  console.log(`${def.id}: ${svg.length} bytes`);
}
console.log(`\nTotal: ${total} bytes (${(total / 1024).toFixed(1)} KB), avg ${Math.round(total / ICONS.length)} bytes/icon`);
