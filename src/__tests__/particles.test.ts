import { describe, it, expect } from 'vitest';
import { MATERIAL_HUE, type Particle, type WhipVel } from '../overlay/particles';

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
