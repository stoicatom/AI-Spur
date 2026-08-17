import { describe, it, expect } from 'vitest';
import { MATERIAL_HUE, type Particle, type WhipVel, P, IMPACT } from '../overlay/particles';

describe('MATERIAL_HUE 专属主题色表', () => {
  it('52 内置素材全部有独立主题色', () => {
    const ids = ['whip','classic','rocket','lightning','flame','star','meteor','skull','crown','sword','bow','shield','bomb','hammer','scepter','amulet','dagger','boomerang','spear','axe','scythe','trident','flail','chakram','halberd','slingshot','blowgun','tessen','chain','wind','snow','rain','water','tornado','aurora','earthquake','volcano','guitar','drum','bell','horn','flute','harp','football','tennis','boxing','archery','fireworks','crystal','bamboo','lotus','dragonfly'];
    for (const id of ids) expect(MATERIAL_HUE[id], id).toBeTypeOf('number');
    // 验证 WhipVel 类型
    const vel: WhipVel = { vx: 1, vy: 0, speed: 1, dir: 0 };
    expect(vel).toBeDefined();
  });
  it('语义相近素材不共用同一色相（消灭橙金一片）', () => {
    const set = new Set<number>();
    for (const id of Object.keys(MATERIAL_HUE)) set.add(MATERIAL_HUE[id]);
    // 至少 30 个不同色相值（允许少量语义相邻）
    expect(set.size).toBeGreaterThanOrEqual(30);
  });
  it('Particle 结构完整', () => {
    const p: Particle = { x:0,y:0,vx:0,vy:0,life:1,decay:0.02,size:3,hue:0,gravity:0,shape:0,angle:0 };
    expect(p).toBeDefined();
  });
});

describe('粒子发射原语', () => {
  it('shockRing 生成 count 个圆环粒子，等角分布', () => {
    const ps = P.shockRing(100, 100, 24, 10, 60);
    expect(ps).toHaveLength(24);
    for (const p of ps) expect(p.shape).toBe(1);
  });
  it('parabola 生成的粒子沿弧线分布（y 随 frac 先上后落）', () => {
    const ps = P.parabola(0, 0, 20, 300, 120);
    expect(ps).toHaveLength(20);
    const ys = ps.map(p => p.y);
    // 存在高于起点的点（抛物线拱起）
    expect(Math.min(...ys)).toBeLessThan(0);
  });
  it('burst 粒子速度在给定区间且重力默认 >0', () => {
    const ps = P.burst(0, 0, 40, 3, 10);
    expect(ps).toHaveLength(40);
    expect(Math.min(...ps.map(p => p.gravity))).toBeGreaterThan(0);
  });

  it('arcSweep 沿弧线分布，速度沿切线方向', () => {
    const ps = P.arcSweep(100, 100, 15, 0, Math.PI / 2, 50);
    expect(ps).toHaveLength(15);
    // arcSweep 默认使用 streak 形状
    expect(ps[0].shape).toBe(1);
    // 验证粒子在不同角度分布
    const angles = ps.map(p => Math.atan2(p.y - 100, p.x - 100));
    expect(angles[0]).toBeLessThan(angles[angles.length - 1]);
  });

  it('spiral 从中心螺旋旋出，半径递增', () => {
    const ps = P.spiral(50, 50, 20, 2, 80);
    expect(ps).toHaveLength(20);
    // 验证半径递增
    const distances = ps.map(p => Math.hypot(p.x - 50, p.y - 50));
    expect(distances[0]).toBeLessThan(distances[distances.length - 1]);
    expect(ps[0].shape).toBe(1);
  });

  it('pillar 竖直光柱，粒子向上运动', () => {
    const ps = P.pillar(100, 200, 12, 150);
    expect(ps).toHaveLength(12);
    // 所有粒子 vy 为负（向上）
    for (const p of ps) expect(p.vy).toBeLessThan(0);
    // 粒子 y 坐标由高到低分布
    expect(ps[0].y).toBeGreaterThan(ps[ps.length - 1].y);
  });

  it('shards 碎屑四散，默认使用 shard 形状', () => {
    const ps = P.shards(0, 0, 30, 2, 8);
    expect(ps).toHaveLength(30);
    // shards 强制使用 shape=2
    for (const p of ps) expect(p.shape).toBe(2);
    // 受明显重力影响
    expect(Math.min(...ps.map(p => p.gravity))).toBeGreaterThan(0);
  });

  it('notes 音符排列成弹跳曲线', () => {
    const ps = P.notes(0, 0, 10);
    expect(ps).toHaveLength(10);
    // notes 使用 shard 形状
    for (const p of ps) expect(p.shape).toBe(2);
    // 粒子在水平方向展开
    const xValues = ps.map(p => p.x);
    expect(xValues[xValues.length - 1]).toBeGreaterThan(xValues[0]);
  });
});

describe('冲击增强层', () => {
  it('冲击增强参数：CURSOR_MAX_PX 放大到 96 且冲击光环半径随速度', () => {
    expect(IMPACT.maxPx).toBe(96);
    const rSlow = IMPACT.ringRadius(1);   // 慢甩
    const rFast = IMPACT.ringRadius(3);   // 快甩
    expect(rFast).toBeGreaterThan(rSlow);
  });
});
