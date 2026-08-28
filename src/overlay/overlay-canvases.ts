/**
 * 覆盖层画布的取用与尺寸同步（原 main.ts 顶部的引导代码）。
 *
 * 抽出的唯一目的是守住入口文件的行数上限：这里只做 DOM 查找、2D 上下文
 * 获取与 resize 同步，不含任何交互逻辑。
 */

import { ThreeEffectHost } from './three-effect-host';
import { resizeCanvas2D } from './canvas-pixel-budget';

export interface OverlayCanvases {
  ctx: CanvasRenderingContext2D;
  three: ThreeEffectHost;
  width(): number;
  height(): number;
  /** 解除 resize 监听（页面卸载时调用）。 */
  stop(): void;
}

export function mountOverlayCanvases(): OverlayCanvases {
  const canvas = document.getElementById('whip-canvas') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('whip-canvas element not found');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  const three = new ThreeEffectHost(document.getElementById('whip-webgl') as HTMLCanvasElement | null);

  let width = 0;
  let height = 0;
  const resize = (): void => {
    width = window.innerWidth;
    height = window.innerHeight;
    resizeCanvas2D(canvas, ctx, width, height, window.devicePixelRatio || 1);
    three.resize(width, height);
  };
  resize();
  window.addEventListener('resize', resize);
  three.ensure();

  return {
    ctx,
    three,
    width: () => width,
    height: () => height,
    stop: () => window.removeEventListener('resize', resize),
  };
}
