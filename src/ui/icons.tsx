// Контурные иконки из макетов (24×24, stroke = currentColor). Декоративные — aria-hidden.
import type { ReactNode } from 'react';

type P = { size?: number; strokeWidth?: number };

function Svg({ size = 22, strokeWidth = 1.7, children }: P & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: P) => (
  <Svg {...p}>
    <path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
  </Svg>
);
export const IconTarget = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </Svg>
);
/** Шлем — «Пилоты» (макет Drivers). */
export const IconHelmet = (p: P) => (
  <Svg {...p}>
    <path d="M4 16a8 8 0 0 1 16 0v3H4z" />
    <path d="M4 14h16M9 10h6" />
  </Svg>
);
export const IconBars = (p: P) => (
  <Svg {...p}>
    <path d="M5 20V11M12 20V4M19 20v-6" />
  </Svg>
);
export const IconFlag = (p: P) => (
  <Svg {...p}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </Svg>
);
export const IconCalendar = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="15" rx="3" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </Svg>
);
export const IconLayers = (p: P) => (
  <Svg {...p}>
    <path d="m12 3 9 5-9 5-9-5z" />
    <path d="m3 13 9 5 9-5" />
  </Svg>
);
export const IconUsers = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M17 14c2.5 0 4 1.8 4 4.5" />
  </Svg>
);
export const IconBook = (p: P) => (
  <Svg {...p}>
    <path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
    <path d="M8 17h10" />
  </Svg>
);
export const IconCrosshair = (p: P) => (
  <Svg {...p} strokeWidth={1.8}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
  </Svg>
);
export const IconGrid = (p: P) => (
  <Svg {...p} strokeWidth={2}>
    <path d="M4 9h16M4 15h16M9 4v16M15 4v16" />
  </Svg>
);
/** Бургер — открыть меню на сенсорных экранах. */
export const IconMenu = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);
export const IconFlagBold = (p: P) => (
  <Svg {...p} strokeWidth={2.4}>
    <path d="M5 20V5l14 3-14 4M5 12l14 3-14 5" />
  </Svg>
);
export const IconEye = (p: P) => (
  <Svg {...p} strokeWidth={1.8}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
export const IconWarn = (p: P) => (
  <Svg {...p} strokeWidth={1.8}>
    <path d="M12 4 2.5 20h19z" />
    <path d="M12 10v5M12 17.8v.2" />
  </Svg>
);
export const IconLock = (p: P) => (
  <Svg {...p} strokeWidth={1.6}>
    <rect x="5" y="10" width="14" height="10" rx="3" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Svg>
);
export const IconMail = (p: P) => (
  <Svg {...p} strokeWidth={1.6}>
    <path d="M4 6h16v12H4z" />
    <path d="m4 7 8 6 8-6" />
  </Svg>
);
export const IconClock = (p: P) => (
  <Svg {...p} strokeWidth={1.8}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);
export const IconBack = (p: P) => (
  <Svg {...p} strokeWidth={1.8}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p} strokeWidth={2.6}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);
