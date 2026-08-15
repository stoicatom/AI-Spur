/**
 * 图片素材的加载 / 缓存 / 绘制（与配色皮肤、音效解耦）。
 *
 * 职责：
 *  - `resolveMaterial`：把 config.activeMaterialId + Material[] 解析为图片 URL
 *    渲染指令（纯函数，无副作用）。
 *  - `MaterialTrail`：能量拖尾。记录素材最近的历史位置，甩得越快拖尾越长越亮，
 *    给「甩动」一个可见的速度反馈。
 *  - `ImageMaterial`：持有一张预加载的素材精灵，负责光标跟随绘制，以及
 *    **与素材强关联的专属爆裂动画**（火箭升空、闪电劈裂、火焰上腾……）。
 *
 * 帧循环内只做 drawImage / 画粒子，图片仅在 `load()` 时解码一次，满足 60fps。
 */
import type { Material } from '../shared/materials';

const TAU = Math.PI * 2;
const CURSOR_MAX_PX = 56; // 光标精灵最长边（48–64 区间）
const CRACK_MS = 720; // 爆裂动画时长

/** 解析后的渲染指令。所有素材均为图片，`url` 为 data: URI。 */
export type ResolvedMaterial = { kind: 'image'; url: string; id: string };

/**
 * 把 activeMaterialId 解析为图片渲染指令（url 为 Rust 内联的 data: URI）。
 * 未找到时回退到列表里的 rocket；再找不到则返回空（调用方保持上一帧素材）。
 */
export function resolveMaterial(materialId: string, materials: Material[]): ResolvedMaterial {
  const m = materials.find((x) => x.id === materialId) ?? materials.find((x) => x.id === 'rocket');
  if (!m) return { kind: 'image', url: '', id: 'rocket' };
  return { kind: 'image', url: m.dataUri, id: m.id };
}

function fitSize(img: HTMLImageElement, max: number): { w: number; h: number } {
  const iw = img.naturalWidth || max;
  const ih = img.naturalHeight || max;
  const scale = max / Math.max(iw, ih);
  return { w: iw * scale, h: ih * scale };
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

// ── 能量拖尾 ────────────────────────────────────────────────────────────────

interface TrailPoint {
  x: number;
  y: number;
  t: number;
}

/**
 * 素材跟随时的能量拖尾。环形缓冲最近的位置点，按 age 递减 alpha/宽度绘制，
 * 甩得越快点距越大 → 拖尾越长。纯 canvas 折线，无逐帧分配。
 *
 * 用**定长对象数组 + 头/尾游标**实现，而非 `push`/`shift`：跟随阶段每帧
 * 记一个点，环形缓冲避免每帧分配新 TrailPoint 对象，也让丢弃最旧点是 O(1)。
 */
export class MaterialTrail {
  private points: TrailPoint[] = [];
  private head = 0; // 最旧点的下标（环形 write 游标 = 最旧点位置）。
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
    // 环形缓冲里最旧的下标。count 不足满时，write 落在 count 之后（即物理下标
    // = count）。
    const writeAt = this.count < this.max ? this.count : this.head;
    // 仅在移动足够时记点，避免静止时堆叠（与原 push/shift 语义一致）。
    if (this.count > 0) {
      const last = this.points[(writeAt + this.max - 1) % this.max];
      if (last && Math.hypot(x - last.x, y - last.y) < 4) return;
    }
    const p = this.points[writeAt] ?? (this.points[writeAt] = { x: 0, y: 0, t: 0 });
    p.x = x;
    p.y = y;
    p.t = now;
    if (this.count < this.max) {
      this.count++;
    } else {
      this.head = (this.head + 1) % this.max;
    }
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    if (this.count < 2) return;
    // 从最旧到最新遍历段（首尾相接的环形里的连续区间）。
    // 老点在 220ms 后淡尽。
    for (let k = 1; k < this.count; k++) {
      const a = this.points[(this.head + k - 1) % this.max];
      const b = this.points[(this.head + k) % this.max];
      const age = now - b.t;
      const life = Math.max(0, 1 - age / 220);
      if (life <= 0) continue;
      ctx.save();
      ctx.globalAlpha = life * 0.5 * (k / this.count);
      ctx.strokeStyle = `hsl(${this.hue}, 100%, 62%)`;
      ctx.lineWidth = 10 * life * (k / this.count);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ── 专属爆裂动画 ────────────────────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  size: number;
  hue: number;
  gravity: number;
  shape: 'dot' | 'streak' | 'shard';
  angle: number;
}

/** 每枚素材的爆裂「风味」：主色相 + 精灵运动方式 + 粒子发射器。 */
interface CrackStyle {
  /** 拖尾/粒子主色相。 */
  hue: number;
  /** 精灵在爆裂时如何运动（相对起点的位移 + 缩放 + 旋转，t∈[0,1]）。 */
  sprite: (t: number) => { dx: number; dy: number; scale: number; rot: number; alpha: number };
  /** 生成一批粒子。 */
  emit: (cx: number, cy: number) => Particle[];
}

function ring(cx: number, cy: number, count: number, speedLo: number, speedHi: number, hue: () => number, shape: Particle['shape'], gravity = 0.05): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU + rand(-0.15, 0.15);
    const speed = rand(speedLo, speedHi);
    out.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 1, decay: rand(0.018, 0.03), size: rand(2, 4.5),
      hue: hue(), gravity, shape, angle,
    });
  }
  return out;
}

/** 素材 id → 专属爆裂风味。未知 id 回退到通用锻造橙爆裂。 */
function crackStyle(id: string): CrackStyle {
  switch (id) {
    case 'whip':
      // 抽甩：素材沿一道弧线高速抡出并放大淡出，落点迸射一条长弧光 + 皮革碎屑。
      return {
        hue: 28,
        sprite: (t) => {
          // 鞭身沿右上→左下的大弧甩出（模仿真实抡鞭的手势）。
          const ang = -Math.PI * 0.25 + t * Math.PI * 0.5;
          const rx = 46 * Math.cos(ang);
          const ry = 46 * Math.sin(ang);
          return { dx: -rx, dy: -ry, scale: 1 + t * 0.8, rot: t * 1.2, alpha: 1 - t * t };
        },
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 主线：一条长弧光 streak，沿抽击切线甩出。
          for (let i = 0; i < 22; i++) {
            const a = -Math.PI / 3 + rand(-0.1, 0.1);
            const sp = rand(7, 16);
            out.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.016, 0.028), size: rand(3, 6), hue: rand(22, 40), gravity: 0.05, shape: 'streak', angle: a });
          }
          // 散碎皮革屑 + 土黄微粒子。
          for (let i = 0; i < 26; i++) {
            const a = rand(0, TAU);
            const sp = rand(1.5, 7);
            out.push({ x: cx + rand(-10, 24), y: cy + rand(-10, 18), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
              life: 1, decay: rand(0.02, 0.04), size: rand(1.5, 3.5), hue: rand(14, 42), gravity: 0.12, shape: Math.random() < 0.4 ? 'shard' : 'dot', angle: rand(0, TAU) });
          }
          return out;
        },
      };
    case 'rocket':
      // 升空：精灵向上加速冲出，尾部橙焰粒子向下喷、扩成烟云。
      return {
        hue: 26,
        sprite: (t) => ({ dx: 0, dy: -t * t * 420, scale: 1 + t * 0.25, rot: 0, alpha: 1 - t * 0.4 }),
        emit: (cx, cy) => {
          const out: Particle[] = [];
          for (let i = 0; i < 46; i++) {
            const a = Math.PI / 2 + rand(-0.6, 0.6); // 朝下
            const sp = rand(2, 8);
            out.push({ x: cx, y: cy + 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.02, 0.04), size: rand(2, 5), hue: rand(18, 44), gravity: -0.02, shape: 'dot', angle: 0 });
          }
          return out;
        },
      };
    case 'lightning':
      // 劈裂：精灵原地闪一下即隐，多道电弧 streak 放射。
      return {
        hue: 205,
        sprite: (t) => ({ dx: 0, dy: 0, scale: 1 + t * 0.6, rot: 0, alpha: Math.max(0, 1 - t * 3) }),
        emit: (cx, cy) => ring(cx, cy, 14, 6, 13, () => rand(195, 215), 'streak', 0),
      };
    case 'flame':
      // 上腾：精灵向上舒展放大，火星向上飘散。
      return {
        hue: 20,
        sprite: (t) => ({ dx: 0, dy: -t * 120, scale: 1 + t * 1.4, rot: 0, alpha: 1 - t * t }),
        emit: (cx, cy) => {
          const out: Particle[] = [];
          for (let i = 0; i < 34; i++) {
            const a = -Math.PI / 2 + rand(-0.5, 0.5);
            const sp = rand(1.5, 6);
            out.push({ x: cx + rand(-14, 14), y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.012, 0.024), size: rand(2, 5), hue: rand(14, 44), gravity: -0.05, shape: 'dot', angle: 0 });
          }
          return out;
        },
      };
    case 'star':
      // 绽放：精灵四射放大后淡出，金色星尘环扩散。
      return {
        hue: 45,
        sprite: (t) => ({ dx: 0, dy: 0, scale: 1 + t * 1.6, rot: t * 0.6, alpha: 1 - t * t }),
        emit: (cx, cy) => ring(cx, cy, 40, 3, 11, () => rand(40, 56), 'dot', 0.02),
      };
    case 'meteor':
      // 坠击：精灵沿右下俯冲，落点橙色冲击 streak 环。
      return {
        hue: 30,
        sprite: (t) => ({ dx: t * 140, dy: t * 140, scale: 1 - t * 0.3, rot: 0, alpha: 1 - t }),
        emit: (cx, cy) => ring(cx + 90, cy + 90, 26, 4, 12, () => rand(20, 42), 'streak', 0.08),
      };
    case 'skull':
      // 碎裂：精灵裂开抖散，红色余烬碎片下落。
      return {
        hue: 8,
        sprite: (t) => ({ dx: Math.sin(t * 40) * 6 * (1 - t), dy: t * 40, scale: 1 - t * 0.5, rot: rand(-0.02, 0.02), alpha: 1 - t }),
        emit: (cx, cy) => ring(cx, cy, 30, 3, 9, () => rand(2, 20), 'shard', 0.12),
      };
    case 'sword':
      // 挥斩：精灵快速斜向劈出并放大淡出，沿刃迹迸射金橙火花条。
      return {
        hue: 24,
        sprite: (t) => ({ dx: t * 90, dy: -t * 30, scale: 1 + t * 0.5, rot: t * 0.5, alpha: Math.max(0, 1 - t * 1.4) }),
        emit: (cx, cy) => {
          const out: Particle[] = [];
          // 沿一条斜向刃迹撒火花条（右上—左下）。
          for (let i = 0; i < 34; i++) {
            const along = (i / 34 - 0.5) * 120;
            const px = cx + along * 0.9;
            const py = cy - along * 0.5;
            const a = rand(-0.5, 0.5) - Math.PI / 4;
            const sp = rand(5, 13);
            out.push({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 1, decay: rand(0.02, 0.035), size: rand(2, 4.5), hue: rand(20, 46), gravity: 0.05, shape: 'streak', angle: a });
          }
          return out;
        },
      };
    case 'crown':
      // 加冕：精灵上抛旋转放大，宝石光点环绕迸发。
      return {
        hue: 45,
        sprite: (t) => ({ dx: 0, dy: -t * 60, scale: 1 + t * 0.5, rot: t * TAU, alpha: 1 - t * t }),
        emit: (cx, cy) => ring(cx, cy, 32, 2.5, 9, () => (Math.random() < 0.5 ? rand(40, 52) : rand(200, 212)), 'dot', -0.02),
      };
    default:
      // 通用锻造橙爆裂（自定义素材）。
      return {
        hue: 24,
        sprite: (t) => ({ dx: 0, dy: 0, scale: 1 + t * 1.4, rot: 0, alpha: 1 - t * t }),
        emit: (cx, cy) => ring(cx, cy, 28, 3, 10, () => rand(16, 40), 'dot', 0.06),
      };
  }
}

/**
 * 一张图片素材精灵。同一 URL 重复 `load` 不重新解码。
 * crack 时按 materialId 播放专属爆裂动画。
 */
export class ImageMaterial {
  private img = new Image();
  private ready = false;
  private url = '';
  /** 精灵适配后的绘制尺寸，load 成功时缓存一次，避免帧内重复计算。 */
  private fitW = 0;
  private fitH = 0;

  private crackT0 = 0;
  private crackX = 0;
  private crackY = 0;
  private crackOn = false;
  private style: CrackStyle = crackStyle('rocket');
  private particles: Particle[] = [];

  /** 预加载图片（仅在 URL 变化时触发一次解码）。 */
  load(url: string, id: string): void {
    this.style = crackStyle(id);
    if (url === this.url) return;
    this.url = url;
    this.ready = false;
    if (!url) return; // 空 url（解析失败回退）：保持未就绪，帧循环不绘制。
    const img = new Image();
    img.onload = () => {
      if (this.url === url) {
        this.img = img;
        this.ready = true;
        const s = fitSize(img, CURSOR_MAX_PX);
        this.fitW = s.w;
        this.fitH = s.h;
      }
    };
    img.onerror = () => {
      if (this.url === url) this.ready = false;
    };
    img.src = url;
  }

  /** 拖尾主色相，随素材切换。 */
  get hue(): number {
    return this.style.hue;
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
    ctx.drawImage(this.img, x - this.fitW / 2, y - this.fitH / 2, this.fitW, this.fitH);
  }

  /** 触发该素材的专属爆裂动画。 */
  startCrack(x: number, y: number): void {
    this.crackOn = true;
    this.crackT0 = performance.now();
    this.crackX = x;
    this.crackY = y;
    this.particles = this.style.emit(x, y);
  }

  /**
   * 推进并绘制爆裂动画。动画结束时把 crackOn 置为 false，
   * 调用方据此判断是否隐藏覆盖层。
   */
  updateAndDrawCrack(ctx: CanvasRenderingContext2D, now: number): void {
    if (!this.crackOn) return;
    const t = (now - this.crackT0) / CRACK_MS;
    if (t >= 1) {
      this.crackOn = false;
      this.particles = [];
      return;
    }

    const cx = this.crackX;
    const cy = this.crackY;

    // 粒子：物理推进 + 绘制 + 「原地压缩」在单遍内完成。活粒子写入数组前段，
    // 最后截断 length——不再每帧 `filter` 分配新数组（爆裂期间 720ms 内的
    // 主要 GC 压力来源）。
    let write = 0;
    const ps = this.particles;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.98;
      p.vy *= 0.98;
      p.life -= p.decay;
      if (p.life <= 0) continue; // 死粒子：不画也不压实（后面统一截断）。

      // 绘制活粒子。
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life * 1.4);
      const sz = p.size * p.life;
      if (p.shape === 'dot') {
        ctx.fillStyle = `hsl(${p.hue}, 100%, 62%)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz, 0, TAU);
        ctx.fill();
      } else if (p.shape === 'streak') {
        ctx.strokeStyle = `hsl(${p.hue}, 100%, 66%)`;
        ctx.lineWidth = sz;
        ctx.lineCap = 'round';
        const len = 10 + p.life * 14;
        const a = Math.atan2(p.vy, p.vx);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - Math.cos(a) * len, p.y - Math.sin(a) * len);
        ctx.stroke();
      } else {
        // shard：小方片
        ctx.fillStyle = `hsl(${p.hue}, 90%, 58%)`;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle + now * 0.01);
        ctx.fillRect(-sz, -sz * 0.5, sz * 2, sz);
      }
      ctx.restore();

      // 压实：活粒子留在前段（原位或前移覆盖死粒子）。
      if (write !== i) ps[write] = p;
      write++;
    }
    ps.length = write;

    // 素材精灵：按专属运动轨迹位移 / 缩放 / 旋转 / 淡出。
    if (this.ready) {
      const s = this.style.sprite(t);
      const iw = this.fitW * s.scale;
      const ih = this.fitH * s.scale;
      ctx.save();
      ctx.globalAlpha = Math.max(0, s.alpha);
      ctx.translate(cx + s.dx, cy + s.dy);
      if (s.rot) ctx.rotate(s.rot);
      ctx.drawImage(this.img, -iw / 2, -ih / 2, iw, ih);
      ctx.restore();
    }
  }
}
