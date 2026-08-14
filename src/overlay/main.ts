/**
 * Overlay window entry point.
 *
 * Interaction:
 *   1. Hotkey → overlay shows, mouse becomes effect icon
 *   2. Click anywhere → icon explodes into particles + sound + prompt
 *   3. Effect ends → overlay hides
 */
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  onSpawnWhip,
  onDropWhip,
  onSkinChanged,
  triggerMacro,
  incrementUsage,
  listSkins,
  getConfig,
} from '../shared/ipc';
import {
  type EffectKind,
  type EffectState,
  createEffect,
  updateEffect,
  drawEffect,
  drawCursorIcon,
} from './effects';

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

let effect: EffectState | null = null;
let activeEffectKind: EffectKind = 'rocket';
let soundEnabled = true;
let crackSounds: string[] = [];
let mouseX = width / 2;
let mouseY = height / 2;
let mouseInWindow = true;

// ── Skin ──────────────────────────────────────────────────────────────────

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
  } catch {}
}

// ── Sound ─────────────────────────────────────────────────────────────────

function playEffectSound() {
  if (!soundEnabled || crackSounds.length === 0) return;
  const file = crackSounds[Math.floor(Math.random() * crackSounds.length)];
  const audio = new Audio(convertFileSrc(`sounds/${file}`));
  audio.volume = 0.6;
  audio.play().catch(() => {});
}

// ── Effect ────────────────────────────────────────────────────────────────

function triggerEffect(x: number, y: number) {
  if (effect?.alive) return;
  effect = createEffect(activeEffectKind, x, y);
  playEffectSound();
  triggerMacro().catch((err) => console.error('[overlay] macro failed:', err));
  incrementUsage().catch(() => {});
}

// ── Animation Loop ────────────────────────────────────────────────────────

function frame() {
  requestAnimationFrame(frame);
  ctx.clearRect(0, 0, width, height);

  if (effect) {
    updateEffect(effect, performance.now());
    if (effect.alive) {
      drawEffect(ctx, effect);
    } else {
      effect = null;
      void hideOverlay();
    }
  } else if (mouseInWindow) {
    drawCursorIcon(ctx, activeEffectKind, mouseX, mouseY);
  }
}
requestAnimationFrame(frame);

// ── Window ────────────────────────────────────────────────────────────────

async function hideOverlay() {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().hide();
  } catch {}
}

// ── Input ─────────────────────────────────────────────────────────────────

canvas.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  mouseInWindow = true;
});
canvas.addEventListener('mouseleave', () => { mouseInWindow = false; });
canvas.addEventListener('mouseenter', () => { mouseInWindow = true; });
canvas.addEventListener('click', (e) => triggerEffect(e.clientX, e.clientY));
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') void hideOverlay(); });

// ── IPC ───────────────────────────────────────────────────────────────────

let unlistenSpawn: (() => void) | null = null;
let unlistenDrop: (() => void) | null = null;

(async () => {
  unlistenSpawn = await onSpawnWhip(() => {
    void applyActiveSkin();
    mouseInWindow = true;
  });
  unlistenDrop = await onDropWhip(() => { if (effect?.alive) effect.alive = false; });
  await onSkinChanged((id) => void applyActiveSkin(id));
})();

void loadPreferences();
void applyActiveSkin();

if (import.meta.hot) {
  import.meta.hot.dispose(() => { unlistenSpawn?.(); unlistenDrop?.(); });
}
