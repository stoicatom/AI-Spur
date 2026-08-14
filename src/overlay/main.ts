/**
 * Overlay window entry point.
 *
 * New interaction model:
 *   1. Hotkey → overlay appears (full-screen transparent)
 *   2. Click anywhere → plays visual effect + sends prompt
 *   3. Effect completes → overlay hides
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
  createEffect,
  updateEffect,
  drawEffect,
} from './effects';

// ── Canvas Setup ──────────────────────────────────────────────────────────

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

// ── Runtime State ─────────────────────────────────────────────────────────

let effect: EffectState | null = null;
let activeEffectKind: EffectKind = 'rocket';
let soundEnabled = true;
let crackSounds: string[] = [];

// ── Skin Loading ──────────────────────────────────────────────────────────

async function applyActiveSkin(skinId?: string) {
  try {
    const [config, skins] = await Promise.all([
      skinId ? Promise.resolve(null) : getConfig(),
      listSkins(),
    ]);
    const targetId = skinId ?? config?.activeSkin ?? 'default';
    const match = skins.find((s) => s.id === targetId);
    if (match) {
      crackSounds = match.sounds.crack;
    }
  } catch {
    // Use defaults
  }
}

async function loadPreferences() {
  try {
    const config = await getConfig();
    soundEnabled = config.playSound;
  } catch {
    // Use defaults
  }
}

// ── Sound ─────────────────────────────────────────────────────────────────

function playCrackSound() {
  if (!soundEnabled || crackSounds.length === 0) return;
  const file = crackSounds[Math.floor(Math.random() * crackSounds.length)];
  const soundPath = convertFileSrc(`sounds/${file}`);
  const audio = new Audio(soundPath);
  audio.volume = 0.6;
  audio.play().catch(() => {});
}

// ── Effect Trigger ────────────────────────────────────────────────────────

function triggerEffect(clickX: number, clickY: number) {
  if (effect?.alive) return; // Don't stack effects

  effect = createEffect(activeEffectKind, clickX, clickY);
  playCrackSound();

  // Fire-and-forget: send prompt to Claude
  triggerMacro().catch((err) => {
    console.error('[overlay] macro dispatch failed:', err);
  });
  incrementUsage().catch(() => {});
}

// ── Animation Loop ────────────────────────────────────────────────────────

function frame() {
  requestAnimationFrame(frame);

  ctx.clearRect(0, 0, width, height);

  if (effect) {
    const now = performance.now();
    updateEffect(effect, now);

    if (effect.alive) {
      drawEffect(ctx, effect);
    } else {
      // Effect finished — hide overlay
      effect = null;
      void hideOverlay();
    }
  }
}

requestAnimationFrame(frame);

// ── Window Visibility ─────────────────────────────────────────────────────

async function hideOverlay() {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().hide();
  } catch {
    // Browser dev context
  }
}

// ── Input Handling ────────────────────────────────────────────────────────

// Click triggers the effect
canvas.addEventListener('click', (e) => {
  triggerEffect(e.clientX, e.clientY);
});

// ── IPC Wiring ────────────────────────────────────────────────────────────

let unlistenSpawnWhip: (() => void) | null = null;
let unlistenDropWhip: (() => void) | null = null;

(async () => {
  unlistenSpawnWhip = await onSpawnWhip(() => {
    void applyActiveSkin();
    // Overlay is shown by Rust; user clicks to trigger effect
  });

  unlistenDropWhip = await onDropWhip(() => {
    // Force-finish current effect on drop
    if (effect?.alive) effect.alive = false;
  });

  await onSkinChanged((skinId) => {
    void applyActiveSkin(skinId);
  });
})();

void loadPreferences();
void applyActiveSkin();

// ── Hot Module Replacement ────────────────────────────────────────────────

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unlistenSpawnWhip?.();
    unlistenDropWhip?.();
  });
}
