// Extremely subtle "premium enterprise" backdrop for the auth page —
// faint ledger/invoice/chart/inventory/data-node watermark shapes, masked
// so they're strongest at the edges and fade out behind the login card.
// Deliberately much calmer than the landing page hero: this exists to keep
// the auth screen from feeling like bare white, not to compete with the form.
export function AuthWatermark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Weak near the center (where the login card sits), stronger at the edges */}
        <radialGradient id="auth-bg-center-fade" cx="0.5" cy="0.46" r="0.62">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.12" />
          <stop offset="45%" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="75%" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#fff" stopOpacity="1" />
        </radialGradient>
        <mask id="auth-bg-center-mask">
          <rect width="1200" height="800" fill="url(#auth-bg-center-fade)" />
        </mask>
        <filter id="auth-bg-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
      </defs>

      <g mask="url(#auth-bg-center-mask)">
        <g filter="url(#auth-bg-soft)" fill="none">
          {/* ── Top-left: faint invoice / ledger card ── */}
          <g stroke="#4F46E5" strokeOpacity="0.5" strokeWidth="1.5">
            <rect x="70" y="70" width="200" height="140" rx="14" />
            <line x1="94" y1="104" x2="206" y2="104" strokeWidth="6" />
          </g>
          <g stroke="#64748B" strokeOpacity="0.4" strokeWidth="4" strokeLinecap="round">
            <line x1="94" y1="130" x2="246" y2="130" />
            <line x1="94" y1="150" x2="226" y2="150" />
            <line x1="94" y1="170" x2="200" y2="170" />
          </g>

          {/* ── Accounting ledger grid, below the invoice card ── */}
          <g stroke="#94A3B8" strokeOpacity="0.35" strokeWidth="1.5">
            <line x1="60" y1="270" x2="360" y2="270" />
            <line x1="60" y1="300" x2="360" y2="300" />
            <line x1="60" y1="330" x2="360" y2="330" />
            <line x1="60" y1="360" x2="360" y2="360" />
            <line x1="150" y1="255" x2="150" y2="375" />
            <line x1="255" y1="255" x2="255" y2="375" />
          </g>

          {/* ── Top-right: tiny analytics chart ── */}
          <g>
            <rect x="900" y="70" width="230" height="150" rx="14" stroke="#3B82F6" strokeOpacity="0.5" strokeWidth="1.5" />
            <g fill="#3B82F6" fillOpacity="0.35">
              <rect x="922" y="168" width="20" height="30" rx="3" />
              <rect x="954" y="150" width="20" height="48" rx="3" />
              <rect x="986" y="126" width="20" height="72" rx="3" />
              <rect x="1018" y="104" width="20" height="94" rx="3" />
            </g>
            <polyline points="922,166 954,148 986,124 1018,102 1046,88" stroke="#3B82F6" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </g>

          {/* ── Bottom-left: inventory boxes ── */}
          <g fill="#7C3AED" fillOpacity="0.28">
            <rect x="70" y="640" width="60" height="56" rx="8" />
            <rect x="142" y="628" width="66" height="68" rx="8" />
            <rect x="220" y="646" width="52" height="50" rx="8" />
            <rect x="284" y="632" width="60" height="64" rx="8" />
          </g>
          <g stroke="#7C3AED" strokeOpacity="0.4" strokeWidth="1.2">
            <line x1="70" y1="640" x2="130" y2="640" />
            <line x1="142" y1="628" x2="208" y2="628" />
            <line x1="220" y1="646" x2="272" y2="646" />
            <line x1="284" y1="632" x2="344" y2="632" />
          </g>

          {/* ── Bottom-right: faint AI / data nodes ── */}
          <g fill="#7C3AED" fillOpacity="0.4">
            <circle cx="900" cy="660" r="4" />
            <circle cx="960" cy="620" r="3" />
            <circle cx="1020" cy="672" r="3.5" />
            <circle cx="1080" cy="630" r="3" />
            <circle cx="1120" cy="700" r="4" />
          </g>
          <g stroke="#7C3AED" strokeOpacity="0.28" strokeWidth="1">
            <line x1="900" y1="660" x2="960" y2="620" />
            <line x1="960" y1="620" x2="1020" y2="672" />
            <line x1="1020" y1="672" x2="1080" y2="630" />
            <line x1="1080" y1="630" x2="1120" y2="700" />
          </g>

          {/* ── Faint dashboard geometry, upper-middle, well behind the card ── */}
          <g stroke="#94A3B8" strokeOpacity="0.3" strokeWidth="1.5">
            <rect x="500" y="40" width="200" height="60" rx="10" />
            <line x1="520" y1="60" x2="600" y2="60" strokeWidth="4" strokeOpacity="0.4" />
            <line x1="520" y1="76" x2="660" y2="76" strokeWidth="3" strokeOpacity="0.3" />
          </g>
        </g>
      </g>
    </svg>
  );
}
