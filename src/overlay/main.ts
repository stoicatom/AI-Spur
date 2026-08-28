/** Overlay window entry point: cursor tracking, crack physics and effects. */
import {
  onSpawnWhip,
  onDropWhip,
  onCursorPos,
  onPackChanged,
  onMaterialChanged,
  triggerMacro,
  openInputPermissions,
  incrementUsage,
  stopCursorTracking,
  getConfig,
  onMacroFailed,
} from '../shared/ipc';
import { ImageMaterial, MaterialTrail } from './material-visual';
import { SwingDetector, DEFAULT_SWING, type SwingParams } from './swing';
import { toWhipVel, type WhipVel } from './particles';
import { playMaterialSound, closeAudioContext, releaseAudioContextWhenIdle } from './audio-engine';
import { UnlistenRegistry } from './unlisten-registry';
import { mountOverlayCanvases } from './overlay-canvases';
import { effectDurationFor } from './effect-timings';
import { setWhipCursorHidden } from './cursor-visibility';
import { OverlayWindowController } from './overlay-window';
import { OverlayRenderLoop } from './overlay-render-loop';
import { MacroFailurePanel } from './macro-failure-panel';
import { ActivePackLoader } from './active-pack-loader';

const canvases = mountOverlayCanvases();
const { ctx, three } = canvases;
const width = canvases.width;
const height = canvases.height;

const material = new ImageMaterial();
const trail = new MaterialTrail();
const swing = new SwingDetector(performance.now());
/** 素材包选取 / 加载（内含列表缓存与选包竞态处理）。 */
const packs = new ActivePackLoader(material, trail);
let swingParams: SwingParams = { ...DEFAULT_SWING };

let soundEnabled = true;
let mouseX = width() / 2;
let mouseY = height() / 2;
let active = false; // 覆盖层是否处于活跃状态

/** 单例：窗口几何全部经由它，dismiss 与 dispose 不会互相打架。 */
const win = new OverlayWindowController();

const panel = new MacroFailurePanel({
  triggerMacro,
  openInputPermissions,
  onRetryDismiss: () => dismiss(),
});

const loop = new OverlayRenderLoop({
  ctx,
  three,
  material,
  trail,
  width,
  height,
  mouseX: () => mouseX,
  mouseY: () => mouseY,
  isActive: () => active,
  onDismiss: () => dismiss(),
});

/**
 * 收起覆盖层。四层防御里的第 1、2、3 层都汇聚在这里，顺序不可调换：
 *  1. 无论窗口最终是否隐藏成功，光标作用域一定先摘掉 —— 这是保底；
 *  2. 宏失败时不留全屏窗口，而是缩成只包住恢复面板的小窗；
 *  3. 窗口操作全部走 OverlayWindowController：失败重试一次并记录，绝不静默。
 */
async function dismiss(): Promise<void> {
  active = false;
  trail.clear();
  loop.stop();
  three.cancel();
  material.cancelCrack();
  // 视觉可以先隐藏；声音图表会在自身尾音结束后释放上下文。
  releaseAudioContextWhenIdle();
  try {
    await stopCursorTracking();
  } catch (error) {
    console.error('[overlay] stop cursor tracking failed:', error);
  }

  // 防线 1（治本）：窗口即便留屏，指针也一定回到系统手里。
  setWhipCursorHidden(false);

  if (panel.isVisible) {
    // 防线 2：恢复面板要可见，但绝不为此留一个全屏透明窗口。
    if (await win.shrinkToRecoveryPanel()) return;
    // 缩窗失败：宁可丢掉面板，也不把全屏窗口留在屏上。
    console.error('[overlay] recovery panel shrink failed, hiding overlay instead');
  }
  // 防线 3：hide 内部会先还原几何、失败重试一次并记录日志。
  await win.hide();
}

/**
 * 宏失败事件可能在特效播完、窗口已隐藏之后才到。此时要把恢复面板重新
 * 呈现出来 —— 但只以「缩窗 + 可见光标」的形态，绝不还原成全屏透明窗口。
 */
async function presentRecoveryPanel(): Promise<void> {
  setWhipCursorHidden(false);
  // 先定几何再 show：避免全屏透明窗口闪现一帧后才缩回去。
  if (!(await win.shrinkToRecoveryPanel())) {
    console.error('[overlay] cannot shrink for recovery panel, leaving overlay hidden');
    panel.hide();
    await win.hide();
    return;
  }
  await win.show();
}

async function loadPreferences() {
  try {
    const config = await getConfig();
    soundEnabled = config.playSound;
    swingParams = { ...DEFAULT_SWING, sensitivity: config.crackSensitivity };
  } catch {}
}

function playEffectSound(x: number, vel: WhipVel) {
  const activePack = packs.activePack;
  if (!soundEnabled || !activePack) return;
  playMaterialSound(activePack.id, activePack.effect.preset, activePack.sound, {
    x,
    viewportWidth: width(),
    velocityX: vel.vx,
    velocitySpeed: vel.speed,
  });
}
function triggerCrack(x: number, y: number, vel: WhipVel) {
  if (material.crackAlive || !active) return;
  panel.hide();
  const attemptId = panel.beginAttempt();
  // 判定瞬间即发键：终端保持焦点，Esc 早发早生效。
  triggerMacro(undefined, attemptId).catch((err) => {
    console.error('[overlay] macro failed:', err);
    panel.showInvokeFailure(err, attemptId);
  });
  active = false;
  playEffectSound(x, vel);
  material.startCrack(x, y, vel);
  const activePack = packs.activePack;
  if (activePack) {
    three.start({
      packId: activePack.id,
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
  // 看门狗：无论渲染状态死在哪，超时强制收起。
  loop.armWatchdog(effectDurationFor(packs.activePack?.effect.preset ?? 'whip-crack'));
  incrementUsage().catch(() => {});
}

const subscriptions = new UnlistenRegistry();

// 预加载首个素材包（避免第一次触发时等待）
void packs.apply();
void loadPreferences();
subscriptions.track(onSpawnWhip((payload) => {
  // spawn 时只重新应用偏好（灵敏度等），不重复拉取素材包列表（已缓存）
  void loadPreferences();
  mouseX = payload.x ?? width() / 2;
  mouseY = payload.y ?? height() / 2;
  active = true;
  swing.reset(performance.now());
  trail.clear();
  trail.push(mouseX, mouseY, performance.now());
  // 光标先隐藏：全屏透明窗口此刻就是指针本体。
  setWhipCursorHidden(true);
  loop.start();
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

subscriptions.track(onDropWhip(() => {
  panel.hide();
  void dismiss();
}), 'drop-whip');

subscriptions.track(onMacroFailed((failure) => {
  if (!panel.show(failure, 'event')) return;
  // 事件晚于特效结束到达时窗口已隐藏，需要重新呈现（缩窗形态）。
  void presentRecoveryPanel();
}), 'macro-failed');

// 素材包切换：仅在包 id 变化时重新加载
subscriptions.track(onPackChanged((id) => void packs.apply(id)), 'pack-changed');
// 向后兼容
subscriptions.track(onMaterialChanged((id) => void packs.applyLegacy(id)), 'material-changed');

let overlayDisposed = false;
function disposeOverlay(): void {
  if (overlayDisposed) return;
  overlayDisposed = true;
  canvases.stop();
  window.removeEventListener('pagehide', disposeOverlay);
  loop.stop();
  subscriptions.dispose();
  closeAudioContext();
  three.dispose();
  material.dispose();
  packs.clearCache();
  // 页面卸载是最后一次执行机会：光标作用域必须在这里摘掉。
  setWhipCursorHidden(false);
  void stopCursorTracking().catch(() => {});
}

window.addEventListener('pagehide', disposeOverlay, { once: true });

if (import.meta.hot) {
  import.meta.hot.dispose(disposeOverlay);
}
