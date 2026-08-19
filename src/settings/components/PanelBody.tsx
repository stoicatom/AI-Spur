import type { Config } from '../../shared/config';
import type { PanelId } from '../panels';
import { AnimationPanel } from './AnimationPanel';
import { PhrasesPanel } from './PhrasesPanel';
import { MaterialPacksPanel } from './MaterialPacksPanel';
import { SoundsPanel } from './SoundsPanel';
import { StatsPanel } from './StatsPanel';
import { ThemePanel } from './ThemePanel';
import { TriggerPanel } from './TriggerPanel';

export interface PanelBodyProps {
  panel: PanelId;
  config: Config;
  onPatch: (patch: Partial<Config>) => void;
}

/**
 * Maps a panel id to its component.
 *
 * Kept out of `App.tsx` so the shell stays focused on loading, persistence,
 * and transitions rather than growing a switch over every panel.
 */
export function PanelBody({ panel, config, onPatch }: PanelBodyProps) {
  const props = { config, onPatch };
  switch (panel) {
    case 'trigger':
      return <TriggerPanel {...props} />;
    case 'phrases':
      return <PhrasesPanel {...props} />;
    case 'skins':
      // v3: SkinsPanel 已升级为素材包面板（三轴合一）
      return <MaterialPacksPanel {...props} />;
    case 'animation':
      return <AnimationPanel {...props} />;
    case 'sounds':
      return <SoundsPanel {...props} />;
    case 'theme':
      return <ThemePanel theme={config.theme} onChange={(theme) => onPatch({ theme })} />;
    case 'stats':
      return <StatsPanel {...props} />;
  }
}
