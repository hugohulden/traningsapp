/** Enkla linjeikoner för menyn. */
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const Icons = {
  idag: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" {...P}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  plan: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" {...P}>
      <rect x="3" y="4.5" width="18" height="16" rx="3" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    </svg>
  ),
  stat: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" {...P}>
      <path d="M4 20V11M10 20V5M16 20v-6M22 20H2" />
    </svg>
  ),
  kropp: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" {...P}>
      <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />
    </svg>
  ),
  mer: (
    <svg viewBox="0 0 24 24" className="h-6 w-6" {...P}>
      <circle cx="5" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="19" cy="12" r="1.3" />
    </svg>
  ),
};
