/**
 * 自定义单选组（role="radio" 按钮）的键盘导航。
 *
 * WAI-ARIA 的 radiogroup 要求方向键在选项间循环移动，Home/End 跳到两端；
 * 素材库与画质档位都是按钮伪装的单选组，共用这一份索引计算。
 *
 * @returns 目标索引；返回 null 表示该按键与单选组无关，调用方不应拦截。
 */
export function nextRadioIndex(key: string, index: number, length: number): number | null {
  if (length === 0) return null;
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return (index + 1) % length;
    case 'ArrowUp':
    case 'ArrowLeft':
      return (index - 1 + length) % length;
    case 'Home':
      return 0;
    case 'End':
      return length - 1;
    default:
      return null;
  }
}
