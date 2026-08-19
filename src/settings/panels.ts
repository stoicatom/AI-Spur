/**
 * Panel registry for the settings window.
 *
 * Kept separate from `App.tsx` so both the sidebar and the content area read
 * the same source of truth, and so tests can enumerate panels without
 * rendering React.
 */

import type { IconName } from './components/Icon';

export const PANEL_IDS = [
  'trigger',
  'phrases',
  'skins',
  'animation',
  'sounds',
  'theme',
  'stats',
] as const;

export type PanelId = (typeof PANEL_IDS)[number];

export interface PanelMeta {
  id: PanelId;
  /** Sidebar label (Simplified Chinese, matching the app's locale). */
  label: string;
  /** Icon name for geometric SVG icon (replaces emoji glyph). */
  icon: IconName;
}

export interface NavGroup {
  /** Group heading shown above its items; uppercase-tracked in the sidebar. */
  label: string;
  items: PanelMeta[];
}

/**
 * Sidebar grouping per design spec §7.3: configuration first, appearance
 * second, statistics last on its own.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: '配置',
    items: [
      { id: 'trigger', label: '触发', icon: 'trigger' },
      { id: 'phrases', label: '提示词', icon: 'phrases' },
    ],
  },
  {
    label: '外观',
    items: [
      { id: 'skins', label: '素材包', icon: 'skins' },
      { id: 'animation', label: '动画', icon: 'animation' },
      { id: 'sounds', label: '音效', icon: 'sounds' },
      { id: 'theme', label: '主题', icon: 'theme' },
    ],
  },
  {
    label: '数据',
    items: [{ id: 'stats', label: '统计', icon: 'stats' }],
  },
];

export const DEFAULT_PANEL: PanelId = 'trigger';

/** Flat lookup for a panel's metadata. */
export function findPanel(id: PanelId): PanelMeta {
  for (const group of NAV_GROUPS) {
    const match = group.items.find((item) => item.id === id);
    if (match) return match;
  }
  // PANEL_IDS and NAV_GROUPS are kept in sync; this guards against drift.
  throw new Error(`Unknown panel id: ${id}`);
}
