/**
 * Geometric icon system for AISpur settings.
 *
 * Replaces emoji glyphs with sharp, industrial SVG icons that match the
 * forged-metal aesthetic. All icons are 20×20px with 1.5px stroke, optimized
 * for sidebar nav at 16px rendered size.
 */

export type IconName =
  | 'trigger'
  | 'phrases'
  | 'skins'
  | 'animation'
  | 'sounds'
  | 'theme'
  | 'stats'
  | 'plus'
  | 'search'
  | 'close'
  | 'trash';

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

  // Skins: T-shirt (wearable appearance / skin customization)
  skins: (
    <path
      d="M7 3.5L3.5 5.25L2.5 8.75L5.4 10L6.2 8.5V16.5H13.8V8.5L14.6 10L17.5 8.75L16.5 5.25L13 3.5C12.5 4.6 11.4 5.25 10 5.25C8.6 5.25 7.5 4.6 7 3.5Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
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

  plus: (
    <path d="M10 3.5V16.5M3.5 10H16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  ),

  search: (
    <>
      <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12.25 12.25L16.5 16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),

  close: (
    <path d="M4.5 4.5L15.5 15.5M15.5 4.5L4.5 15.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  ),

  trash: (
    <>
      <path d="M4 6H16M7.5 3.5H12.5L13.5 6M6 6L6.75 16.5H13.25L14 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 9V13.5M11.5 9V13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
};
