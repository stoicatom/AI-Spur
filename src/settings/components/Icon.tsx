/**
 * Geometric icon system for AI-Spur settings.
 *
 * Replaces emoji glyphs with sharp, industrial SVG icons that match the
 * forged-metal aesthetic. All icons are 20×20px with 1.5px stroke, optimized
 * for sidebar nav at 16px rendered size.
 */

export type IconName = 'trigger' | 'phrases' | 'skins' | 'animation' | 'sounds' | 'theme' | 'stats';

export interface IconProps {
  name: IconName;
  className?: string;
}

/**
 * Inline SVG icon. Always rendered at 20×20 logical pixels (scales with DPI).
 * Uses currentColor for stroke so it inherits text color from parent.
 */
export function Icon({ name, className = '' }: IconProps) {
  return (
    <svg
      className={`icon ${className}`}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

const ICON_PATHS: Record<IconName, JSX.Element> = {
  // Trigger: Lightning bolt (kinetic energy, instant action)
  trigger: (
    <path
      d="M11 2L5 11H10L9 18L15 9H10L11 2Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),

  // Phrases: Speech lines (communication, text input)
  phrases: (
    <>
      <path
        d="M3 6H17M3 10H17M3 14H11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  ),

  // Skins: Layers (visual customization, stacked options)
  skins: (
    <>
      <rect
        x="4"
        y="4"
        width="12"
        height="12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 4V2M13 4V2M16 7H18M16 13H18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  ),

  // Animation: Sine wave (motion, physics, dynamic behavior)
  animation: (
    <path
      d="M2 10C2 10 4 6 6 6C8 6 8 14 10 14C12 14 12 6 14 6C16 6 18 10 18 10"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  ),

  // Sounds: Waveform (audio, sound output)
  sounds: (
    <>
      <path
        d="M4 8V12M7 6V14M10 4V16M13 6V14M16 8V12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  ),

  // Theme: Sun/Moon split (light/dark mode toggle)
  theme: (
    <>
      <circle
        cx="10"
        cy="10"
        r="4"
        fill="currentColor"
        opacity="0.2"
      />
      <path
        d="M10 2V4M10 16V18M18 10H16M4 10H2M15.66 15.66L14.24 14.24M5.76 5.76L4.34 4.34M15.66 4.34L14.24 5.76M5.76 14.24L4.34 15.66"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  ),

  // Stats: Bar chart (data, metrics, analytics)
  stats: (
    <>
      <path
        d="M4 16V10M8 16V6M12 16V12M16 16V8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  ),
};
