/**
 * 特效预设专用 SVG 图标。
 *
 * 这里不依赖系统字体或 Unicode 字形：每个 tile 都使用同一套 20px
 * 工业线稿，并通过少量几何变体表达运动语义，避免在不同平台退化成 emoji。
 */

export type EffectIconName =
  | 'jet' | 'wing' | 'bolt' | 'wave' | 'orbit' | 'slash' | 'shatter'
  | 'burst' | 'flame' | 'ice' | 'ring' | 'water' | 'vortex' | 'impact'
  | 'trail' | 'pulse' | 'petal' | 'split' | 'chain' | 'glow' | 'rain'
  | 'note' | 'groove' | 'singularity' | 'drum';

export function EffectIcon({ name, className = '' }: { name: EffectIconName; className?: string }) {
  const common = { stroke: 'currentColor', strokeWidth: 1.45, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  let content: JSX.Element;
  switch (name) {
    case 'jet': content = <><path d="M4 17L13.8 7.2" {...common}/><path d="M11.8 5.8L15.2 4.8L14.2 8.2" {...common}/><path d="M6.2 18.2L4 20" {...common}/><path d="M8.7 15.7L6.5 17.9" {...common}/></>; break;
    case 'wing': content = <><path d="M12 5C9 5 6 7 3.5 11.5C6.3 10.9 8.2 11.5 10 14" {...common}/><path d="M12 5C15 5 18 7 20.5 11.5C17.7 10.9 15.8 11.5 14 14" {...common}/><path d="M12 5V19" {...common}/></>; break;
    case 'bolt': content = <path d="M13.4 2.8L6 12.2H11L10.3 21.2L18 10.3H13Z" {...common}/>; break;
    case 'wave': content = <path d="M2.5 12C5 5 7.4 5 9.8 12C12.2 19 14.7 19 17 12C18 9 19 8 21 8" {...common}/>; break;
    case 'orbit': content = <><ellipse cx="12" cy="12" rx="8.5" ry="4.1" transform="rotate(-28 12 12)" {...common}/><ellipse cx="12" cy="12" rx="8.5" ry="4.1" transform="rotate(28 12 12)" {...common}/><circle cx="12" cy="12" r="1.7" fill="currentColor"/></>; break;
    case 'slash': content = <><path d="M4 18L17.7 4.3" {...common}/><path d="M14 4H18V8" {...common}/><path d="M5 19H9" {...common}/></>; break;
    case 'shatter': content = <><path d="M12 3L15.2 8.2L20 10L15.7 13.8L14 20L10.1 15.5L4 14L7.2 9.5L7 4.5L12 7.1Z" {...common}/><path d="M12 7.1L10.1 15.5M7.2 9.5L15.2 8.2M15.7 13.8L10.1 15.5" {...common}/></>; break;
    case 'burst': content = <><circle cx="12" cy="12" r="3" {...common}/><path d="M12 2.5V6M12 18V21.5M2.5 12H6M18 12H21.5M5.3 5.3L7.8 7.8M16.2 16.2L18.7 18.7M18.7 5.3L16.2 7.8M7.8 16.2L5.3 18.7" {...common}/></>; break;
    case 'flame': content = <path d="M12.3 3C14.8 6 17.5 8.6 17.5 13.1C17.5 17.3 15.1 20 12 20C8.6 20 6.5 17.5 6.5 14.4C6.5 11.9 8 9.5 10.2 7.2C10.1 10 11 11.3 12.1 12.3C13 10.4 13.4 7.2 12.3 3Z" {...common}/>; break;
    case 'ice': content = <><path d="M12 2.5V21.5M3.8 7.2L20.2 16.8M20.2 7.2L3.8 16.8" {...common}/><path d="M12 2.5L9.5 5M12 2.5L14.5 5M12 21.5L9.5 19M12 21.5L14.5 19" {...common}/></>; break;
    case 'ring': content = <><circle cx="12" cy="12" r="3" {...common}/><circle cx="12" cy="12" r="7" {...common}/><circle cx="12" cy="12" r="10" {...common}/></>; break;
    case 'water': content = <><path d="M12 3C12 3 6.5 9.4 6.5 13.8C6.5 17.4 8.9 20 12 20C15.1 20 17.5 17.4 17.5 13.8C17.5 9.4 12 3 12 3Z" {...common}/><path d="M4 7.5L2.5 9M20 7.5L21.5 9" {...common}/></>; break;
    case 'vortex': content = <path d="M19.5 7.5C17 4 10 3.4 6.5 6.5C3 9.7 5.2 15.5 9.2 16.8C13.2 18.2 17.5 15.9 17 12.5C16.6 9.2 12.3 8.1 10 10.3C7.8 12.5 9.6 15.2 12.2 14.8" {...common}/>; break;
    case 'impact': content = <><path d="M4 5H20V16H14L12 20L10 16H4Z" {...common}/><path d="M8 9H16M8 12H13" {...common}/></>; break;
    case 'trail': content = <><path d="M3 17H13M3 13H10M3 9H7" {...common}/><path d="M13 18L20 12L13 6V10H9V14H13Z" {...common}/></>; break;
    case 'pulse': content = <path d="M2.5 12H6L8.5 5L12 19L15 8L17 12H21.5" {...common}/>; break;
    case 'petal': content = <><path d="M12 20C7 17 5 13.2 7.1 9.2C8.7 6.1 12 5 12 5C12 5 15.3 6.1 16.9 9.2C19 13.2 17 17 12 20Z" {...common}/><path d="M12 5V20" {...common}/></>; break;
    case 'split': content = <><path d="M12 19V8M12 8L7 3M12 8L17 3" {...common}/><path d="M5 3H9M15 3H19" {...common}/></>; break;
    case 'chain': content = <><path d="M10 14L8.2 15.8C6.8 17.2 4.5 17.2 3.1 15.8C1.6 14.3 1.6 12 3.1 10.6L6 7.7C7.4 6.3 9.7 6.3 11.1 7.7" {...common}/><path d="M14 10L15.8 8.2C17.2 6.8 19.5 6.8 20.9 8.2C22.4 9.7 22.4 12 20.9 13.4L18 16.3C16.6 17.7 14.3 17.7 12.9 16.3" {...common}/><path d="M8 12H16" {...common}/></>; break;
    case 'glow': content = <><circle cx="12" cy="12" r="3.2" fill="currentColor"/><path d="M12 2.5V6M12 18V21.5M2.5 12H6M18 12H21.5" {...common}/></>; break;
    case 'rain': content = <><path d="M6 3L3 12M12 3L9 12M18 3L15 12M9 14L6 21M15 14L12 21" {...common}/></>; break;
    case 'note': content = <><path d="M9 17.5V4L19 2.5V16" {...common}/><ellipse cx="6.5" cy="18" rx="3.5" ry="2.3" {...common}/><ellipse cx="16.5" cy="16.5" rx="3.5" ry="2.3" {...common}/></>; break;
    case 'groove': content = <><circle cx="12" cy="12" r="8.5" {...common}/><circle cx="12" cy="12" r="2.2" {...common}/><path d="M12 3.5V7M20.5 12H17M12 20.5V17M3.5 12H7" {...common}/></>; break;
    case 'singularity': content = <><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 2.5C7 2.5 3 6.5 3 11.5M21 12.5C21 17.5 17 21.5 12 21.5M5 19L8 16M19 5L16 8" {...common}/></>; break;
    case 'drum': content = <><ellipse cx="12" cy="7" rx="7.5" ry="3.3" {...common}/><path d="M4.5 7V16C4.5 18.3 7.9 20 12 20C16.1 20 19.5 18.3 19.5 16V7" {...common}/><path d="M12 3V1.5" {...common}/></>; break;
  }
  return <svg className={`effect-preset-tile__icon ${className}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">{content}</svg>;
}
