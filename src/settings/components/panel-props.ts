import type { Config } from '../../shared/config';

/**
 * Shared shape for every settings panel.
 *
 * Panels never persist config themselves — they hand a patch upward so `App`
 * stays the single writer talking to Rust (R-ARCH-002).
 */
export interface PanelProps {
  config: Config;
  onPatch: (patch: Partial<Config>) => void;
}
