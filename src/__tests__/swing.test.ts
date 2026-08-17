import { describe, it, expect } from 'vitest';
import { SwingDetector, DEFAULT_SWING } from '../overlay/swing';

function mkT(n: number) {
  return performance.now() + n;
}
const P = { ...DEFAULT_SWING, minTravel: 10, graceMs: 0 };

describe('SwingDetector 物理绑定', () => {
  it('高速甩动触发时返回速度向量', () => {
    const s = new SwingDetector(mkT(0));
    // 向右高速甩动（速度 > baseSpeed）
    const evs = [
      { x: 0, y: 0, t: mkT(0) },
      { x: 40, y: 0, t: mkT(16) },
      { x: 100, y: 2, t: mkT(32) }, // 高速 → 急减速(before: 60/16=3.75 vs cur: 60/16)
      { x: 130, y: 2, t: mkT(48) }, // 减速到 30/16=1.9 < 3.75/2
    ];
    let res: any = { cracked: false };
    for (const e of evs) res = s.push(e, P);
    expect(res.cracked).toBe(true);
    expect(res.vx).toBeGreaterThan(0); // 向右
    expect(res.peakSpeed).toBeGreaterThan(0);
    expect(typeof res.vx).toBe('number');
  });

  it('未触发时 cracked=false', () => {
    const s = new SwingDetector(mkT(0));
    const r = s.push({ x: 0, y: 0, t: mkT(0) }, P); // 仅一帧，不足 3 帧
    expect(r.cracked).toBe(false);
  });
});
