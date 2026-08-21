import { resolveEffect, type EffectPreset } from './effects';
import { drawCanvasDownpour } from './canvas-downpour';
import { drawCrackLighting } from './material-crack-lighting';
import { advanceAndDrawParticles } from './material-particle-canvas';
import { crackStyle, type CrackStyle } from './material-styles';
import { DEFAULT_VEL, drawImpact, type Particle, type WhipVel } from './particles';
import { renderContractFor } from './three-effect-contract';
import { DEFAULT_EFFECT_DURATION_MS, effectDurationFor } from './effect-timings';
import type { EffectPresetId } from '../shared/material-packs';

const CURSOR_MAX_PX = 96;

function fitSize(img: HTMLImageElement, max: number): { w: number; h: number } {
  const imageWidth = img.naturalWidth || max;
  const imageHeight = img.naturalHeight || max;
  const scale = max / Math.max(imageWidth, imageHeight);
  return { w: imageWidth * scale, h: imageHeight * scale };
}

/** 图片素材精灵及其 Canvas 2D 回退爆裂动画。 */
export class ImageMaterial {
  private img = new Image();
  private pendingImage: HTMLImageElement | null = null;
  private ready = false;
  private disposed = false;
  private url = '';
  private fitW = 0;
  private fitH = 0;
  private crackT0 = 0;
  private crackDurationMs = DEFAULT_EFFECT_DURATION_MS;
  private lastCrackUpdate = 0;
  private crackX = 0;
  private crackY = 0;
  private crackOn = false;
  private crackVel: WhipVel = DEFAULT_VEL;
  private effect: EffectPreset = resolveEffect('jet');
  private effectParams: Record<string, number> = {};
  private presetId: EffectPresetId = 'jet';
  private style: CrackStyle = crackStyle('rocket');
  private useLegacyStyle = false;
  private particles: Particle[] = [];
  private _particleHue = 24;

  /** 预加载旧版图片素材（仅在 URL 变化时触发一次解码）。 */
  load(url: string, id: string): void {
    this.style = crackStyle(id);
    this.useLegacyStyle = true;
    this.crackDurationMs = DEFAULT_EFFECT_DURATION_MS;
    this._particleHue = this.style.hue;
    this.loadImage(url);
  }

  /** 从 v3 素材包加载图标并绑定特效预设。 */
  loadPack(
    url: string,
    presetId: string,
    params: Record<string, number>,
    particleHue: number,
  ): void {
    this.effect = resolveEffect(presetId);
    this.presetId = this.effect.id;
    this.crackDurationMs = effectDurationFor(this.presetId);
    this.effectParams = params;
    this.useLegacyStyle = false;
    this._particleHue = particleHue;
    this.loadImage(url);
  }

  private loadImage(url: string): void {
    if (this.disposed || url === this.url) return;
    this.url = url;
    this.ready = false;
    this.releasePendingImage();
    if (!url) {
      this.releaseImage(this.img);
      return;
    }

    const image = new Image();
    this.pendingImage = image;
    image.onload = () => {
      if (this.disposed || this.url !== url || this.pendingImage !== image) return;
      this.pendingImage = null;
      image.onload = null;
      image.onerror = null;
      const previous = this.img;
      this.img = image;
      this.ready = true;
      const size = fitSize(image, CURSOR_MAX_PX);
      this.fitW = size.w;
      this.fitH = size.h;
      if (previous !== image) this.releaseImage(previous);
    };
    image.onerror = () => {
      if (this.pendingImage !== image) return;
      this.pendingImage = null;
      this.releaseImage(image);
      if (this.url === url) this.ready = false;
    };
    image.src = url;
  }

  private releasePendingImage(): void {
    const pending = this.pendingImage;
    if (!pending) return;
    this.pendingImage = null;
    this.releaseImage(pending);
  }

  private releaseImage(image: HTMLImageElement): void {
    image.onload = null;
    image.onerror = null;
    image.src = '';
  }

  /** 拖尾主色相。 */
  get hue(): number {
    return this.useLegacyStyle ? this.style.hue : this._particleHue;
  }

  get isReady(): boolean {
    return this.ready;
  }

  get crackAlive(): boolean {
    return this.crackOn;
  }

  /** 光标跟随：居中绘制在 (x, y)，保持宽高比。 */
  drawCursor(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    if (!this.ready) return;
    const time = performance.now() * 0.004;
    const bob = 1 + Math.sin(time * 1.7) * 0.035;
    const tilt = Math.sin(time * 1.15) * 0.12;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.scale(bob, 1 / bob);
    ctx.shadowColor = `hsl(${this.hue}, 100%, 62%)`;
    ctx.shadowBlur = 24;
    ctx.globalAlpha = 0.3;
    ctx.drawImage(
      this.img,
      -this.fitW * 0.58,
      -this.fitH * 0.42,
      this.fitW * 1.16,
      this.fitH * 1.16,
    );
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.drawImage(this.img, -this.fitW / 2, -this.fitH / 2, this.fitW, this.fitH);
    ctx.restore();
  }

  /** 触发该素材的专属爆裂动画。 */
  startCrack(x: number, y: number, vel: WhipVel = DEFAULT_VEL): void {
    this.crackOn = true;
    this.crackT0 = performance.now();
    this.lastCrackUpdate = this.crackT0;
    this.crackX = x;
    this.crackY = y;
    this.crackVel = vel;
    this.particles = !this.useLegacyStyle && this.presetId === 'downpour'
      ? []
      : this.useLegacyStyle
      ? this.style.emit(x, y, vel)
      : this.effect.emit(x, y, vel, this.effectParams);
  }

  /** 清理被 3D 主路径或窗口隐藏流程提前终止的 2D 回退状态。 */
  cancelCrack(): void {
    this.crackOn = false;
    this.particles = [];
  }

  /** 释放待解码请求、当前图片及回退动画状态。 */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.url = '';
    this.ready = false;
    this.releasePendingImage();
    this.releaseImage(this.img);
    this.cancelCrack();
  }

  /** 推进并绘制爆裂动画。 */
  updateAndDrawCrack(ctx: CanvasRenderingContext2D, now: number): void {
    if (!this.crackOn) return;
    const progress = (now - this.crackT0) / this.crackDurationMs;
    if (progress >= 1) {
      this.crackOn = false;
      this.particles = [];
      return;
    }

    const x = this.crackX;
    const y = this.crackY;
    const dt = now < this.lastCrackUpdate ? 1 / 60 : Math.min(0.05, (now - this.lastCrackUpdate) / 1000);
    this.lastCrackUpdate = now;
    const contract = renderContractFor(this.presetId);
    if (!this.useLegacyStyle && this.presetId === 'downpour') {
      const width = ctx.canvas.clientWidth || window.innerWidth;
      const height = ctx.canvas.clientHeight || window.innerHeight;
      drawCanvasDownpour(ctx, width, height, this.effectParams, now - this.crackT0, this._particleHue, 1 - Math.max(0, progress - .8) / .2);
    } else {
      advanceAndDrawParticles(ctx, this.particles, now, this._particleHue, dt);
    }
    if (this.useLegacyStyle || contract.genericParticles) {
      drawCrackLighting(ctx, progress, x, y, this.hue);
      drawImpact(ctx, now, x, y, this.crackVel, progress);
    }
    if (this.useLegacyStyle || contract.sourceSprite) {
      this.drawCrackSprite(ctx, progress, x, y);
    }
  }

  private drawCrackSprite(
    ctx: CanvasRenderingContext2D,
    progress: number,
    x: number,
    y: number,
  ): void {
    if (!this.ready) return;
    const sprite = this.useLegacyStyle
      ? this.style.sprite(progress, this.crackVel)
      : this.effect.sprite(progress, this.crackVel, this.effectParams);
    const width = this.fitW * sprite.scale;
    const height = this.fitH * sprite.scale;
    ctx.save();
    ctx.globalAlpha = Math.max(0, sprite.alpha);
    ctx.translate(x + sprite.dx, y + sprite.dy);
    if (sprite.rot) ctx.rotate(sprite.rot);
    ctx.drawImage(this.img, -width / 2, -height / 2, width, height);
    ctx.restore();
  }
}
