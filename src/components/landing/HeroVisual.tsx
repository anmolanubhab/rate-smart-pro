// Soft, abstract "intelligent business" scene for the hero background —
// inventory shelves, a floating invoice card, a mini analytics card and
// faint AI data nodes. Deliberately not photographic: everything is
// low-opacity, blurred and masked so it reads as ambient texture behind
// the product, not a literal illustration competing with the copy.
export function HeroVisual({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1000 800"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Fades the whole scene out toward the left so hero copy stays on clean white */}
        <linearGradient id="rd-hero-left-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="26%" stopColor="#fff" stopOpacity="0.12" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="72%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0.9" />
        </linearGradient>
        {/* Fades the scene out toward the bottom of the hero */}
        <linearGradient id="rd-hero-bottom-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="58%" stopColor="#fff" stopOpacity="1" />
          <stop offset="84%" stopColor="#fff" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        {/* Rounds off every other edge (top/right) so there's no visible box */}
        <radialGradient id="rd-hero-edge-fade" cx="0.66" cy="0.34" r="0.85">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0.92" />
          <stop offset="80%" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="rd-hero-left-mask"><rect width="1000" height="800" fill="url(#rd-hero-left-fade)" /></mask>
        <mask id="rd-hero-bottom-mask"><rect width="1000" height="800" fill="url(#rd-hero-bottom-fade)" /></mask>
        <mask id="rd-hero-edge-mask"><rect width="1000" height="800" fill="url(#rd-hero-edge-fade)" /></mask>
        <filter id="rd-hero-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.3" />
        </filter>
      </defs>

      <g mask="url(#rd-hero-edge-mask)">
        <g mask="url(#rd-hero-left-mask)">
          <g mask="url(#rd-hero-bottom-mask)">
            <g filter="url(#rd-hero-soft)">
              {/* ── Inventory shelves ── */}
              <g stroke="#94A3B8" strokeOpacity="0.22" strokeWidth="2">
                <line x1="390" y1="150" x2="960" y2="150" />
                <line x1="390" y1="360" x2="960" y2="360" />
                <line x1="390" y1="565" x2="960" y2="565" />
              </g>
              {[
                { x: 405, y: 96, w: 58, h: 52, c: "#4F46E5" },
                { x: 478, y: 84, w: 66, h: 64, c: "#7C3AED" },
                { x: 560, y: 100, w: 50, h: 48, c: "#60A5FA" },
                { x: 626, y: 88, w: 62, h: 60, c: "#4F46E5" },
                { x: 704, y: 102, w: 54, h: 46, c: "#7C3AED" },
                { x: 774, y: 86, w: 60, h: 62, c: "#60A5FA" },
                { x: 850, y: 98, w: 52, h: 50, c: "#4F46E5" },
                { x: 415, y: 300, w: 60, h: 58, c: "#7C3AED" },
                { x: 492, y: 288, w: 52, h: 70, c: "#60A5FA" },
                { x: 562, y: 302, w: 66, h: 56, c: "#4F46E5" },
                { x: 646, y: 292, w: 56, h: 66, c: "#7C3AED" },
                { x: 720, y: 304, w: 60, h: 54, c: "#60A5FA" },
                { x: 800, y: 290, w: 54, h: 68, c: "#4F46E5" },
                { x: 440, y: 500, w: 58, h: 62, c: "#60A5FA" },
                { x: 516, y: 494, w: 64, h: 68, c: "#4F46E5" },
                { x: 598, y: 502, w: 52, h: 60, c: "#7C3AED" },
                { x: 668, y: 492, w: 60, h: 70, c: "#60A5FA" },
                { x: 746, y: 504, w: 56, h: 58, c: "#4F46E5" },
              ].map((b, i) => (
                <g key={i}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="8" fill={b.c} fillOpacity="0.14" />
                  <rect x={b.x} y={b.y} width={b.w} height={Math.max(8, b.h * 0.22)} rx="6" fill={b.c} fillOpacity="0.16" />
                </g>
              ))}

              {/* ── Floating invoice / document card ── */}
              <g transform="translate(650,58) rotate(-6)">
                <rect width="230" height="152" rx="18" fill="#ffffff" fillOpacity="0.85" stroke="#4F46E5" strokeOpacity="0.28" strokeWidth="1.5" />
                <rect x="18" y="18" width="130" height="14" rx="5" fill="#4F46E5" fillOpacity="0.24" />
                <rect x="18" y="50" width="180" height="9" rx="4.5" fill="#64748B" fillOpacity="0.2" />
                <rect x="18" y="70" width="150" height="9" rx="4.5" fill="#64748B" fillOpacity="0.16" />
                <rect x="18" y="90" width="110" height="9" rx="4.5" fill="#64748B" fillOpacity="0.14" />
                <circle cx="196" cy="122" r="16" fill="#10B981" fillOpacity="0.16" />
                <path d="M188 122 l6 6 l12 -13" fill="none" stroke="#10B981" strokeOpacity="0.55" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </g>

              {/* ── Floating analytics card ── */}
              <g transform="translate(372,468) rotate(4)">
                <rect width="212" height="150" rx="18" fill="#ffffff" fillOpacity="0.85" stroke="#7C3AED" strokeOpacity="0.26" strokeWidth="1.5" />
                <rect x="22" y="98" width="24" height="32" rx="4" fill="#7C3AED" fillOpacity="0.22" />
                <rect x="58" y="82" width="24" height="48" rx="4" fill="#7C3AED" fillOpacity="0.26" />
                <rect x="94" y="64" width="24" height="66" rx="4" fill="#7C3AED" fillOpacity="0.3" />
                <rect x="130" y="44" width="24" height="86" rx="4" fill="#7C3AED" fillOpacity="0.34" />
                <polyline points="30,96 70,78 106,58 142,38 172,26" fill="none" stroke="#4F46E5" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {[[30, 96], [106, 58], [172, 26]].map(([cx, cy], i) => (
                  <circle key={i} cx={cx} cy={cy} r="3.5" fill="#4F46E5" fillOpacity="0.55" />
                ))}
              </g>

              {/* ── Ambient AI data nodes ── */}
              <g fill="#7C3AED" fillOpacity="0.32">
                <circle cx="540" cy="60" r="3.5" />
                <circle cx="612" cy="34" r="3" />
                <circle cx="900" cy="70" r="4" />
                <circle cx="944" cy="150" r="3" />
                <circle cx="520" cy="220" r="3" />
                <circle cx="960" cy="260" r="3.5" />
              </g>
              <g stroke="#7C3AED" strokeOpacity="0.15" strokeWidth="1">
                <line x1="540" y1="60" x2="612" y2="34" />
                <line x1="612" y1="34" x2="900" y2="70" />
                <line x1="900" y1="70" x2="944" y2="150" />
                <line x1="520" y1="220" x2="944" y2="150" />
                <line x1="944" y1="150" x2="960" y2="260" />
              </g>
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
