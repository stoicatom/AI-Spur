interface TrailPoint {
  x: number;
  y: number;
  t: number;
}

/**
 * 素材跟随时的能量拖尾。定长环形缓冲避免每帧分配对象，也让丢弃最旧点是 O(1)。
 */
export class MaterialTrail {
  private points: TrailPoint[] = [];
  private head = 0;
  private count = 0;
  private readonly max = 14;
  private hue = 24;

  /** 素材切换时设定拖尾色相（与素材呼应）。 */
  setHue(hue: number): void {
    this.hue = hue;
  }

  clear(): void {
    this.count = 0;
  }

  /**
   * 当前拖尾所占的包围盒（未含线宽），供渲染循环做脏区域清除。
   * 无点时返回 null —— 调用方据此只清光标自身的区域。
   *
   * 必须由拖尾自己算：点是 14 帧 / 220ms 的历史轨迹，快速甩动时跨度可达数百
   * 像素，用「光标 ± 固定边距」猜出来的矩形会漏清，屏幕上留下残影。
   */
  bounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    if (this.count === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let index = 0; index < this.count; index++) {
      const point = this.points[(this.head + index) % this.max];
      if (!point) continue;
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    }
    if (minX === Infinity) return null;
    return { minX, minY, maxX, maxY };
  }

  /** draw() 用到的最大线宽 —— 包围盒要按它外扩，否则描边边缘会漏清。 */
  get maxLineWidth(): number {
    return 10;
  }

  push(x: number, y: number, now: number): void {
    const writeAt = this.count < this.max ? this.count : this.head;
    // 仅在移动足够时记点，避免静止时堆叠。
    if (this.count > 0) {
      const last = this.points[(writeAt + this.max - 1) % this.max];
      if (last && Math.hypot(x - last.x, y - last.y) < 4) return;
    }

    const point = this.points[writeAt]
      ?? (this.points[writeAt] = { x: 0, y: 0, t: 0 });
    point.x = x;
    point.y = y;
    point.t = now;

    if (this.count < this.max) {
      this.count++;
    } else {
      this.head = (this.head + 1) % this.max;
    }
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    if (this.count < 2) return;
    ctx.globalAlpha = 1;
    for (let index = 1; index < this.count; index++) {
      const start = this.points[(this.head + index - 1) % this.max];
      const end = this.points[(this.head + index) % this.max];
      const life = Math.max(0, 1 - (now - end.t) / 220);
      if (life <= 0) continue;

      ctx.globalAlpha = life * 0.5 * (index / this.count);
      ctx.strokeStyle = `hsl(${this.hue}, 100%, 62%)`;
      ctx.lineWidth = 10 * life * (index / this.count);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
