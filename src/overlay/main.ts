/** Overlay window entry point: cursor tracking, crack physics and effects. */
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
  packListNeedsRefresh,
  resolveMaterial,
  resolvePackMaterial,
} from './material-visual';
import { SwingDetector, DEFAULT_SWING, type SwingParams } from './swing';
import { toWhipVel, type WhipVel } from './particles';
import { playMaterialSound, closeAudioContext, releaseAudioContextWhenIdle } from './audio-engine';
import type { MaterialPack } from '../shared/material-packs';
import { ThreeEffectHost } from './three-effect-host';
import { UnlistenRegistry } from './unlisten-registry';
import { resizeCanvas2D } from './canvas-pixel-budget';

const canvasEl = document.getElementById('whip-canvas') as HTMLCanvasElement | null;
if (!canvasEl) throw new Error('whip-canvas element not found');
const ctxOrNull = canvasEl.getContext('2d');
if (!ctxOrNull) throw new Error('2D context unavailable');
const canvas: HTMLCanvasElement = canvasEl;
const ctx: CanvasRenderingContext2D = ctxOrNull;
const webglCanvas = document.getElementById('whip-webgl') as HTMLCanvasElement | null;
const three = new ThreeEffectHost(webglCanvas);

let width = 0;
let height = 0;

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  resizeCanvas2D(canvas, ctx, width, height, window.devicePixelRatio || 1);
  three.resize(width, height);
}
resize();
window.addEventListener('resize', resize);
three.ensure();

const material = new ImageMaterial();
const trail = new MaterialTrail();
const swing = new SwingDetector(performance.now());
let swingParams: SwingParams = { ...DEFAULT_SWING };

let soundEnabled = true;
let activePack: MaterialPack | null = null;
let packSelectionRevision = 0;
let mouseX = width / 2;
let mouseY = height / 2;
let active = false; // 覆盖层是否处于活跃状态

async function applyActivePack(packId?: string) {
  const revision = ++packSelectionRevision;
  try {
    let packs = packsCache;
    if (packListNeedsRefresh(packs, packId)) {
      const refreshed = await listPacks();
      if (revision !== packSelectionRevision) return;
      packsCache = refreshed;
      packs = refreshed;
    }
    if (!packs) return;
    const config = packId ? null : await getConfig();
    if (revision !== packSelectionRevision) return;
    const targetId = packId ?? config?.activePackId ?? 'rocket';
    const pack = packs.find((p) => p.id === targetId) ?? packs.find((p) => p.id === 'rocket');
    if (!pack) return;
    activePack = pack;
    const resolved = resolvePackMaterial(targetId, packs);
    material.loadPack(resolved.url, pack.effect.preset, pack.effect.params, pack.palette.particleHue);
    trail.setHue(pack.palette.particleHue);
  } catch {
    if (revision === packSelectionRevision) await applyActiveMaterialLegacy(packId);
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

function playEffectSound(x: number, vel: WhipVel) {
  if (!soundEnabled) return;
  if (!activePack) return;
  playMaterialSound(activePack.id, activePack.effect.preset, activePack.sound, {
    x,
    viewportWidth: width,
    velocityX: vel.vx,
    velocitySpeed: vel.speed,
  });
}
function triggerCrack(x: number, y: number, vel: WhipVel) {
  if (material.crackAlive || !active) return;
  // 判定瞬间即发键：终端保持焦点，Ctrl+C 早发早生效。
  triggerMacro().catch((err) => console.error('[overlay] macro failed:', err));
  active = false;
  playEffectSound(x, vel);
  material.startCrack(x, y, vel);
  if (activePack) {
    three.start({
      url: activePack.dataUri,
      preset: activePack.effect.preset,
      params: activePack.effect.params,
      hue: activePack.palette.particleHue,
      x,
      y,
      vel,
    });
  }
  trail.clear();
  incrementUsage().catch(() => {});
}
let rafId = 0;

function frame() {
  ctx.clearRect(0, 0, width, height);
  const now = performance.now();

  if (material.crackAlive) {
    let ended = false;
    if (three.isAlive) ended = three.update(now);
    if (!three.isAlive) material.updateAndDrawCrack(ctx, now);
    if (ended || (!three.isAlive && !material.crackAlive)) {
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

async function dismiss() {
  active = false;
  trail.clear();
  stopLoop();
  three.cancel();
  material.cancelCrack();
  // 视觉可以先隐藏；声音图表会在自身尾音结束后释放上下文。
  releaseAudioContextWhenIdle();
  try {
    await stopCursorTracking();
  } catch {}
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().hide();
  } catch {}
}

const subscriptions = new UnlistenRegistry();
// 素材包列表缓存：初始化后保存，只在 pack-changed 事件时局部更新
let packsCache: MaterialPack[] | null = null;

// 预加载首个素材包（避免第一次触发时等待）
void applyActivePack();
void loadPreferences();
subscriptions.track(onSpawnWhip((payload) => {
  // spawn 时只重新应用偏好（灵敏度等），不重复拉取素材包列表（已缓存）
  void loadPreferences();
  mouseX = payload.x ?? width / 2;
  mouseY = payload.y ?? height / 2;
  active = true;
  swing.reset(performance.now());
  trail.clear();
  trail.push(mouseX, mouseY, performance.now());
  startLoop();
}), 'spawn-whip');
subscriptions.track(onCursorPos((pos) => {
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
}), 'cursor-pos');

subscriptions.track(onDropWhip(() => void dismiss()), 'drop-whip');

// 素材包切换：仅在包 id 变化时重新加载
subscriptions.track(onPackChanged((id) => void applyActivePack(id)), 'pack-changed');
// 向后兼容
subscriptions.track(onMaterialChanged((id) => void applyActiveMaterialLegacy(id)), 'material-changed');

let overlayDisposed = false;
function disposeOverlay(): void {
  if (overlayDisposed) return;
  overlayDisposed = true;
  window.removeEventListener('resize', resize);
  window.removeEventListener('pagehide', disposeOverlay);
  stopLoop();
  subscriptions.dispose();
  closeAudioContext();
  three.dispose();
  material.dispose();
  packsCache = null;
  void stopCursorTracking().catch(() => {});
}

window.addEventListener('pagehide', disposeOverlay, { once: true });

if (import.meta.hot) {
  import.meta.hot.dispose(disposeOverlay);
}
