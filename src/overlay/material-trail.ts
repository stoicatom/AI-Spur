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
