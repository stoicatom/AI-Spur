/**
 * Overlay window entry point.
 *
 * Owns the animation loop and the bridge between physics, rendering, and the
 * Rust side. Everything stateful lives here; physics.ts and renderer.ts stay
 * pure so they remain unit-testable.
 */
import {
  createWhipState,
  physicsStep,
  DEFAULT_PHYSICS,
  type PhysicsParams,
  type WhipState,
} from './physics';
import {
  drawWhip,
  clearDirtyRegion,
  DEFAULT_RENDER,
  DEFAULT_SKIN,
  type SkinConfig,
} from './renderer';
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
  wantsFullAnimation,
  QUICK_TUNING,
} from './quick_whip';
import { ParticleSystem, type ParticleType } from './particles';

const canvasEl = document.getElementById('whip-canvas') as HTMLCanvasElement | null;
if (!canvasEl) throw new Error('whip-canvas element not found');
const ctxOrNull = canvasEl.getContext('2d');
if (!ctxOrNull) throw new Error('2D context unavailable');

// Bind to non-nullable locals so closures below do not need repeated guards.
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

// ── Mutable runtime state ───────────────────────────────────────────────────

let physicsParams: PhysicsParams = { ...DEFAULT_PHYSICS };
let whip: WhipState | null = null;
let skin: SkinConfig = DEFAULT_SKIN;
let soundEnabled = true;
let crackSounds: string[] = [];
let mouseX = width / 2;
let mouseY = height / 2;
let prevMouseX = mouseX;
let prevMouseY = mouseY;
let animationMode: 'standard' | 'fast' | 'auto' = 'standard';
let usageCount = 0;
let autoSwitchThreshold = 20;
// When set, the current whip is a quick-mode one with a deadline.
let quickTimeoutAt: number | null = null;

// Particle system for visual effects
const particles = new ParticleSystem();

// FPS monitoring (dev only)
let lastFrameTime = performance.now();
let frameCount = 0;
setInterval(() => {
  const fps = frameCount;
  frameCount = 0;
  if (fps < 50) console.warn('[overlay] Low FPS:', fps);
}, 1000);

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

// Clicking dismisses the whip, matching v1's behaviour.
document.addEventListener('mousedown', () => {
  if (whip && !whip.dropping) whip = { ...whip, dropping: true };
});

// ── Skin loading ────────────────────────────────────────────────────────────

/** Pull the active skin's visuals so the renderer draws with its colors. */
async function applyActiveSkin(skinId?: string) {
  try {
    const [config, skins] = await Promise.all([
      skinId ? Promise.resolve(null) : getConfig(),
      listSkins(),
    ]);
    const targetId = skinId ?? config?.activeSkin ?? 'default';
    const match = skins.find((s) => s.id === targetId);
    if (match) {
      skin = {
        handleColor: match.visuals.handleColor,
        bodyGradient: match.visuals.bodyGradient,
        tipGlow: match.visuals.tipGlow,
        particleEffect: match.visuals.particleEffect,
        outlineColor: match.visuals.outlineColor,
        bgAlpha: match.visuals.bgAlpha,
      };
      crackSounds = match.sounds.crack;
    }
  } catch {
    // A failed skin lookup must not stop the whip from rendering; the default
    // skin is already applied.
  }
}

async function loadPreferences() {
  try {
    const config = await getConfig();
    soundEnabled = config.playSound;
    animationMode = config.animationMode;
    usageCount = config.usageCount ?? 0;
    autoSwitchThreshold = config.autoSwitchThreshold;
    // The crack threshold scales with user sensitivity (0.5x–2.0x of baseline).
    physicsParams = {
      ...DEFAULT_PHYSICS,
      crackSpeed: Math.round(DEFAULT_PHYSICS.crackSpeed * config.crackSensitivity),
    };
  } catch {
    // Keep the defaults if config is unreadable.
  }
}

function playCrackSound() {
  if (!soundEnabled || crackSounds.length === 0) {
    console.log('[overlay] Sound skipped:', { soundEnabled, crackSoundsCount: crackSounds.length });
    return;
  }
  const file = crackSounds[Math.floor(Math.random() * crackSounds.length)];
  // Sounds ship alongside the skin manifest; resolve relative to the app.
  const soundPath = `sounds/${file}`;
  console.log('[overlay] Playing sound:', soundPath);
  const audio = new Audio(soundPath);
  audio.play()
    .then(() => console.log('[overlay] Sound played successfully'))
    .catch((err) => {
    // Autoplay restrictions or a missing file: silence is acceptable here,
    // the visual crack already gives feedback.
    console.warn('[overlay] Sound play failed:', err);
  });
}

// ── Crack handling ──────────────────────────────────────────────────────────

async function handleCrack() {
  playCrackSound();
  try {
    // Rust picks the phrase from config so the choice stays server-side.
    await triggerMacro();
    await incrementUsage();
  } catch (err) {
    // Surfaced on the console only: the overlay has no chrome to show an error
    // in, and the settings window reports macro failures separately.
    console.error('[overlay] macro dispatch failed:', err);
  }
}

// ── Animation loop ──────────────────────────────────────────────────────────

function frame() {
  // Schedule the next frame unconditionally at the start of every tick so
  // no early-return or exception can ever kill the animation loop.
  requestAnimationFrame(frame);

  frameCount++;
  const now = performance.now();
  const frameDelta = now - lastFrameTime;
  lastFrameTime = now;

  // Log frame time spikes (potential stutter)
  if (frameDelta > 33) console.warn('[overlay] Frame spike:', frameDelta.toFixed(1), 'ms');

  if (whip) {
    clearDirtyRegion(ctx, whip.pts, DEFAULT_RENDER);
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  // Note: backdrop removed per user feedback (no mask layer needed).
  // On Windows, a 1-pixel anchor may still be needed for mouse events.

  if (whip) {
    const now = Date.now();
    const { nextState, crackTriggered } = physicsStep(
      whip,
      {
        mouseX,
        mouseY,
        prevMouseX,
        prevMouseY,
        now,
        screenWidth: width,
        screenHeight: height,
      },
      physicsParams
    );
    whip = nextState;
    prevMouseX = mouseX;
    prevMouseY = mouseY;

    if (crackTriggered) void handleCrack();

    drawWhip(ctx, whip, skin, DEFAULT_RENDER);

    // Update particle physics every frame (particles may be emitted at any time)
    particles.update(1 / 60);

    // Only draw if there are active particles (optimization)
    if (particles.activeCount > 0) {
      particles.draw(ctx);
    }

    // Quick mode: auto-crack once, then despawn when the deadline hits.
    if (quickTimeoutAt !== null) {
      if (!whip.dropping && now >= quickTimeoutAt - QUICK_TUNING.autoCrackAtMs) {
        whip = { ...whip, dropping: true };
        void handleCrack();
      }
      if (now >= quickTimeoutAt) {
        whip = null;
        quickTimeoutAt = null;
        void hideOverlay();
      }
      // Note: no `return` here — RAF is already scheduled at the top.
    } else {
      // Full mode: despawn once every point has fallen past the bottom edge.
      if (whip.dropping && whip.pts.every((p) => p.y > height + 60)) {
        whip = null;
        void hideOverlay();
      }
    }
  }
}

// Start the animation loop once when the module loads
requestAnimationFrame(frame);

// ── Window visibility ───────────────────────────────────────────────────────

async function hideOverlay() {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().hide();
  } catch {
    // In a browser-only dev context there is no window to hide.
  }
}

// ── IPC wiring ──────────────────────────────────────────────────────────────

// Store the unlisten functions to clean up on module unload
let unlistenSpawnWhip: (() => void) | null = null;
let unlistenDropWhip: (() => void) | null = null;

(async () => {
  unlistenSpawnWhip = await onSpawnWhip((payload) => {
    void applyActiveSkin();

    // payload is the JSON the Rust side emits: { forceFull }.
    const forceFull = Boolean((payload as { forceFull?: boolean } | null)?.forceFull);

    const full = wantsFullAnimation(
      animationMode,
      usageCount,
      autoSwitchThreshold,
      forceFull
    );

    if (full) {
      whip = createWhipState(mouseX, mouseY, physicsParams);
      quickTimeoutAt = null;

      // Emit particles at whip tip if effect is enabled
      if (skin.particleEffect !== 'none') {
        const tipIndex = whip.pts.length - 1;
        const tipX = whip.pts[tipIndex].x;
        const tipY = whip.pts[tipIndex].y;
        particles.emit(tipX, tipY, skin.particleEffect as ParticleType, 10, skin.handleColor);
      }
    } else {
      // Corner mini-whip: smaller arc, automatic crack and despawn.
      whip = createWhipState(mouseX, mouseY, physicsParams, {
        arcWidth: QUICK_TUNING.arcWidth,
        arcHeight: QUICK_TUNING.arcHeight,
        now: Date.now(),
      });
      quickTimeoutAt = Date.now() + QUICK_TUNING.lifetimeMs;

      // Emit fewer particles for quick mode
      if (skin.particleEffect !== 'none') {
        const tipIndex = whip.pts.length - 1;
        const tipX = whip.pts[tipIndex].x;
        const tipY = whip.pts[tipIndex].y;
        particles.emit(tipX, tipY, skin.particleEffect as ParticleType, 5, skin.handleColor);
      }
    }

    prevMouseX = mouseX;
    prevMouseY = mouseY;
  });

  unlistenDropWhip = await onDropWhip(() => {
    if (whip && !whip.dropping) whip = { ...whip, dropping: true };
  });

  await onSkinChanged((skinId) => {
    void applyActiveSkin(skinId);
  });
})();

void loadPreferences();
void applyActiveSkin();

// ── Hot Module Replacement cleanup ──────────────────────────────────────────

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unlistenSpawnWhip?.();
    unlistenDropWhip?.();
  });
}
