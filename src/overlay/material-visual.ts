/**
 * 图片素材公共入口。
 *
 * 具体实现按解析、拖尾、图片控制器和 Canvas 回退绘制拆分；保留此门面以兼容
 * overlay 入口和既有测试的导入路径。
 */
export { ImageMaterial } from './image-material';
export { MaterialTrail } from './material-trail';
export {
  packListNeedsRefresh,
  resolveMaterial,
  resolvePackMaterial,
  type ResolvedMaterial,
} from './material-resolver';
export type { CrackStyle } from './material-styles';
