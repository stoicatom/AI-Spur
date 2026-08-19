/**
 * Overlay window entry point (v3 素材包驱动).
 *
 * 交互模型：
 *   1. 热键/托盘 → overlay 显示（不夺焦点），素材包图标吸附光标
 *   2. Rust ~60fps 推送 cursor-pos，素材跟随 + 拖尾
 *   3. 快速甩动达 snap 阈值 → crack（同时发 Ctrl+C + 提示词）
 *   4. 播放素材包专属特效（effects.ts 预设）+ 程序化声音（audio-engine.ts）
 *   5. 爆裂动画结束 → 渐隐 → 隐藏覆盖层
 *   Esc：无副作用取消。
 */
import {
  onSpawnWhip,
  onDropWhip,
  onCursorPos,
  onPackChanged,
  onMaterialChanged,
  triggerMacro,
  incrementUsage,
  stopCursorTracking,
  listPacks,
  listMaterials,
  getConfig,
} from '../shared/ipc';
import {
  ImageMaterial,
  MaterialTrail,
  resolveMaterial,
  resolvePackMaterial,
} from './material-visual';
import { SwingDetector, DEFAULT_SWING, type SwingParams } from './swing';
import { toWhipVel, type WhipVel } from './particles';
import { playRecipe, closeAudioContext } from './audio-engine';
import type { MaterialPack } from '../shared/material-packs';

// ── Canvas ────────────────────────────────────────────────────────────────

const canvasEl = document.getElementById('whip-canvas') as HTMLCanvasElement | null;
if (!canvasEl) throw new Error('whip-canvas element not found');
const ctxOrNull = canvasEl.getContext('2d');
if (!ctxOrNull) throw new Error('2D context unavailable');
const canvas: HTMLCanvasElement = canvasEl;
const ctx: CanvasRenderingContext2D = ctxOrNull;

let width = 0;
let height = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
window.addEventListener('resize', resize);

// ── State ─────────────────────────────────────────────────────────────────

const material = new ImageMaterial();
const trail = new MaterialTrail();
const swing = new SwingDetector(performance.now());
let swingParams: SwingParams = { ...DEFAULT_SWING };

let soundEnabled = true;
// v3：活跃素材包（含声音配方）
let activePack: MaterialPack | null = null;

let mouseX = width / 2;
let mouseY = height / 2;
let active = false; // 覆盖层是否处于活跃状态

// ── 素材包 ────────────────────────────────────────────────────────────────

async function applyActivePack(packId?: string) {
  try {
    // 首次加载（或显式指定 packId 时）重新拉取列表；否则用缓存。
    const packs = packsCache ?? (await listPacks());
    packsCache = packs;
    const config = packId ? null : await getConfig();
    const targetId = packId ?? config?.activePackId ?? 'rocket';
    const pack = packs.find((p) => p.id === targetId) ?? packs.find((p) => p.id === 'rocket');
    if (!pack) return;
    activePack = pack;
    const resolved = resolvePackMaterial(targetId, packs);
    material.loadPack(resolved.url, pack.effect.preset, pack.effect.params, pack.palette.particleHue);
    trail.setHue(pack.palette.particleHue);
  } catch {
    await applyActiveMaterialLegacy(packId);
  }
}

/** 向后兼容：当素材包列表空时，回退旧 Material 路径。 */
async function applyActiveMaterialLegacy(materialId?: string) {
  try {
    const [config, materials] = await Promise.all([
      materialId ? Promise.resolve(null) : getConfig(),
      listMaterials(),
    ]);
    const targetId = materialId ?? config?.activeMaterialId ?? config?.activePackId ?? 'rocket';
    const resolved = resolveMaterial(targetId, materials);
    material.load(resolved.url, resolved.id);
    trail.setHue(material.hue);
  } catch {}
}

async function loadPreferences() {
  try {
    const config = await getConfig();
    soundEnabled = config.playSound;
    swingParams = { ...DEFAULT_SWING, sensitivity: config.crackSensitivity };
  } catch {}
}

// ── 声音 ──────────────────────────────────────────────────────────────────

function playEffectSound() {
  if (!soundEnabled) return;
  if (!activePack) return;
  playRecipe(activePack.sound);
}

// ── Crack ─────────────────────────────────────────────────────────────────

function triggerCrack(x: number, y: number, vel: WhipVel) {
  if (material.crackAlive || !active) return;
  // 判定瞬间即发键：终端保持焦点，Ctrl+C 早发早生效。
  triggerMacro().catch((err) => console.error('[overlay] macro failed:', err));
  active = false;
  playEffectSound();
  material.startCrack(x, y, vel);
  trail.clear();
  incrementUsage().catch(() => {});
}

// ── Animation Loop ────────────────────────────────────────────────────────

let rafId = 0;

function frame() {
  ctx.clearRect(0, 0, width, height);
  const now = performance.now();

  if (material.crackAlive) {
    material.updateAndDrawCrack(ctx, now);
    if (!material.crackAlive) {
      void dismiss();
      return;
    }
  } else if (active) {
    trail.draw(ctx, now);
    material.drawCursor(ctx, mouseX, mouseY);
  }

  rafId = requestAnimationFrame(frame);
}

function startLoop() {
  if (rafId === 0) rafId = requestAnimationFrame(frame);
}

function stopLoop() {
  if (rafId !== 0) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  ctx.clearRect(0, 0, width, height);
}

// ── Window lifecycle ────────────────────────────────────────────────────────

async function dismiss() {
  active = false;
  trail.clear();
  stopLoop();
  // 释放音频资源（隐藏时无需继续持有 AudioContext）
  closeAudioContext();
  try {
    await stopCursorTracking();
  } catch {}
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().hide();
  } catch {}
}

// ── IPC ───────────────────────────────────────────────────────────────────

let unlistenSpawn: (() => void) | null = null;
let unlistenDrop: (() => void) | null = null;
let unlistenCursor: (() => void) | null = null;
let unlistenPack: (() => void) | null = null;
let unlistenMaterial: (() => void) | null = null;

// 素材包列表缓存：初始化后保存，只在 pack-changed 事件时局部更新
let packsCache: import('../shared/material-packs').MaterialPack[] | null = null;

(async () => {
  // 预加载首个素材包（避免第一次触发时等待）
  void applyActivePack();
  void loadPreferences();

  unlistenSpawn = await onSpawnWhip((payload) => {
    // spawn 时只重新应用偏好（灵敏度等），不重复拉取素材包列表（已缓存）
    void loadPreferences();
    mouseX = payload.x ?? width / 2;
    mouseY = payload.y ?? height / 2;
    active = true;
    swing.reset(performance.now());
    trail.clear();
    trail.push(mouseX, mouseY, performance.now());
    startLoop();
  });

  unlistenCursor = await onCursorPos((pos) => {
    mouseX = pos.x;
    mouseY = pos.y;
    if (!active) return;
    const now = performance.now();
    trail.push(mouseX, mouseY, now);
    const swingRes = swing.push({ x: mouseX, y: mouseY, t: now }, swingParams);
    if (swingRes.cracked) {
      const vel = toWhipVel(swingRes.vx, swingRes.vy, swingRes.peakSpeed * 60);
      triggerCrack(mouseX, mouseY, vel);
    }
  });

  unlistenDrop = await onDropWhip(() => void dismiss());

  // 素材包切换：仅在包 id 变化时重新加载
  unlistenPack = await onPackChanged((id) => void applyActivePack(id));
  // 向后兼容
  unlistenMaterial = await onMaterialChanged((id) => void applyActiveMaterialLegacy(id));
})();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unlistenSpawn?.();
    unlistenDrop?.();
    unlistenCursor?.();
    unlistenPack?.();
    unlistenMaterial?.();
    closeAudioContext();
    packsCache = null;
  });
}
