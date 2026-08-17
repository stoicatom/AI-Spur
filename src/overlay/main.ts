/**
 * Overlay window entry point.
 *
 * 交互（甩动主触发 + 点击兵底 + 非激活焦点）：
 *   1. 热键 / 托盘 → overlay 显示（不夺焦点），素材立即吸附到光标
 *   2. Rust 以 ~60fps 推送 `cursor-pos`，素材跟随光标 + 拖尾
 *   3. 快速甩动达 snap 阈值（或点击兵底）→ crack
 *   4. crack 瞬间即向终端发 Ctrl+C + 提示词（终端全程保持焦点）
 *   5. 播放素材专属爆裂动画 → 渐隐 → 隐藏覆盖层 + 停止光标推送
 *   Esc：无副作用取消。
 */
import {
  onSpawnWhip,
  onDropWhip,
  onCursorPos,
  onSkinChanged,
  onMaterialChanged,
  triggerMacro,
  incrementUsage,
  stopCursorTracking,
  listSkins,
  listMaterials,
  getConfig,
  listSoundPresets,
  readSoundData,
  type SoundPreset,
} from '../shared/ipc';
import { ImageMaterial, MaterialTrail, resolveMaterial } from './material-visual';
import { SwingDetector, DEFAULT_SWING, type SwingParams } from './swing';
import { toWhipVel, type WhipVel } from './particles';

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
let crackSounds: string[] = [];
let crackSoundId = 'default';

let mouseX = width / 2;
let mouseY = height / 2;
let active = false; // 覆盖层是否处于活跃（已 spawn、未收尾）

// ── Skin / preferences ──────────────────────────────────────────────────────

async function applyActiveSkin(skinId?: string) {
  try {
    const [config, skins] = await Promise.all([
      skinId ? Promise.resolve(null) : getConfig(),
      listSkins(),
    ]);
    const targetId = skinId ?? config?.activeSkin ?? 'default';
    const match = skins.find((s) => s.id === targetId);
    if (match) crackSounds = match.sounds.crack;
  } catch {}
}

async function loadPreferences() {
  try {
    const config = await getConfig();
    soundEnabled = config.playSound;
    crackSoundId = config.crackSoundId ?? 'default';
    swingParams = { ...DEFAULT_SWING, sensitivity: config.crackSensitivity };
  } catch {}
}

// ── Material ────────────────────────────────────────────────────────────────

async function applyActiveMaterial(materialId?: string) {
  try {
    const [config, materials] = await Promise.all([
      materialId ? Promise.resolve(null) : getConfig(),
      listMaterials(),
    ]);
    const targetId = materialId ?? config?.activeMaterialId ?? 'rocket';
    const resolved = resolveMaterial(targetId, materials);
    material.load(resolved.url, resolved.id);
    trail.setHue(material.hue);
  } catch {}
}

// ── Sound ─────────────────────────────────────────────────────────────────

async function playEffectSound() {
  if (!soundEnabled) return;

  // Resolve the file list for the active preset. "default" follows the active
  // skin's crack sounds (played from the sounds root); a named preset uses its
  // own files.
  let presetId = crackSoundId;
  let files: string[] = [];

  if (crackSoundId === 'default') {
    files = crackSounds;
  } else {
    try {
      const presets: SoundPreset[] = await listSoundPresets();
      const match = presets.find((p: SoundPreset) => p.id === crackSoundId);
      if (match && match.files.length > 0) files = match.files;
    } catch {}
  }

  if (files.length === 0) return;
  const file = files[Math.floor(Math.random() * files.length)];
  try {
    // Read via Rust as a data: URI — the asset protocol can't reach the sound
    // files in dev (they live in the source tree, outside the asset scope).
    const dataUri = await readSoundData(presetId, file);
    const audio = new Audio(dataUri);
    audio.volume = 0.6;
    audio.play().catch(() => {});
  } catch {}
}

// ── Crack ─────────────────────────────────────────────────────────────────

function triggerCrack(x: number, y: number, vel: WhipVel) {
  if (material.crackAlive || !active) return;
  // 判定瞬间即发键：终端仍是聚焦窗口（overlay 非激活），早发早生效。
  triggerMacro().catch((err) => console.error('[overlay] macro failed:', err));
  active = false; // 锁定，避免爆裂动画期间二次触发
  playEffectSound();
  material.startCrack(x, y, vel);
  trail.clear();
  incrementUsage().catch(() => {});
}

// ── Animation Loop ────────────────────────────────────────────────────────

// The overlay window is created once and reused (hidden between activations),
// so the render loop must NOT run while hidden — a permanent rAF keeps the GPU
// compositor busy and the page from ever idling. `rafId` tracks the live loop;
// it runs only between spawn and dismiss.
let rafId = 0;

function frame() {
  ctx.clearRect(0, 0, width, height);
  const now = performance.now();

  if (material.crackAlive) {
    material.updateAndDrawCrack(ctx, now);
    if (!material.crackAlive) {
      void dismiss();
      return; // dismiss stops the loop; don't schedule another frame
    }
  } else if (active) {
    trail.draw(ctx, now);
    material.drawCursor(ctx, mouseX, mouseY);
  }

  rafId = requestAnimationFrame(frame);
}

/** Start the render loop if it is not already running. */
function startLoop() {
  if (rafId === 0) rafId = requestAnimationFrame(frame);
}

/** Stop the render loop and clear the canvas one last time. */
function stopLoop() {
  if (rafId !== 0) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  ctx.clearRect(0, 0, width, height);
}

// ── Window lifecycle ────────────────────────────────────────────────────────

/** 收尾：停止渲染循环 + 光标推送 + 隐藏窗口 + 释放拖尾。 */
async function dismiss() {
  active = false;
  trail.clear();
  stopLoop();
  try {
    await stopCursorTracking();
  } catch {}
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().hide();
  } catch {}
}

// ── Input ─────────────────────────────────────────────────────────────────

// 唯一的直接交互是「甩动」：素材跟随鼠标（Rust 推送坐标），快速甩动即触发。
// 覆盖层是非激活窗口（不夺焦点，终端保持键盘焦点以接收 Ctrl+C），因此这里
// 不监听 click / keydown —— 点击会夺焦点破坏发键，键盘事件也收不到。
// 收起由「再按热键」经 Rust 发 drop-whip 完成（见下方 onDropWhip）。

// ── IPC ───────────────────────────────────────────────────────────────────

let unlistenSpawn: (() => void) | null = null;
let unlistenDrop: (() => void) | null = null;
let unlistenCursor: (() => void) | null = null;

(async () => {
  unlistenSpawn = await onSpawnWhip((payload) => {
    void applyActiveSkin();
    void applyActiveMaterial();
    void loadPreferences();
    // 立即把素材落到真实光标处（缺失坐标时回退窗口中心）。
    mouseX = payload.x ?? width / 2;
    mouseY = payload.y ?? height / 2;
    active = true;
    swing.reset(performance.now());
    trail.clear();
    trail.push(mouseX, mouseY, performance.now());
    startLoop(); // 覆盖层显示时才启动渲染循环
  });

  unlistenCursor = await onCursorPos((pos) => {
    mouseX = pos.x;
    mouseY = pos.y;
    if (!active) return;
    const now = performance.now();
    trail.push(mouseX, mouseY, now);
    // 甩动检测：达 snap 阈值即 crack。
    const swingRes = swing.push({ x: mouseX, y: mouseY, t: now }, swingParams);
    if (swingRes.cracked) {
      const vel = toWhipVel(swingRes.vx, swingRes.vy, swingRes.peakSpeed * 60); // px/ms→px/f 放大
      triggerCrack(mouseX, mouseY, vel);
    }
  });

  unlistenDrop = await onDropWhip(() => void dismiss());
  await onSkinChanged((id) => void applyActiveSkin(id));
  await onMaterialChanged((id) => void applyActiveMaterial(id));
})();

void loadPreferences();
void applyActiveSkin();
void applyActiveMaterial();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unlistenSpawn?.();
    unlistenDrop?.();
    unlistenCursor?.();
  });
}
