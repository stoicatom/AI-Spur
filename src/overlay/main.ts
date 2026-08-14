/**
 * Overlay window entry point.
 *
 * Interaction model:
 *   1. Hotkey → overlay appears (full-screen transparent), cursor becomes effect icon
 *   2. User moves mouse → icon follows (custom cursor drawn on canvas)
 *   3. Click → icon explodes into visual effect + sound + sends prompt
 *   4. Effect completes → overlay hides
 *
 * Cursor resilience: mouseX/mouseY persist across mouseleave/mouseenter,
 * so the icon reappears at the last known position when the cursor returns.
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

// Mouse tracking — persists across mouseleave/mouseenter
// so the cursor icon reappears at the last known position when returning.
let mouseX = -100;
let mouseY = -100;
let mouseInWindow = false;

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
  if (effect?.alive) return;

  effect = createEffect(activeEffectKind, clickX, clickY);
  playCrackSound();

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
      effect = null;
      void hideOverlay();
    }
  } else if (mouseInWindow) {
    // Draw cursor icon at mouse position (before click)
    drawCursorIcon(ctx, activeEffectKind, mouseX, mouseY);
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

canvas.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  mouseInWindow = true;
});

// When cursor leaves the overlay window, stop drawing but preserve position.
// When it returns (mouseenter), resume drawing at the saved position.
canvas.addEventListener('mouseleave', () => {
  mouseInWindow = false;
});

canvas.addEventListener('mouseenter', () => {
  mouseInWindow = true;
});

canvas.addEventListener('click', (e) => {
  triggerEffect(e.clientX, e.clientY);
});

// ESC dismisses overlay without triggering effect
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    void hideOverlay();
  }
});

// ── IPC Wiring ────────────────────────────────────────────────────────────

let unlistenSpawnWhip: (() => void) | null = null;
let unlistenDropWhip: (() => void) | null = null;

(async () => {
  unlistenSpawnWhip = await onSpawnWhip(() => {
    void applyActiveSkin();
    // Overlay just appeared — assume cursor is already in window.
    // The next mousemove will confirm the position, but we need to
    // start drawing immediately so the user sees the cursor icon.
    mouseInWindow = true;
  });

  unlistenDropWhip = await onDropWhip(() => {
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
