# img→Three 全局酷炫升级设计

## 目标

在不牺牲素材独立物理表现的前提下，让所有特效的素材本体更有“立体主角感”：图像从单一平面升级为带深度错层、边缘能量、脉冲光晕和方向拖影的 Hero 层；Canvas 回退保持同一视觉语义。

仓库当前没有独立的 `img2threejs` CLI、MCP 或 npm 依赖，因此本方案使用现有 Three.js + ShaderMaterial + EffectComposer 实现等价的图片到 Three.js 立体转换，不伪造外部工具调用。

## 方案

- 新增 `three-image-hero.ts`，以素材纹理为输入创建核心图像之外的四类 GPU 层：纹理边缘能量光、两层深度幽灵、环形脉冲；所有层共享同一纹理并由现有资源图遍历统一释放。
- Hero 层逐帧消费当前预设的 `SpriteFrame` 和 `MaterialPhysics`：核心位移、旋转、线性尺寸仍由共享帧缩放 helper 决定；幽灵沿速度方向错位，光晕和环波由进度、能量、物理签名驱动，避免素材之间同质化。
- `ThreeEffectRenderer` 保留现有核心 `sprite` 字段和专属 `CinematicLayers`，只额外挂载/更新 Hero 层；加载失败、取消、重启和 dispose 继续沿现有 runId 与资源生命周期处理。
- Canvas 通过多层半透明素材绘制模拟深度幽灵与方向拖影，不引入 shader 或额外分配型动画循环。
- Bloom 仅做轻量增强，透明背景、像素倍率和 reduced-motion 约束不改变。

## 验收

- 每个有素材纹理的预设都创建 Hero 层，核心素材轨迹与既有 `SpriteFrame` 完全一致。
- WebGL Hero 层至少包含一个 ShaderMaterial 能量层、两层深度幽灵和一层环形脉冲；其位置、缩放、透明度随进度和物理能量变化。
- Canvas 回退在一次更新中绘制核心 + 两层拖影，方向随 `SpriteFrame` 位移变化。
- 纹理取消、替换、结束和 dispose 不遗留 Hero 几何体、材质或纹理。
- TypeScript、Vitest、生产构建、Rust 测试、Clippy 和桌面/窄屏 WebGL 视觉检查通过。
