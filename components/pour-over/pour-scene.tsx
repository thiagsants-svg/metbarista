"use client";

/**
 * The brew, drawn: a gooseneck kettle tips and pours while water goes in, the
 * dripper fills and drains, drops fall and the server fills with the water
 * poured so far. Pure SVG with CSS animations (still when reduced motion is asked).
 */

export function PourScene({ pouring, dripping, water, target, kettleTemp = null }: {
  pouring: boolean;
  /** Water is passing through the bed (after a pour, before the brewer is lifted) */
  dripping: boolean;
  /** g poured so far */
  water: number;
  /** g the brew aims for (null: free pour) */
  target: number | null;
  /** The kettle's temperature, when it can be read (Devices page) */
  kettleTemp?: number | null;
}) {
  const full = Math.max(1, target ?? Math.max(250, water * 1.2));
  const k = Math.min(1, water / full);
  // Server: the drink lags behind the water poured; the dripper holds the rest for a while
  const serverLevel = Math.min(1, k * (pouring ? 0.7 : dripping ? 0.85 : 0.95));
  const slurry = pouring ? 0.85 : dripping ? 0.35 : 0;

  return (
    <svg viewBox="0 0 240 260" className="h-full w-full" role="img" aria-label={pouring ? "Pouring" : dripping ? "Dripping" : "Ready"}>
      <style>{`
        .po-stream { stroke-dasharray: 6 5; animation: po-flow .35s linear infinite; }
        @keyframes po-flow { to { stroke-dashoffset: -11; } }
        .po-drop { animation: po-fall .9s ease-in infinite; }
        .po-drop2 { animation-delay: .45s; }
        @keyframes po-fall { 0% { transform: translateY(0); opacity: 0; } 15% { opacity: 1; } 100% { transform: translateY(34px); opacity: 0; } }
        .po-kettle { transition: transform .6s cubic-bezier(.3,.7,.3,1); transform-origin: 60px 80px; }
        .po-level { transition: all .8s ease-out; }
        .po-steam { animation: po-steam 2.4s ease-in-out infinite; opacity: .0; }
        .po-steam2 { animation-delay: 1.2s; }
        @keyframes po-steam { 0% { transform: translateY(6px); opacity: 0; } 40% { opacity: .45; } 100% { transform: translateY(-14px); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .po-stream, .po-drop, .po-steam { animation: none; } }
      `}</style>

      {/* Kettle base (Stagg EKG Pro): its screen shows the kettle's own temperature when it can be read */}
      <rect x="10" y="112" width="76" height="9" rx="4.5" fill="var(--ink)" opacity=".75" />
      {kettleTemp != null && (
        <text x="48" y="133" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ink)" opacity=".75">{Math.round(kettleTemp)}°</text>
      )}

      {/* Kettle (Stagg EKG shape): flat squat body, flat lid with a knob, slim counterweight handle, thin gooseneck; tips while pouring */}
      <g className="po-kettle" style={{ transform: pouring ? "rotate(28deg)" : "rotate(0deg)" }}>
        <path d="M30 58 h50 q4 0 4.6 4 l4 40 q.6 8 -7.6 8 h-52 q-8.2 0 -7.6 -8 l4 -40 q.6 -4 4.6 -4 z" fill="var(--ink)" opacity=".9" />
        <rect x="34" y="52" width="42" height="7" rx="2" fill="var(--ink)" />
        <circle cx="55" cy="48" r="4" fill="var(--ink)" />
        {/* Handle: a thin bar behind the body, joined at the top and the bottom */}
        <path d="M28 64 h-10 l-6 38 h12" fill="none" stroke="var(--ink)" strokeOpacity=".9" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        {/* Gooseneck: leaves low on the body, climbs, ends in a fine tip */}
        <path d="M86 100 C108 100 110 74 114 58 C116 50 121 46 128 45" fill="none" stroke="var(--ink)" strokeOpacity=".9" strokeWidth="4" strokeLinecap="round" />
      </g>

      {/* Stream from the spout's tip to the bed */}
      {pouring && (
        <path className="po-stream" d="M136 82 Q134 102 130 122" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
      )}

      {/* Steam over the dripper */}
      {(pouring || dripping) && (
        <g stroke="var(--ink)" strokeOpacity=".35" strokeWidth="2" fill="none" strokeLinecap="round">
          <path className="po-steam" d="M112 112 q-4 -6 0 -12 q4 -6 0 -12" />
          <path className="po-steam po-steam2" d="M146 112 q-4 -6 0 -12 q4 -6 0 -12" />
        </g>
      )}

      {/* Dripper: cone, coffee bed, water over it */}
      <defs>
        <clipPath id="po-cone"><path d="M92 118 h76 l-28 52 h-20 z" /></clipPath>
        <clipPath id="po-server"><path d="M98 196 h64 v44 a10 10 0 0 1 -10 10 h-44 a10 10 0 0 1 -10 -10 z" /></clipPath>
      </defs>
      <g clipPath="url(#po-cone)">
        <rect x="88" y="150" width="84" height="22" fill="#6b4226" />
        <rect className="po-level" x="88" y={150 - 32 * slurry} width="84" height={32 * slurry} fill="#a8743f" opacity=".75" />
      </g>
      <path d="M90 118 h80 l-30 54 h-20 z" fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round" />
      <rect x="114" y="172" width="32" height="6" rx="2" fill="var(--ink)" opacity=".8" />

      {/* Drops into the server */}
      {(pouring || dripping) && (
        <g fill="#8a5a2b">
          <ellipse className="po-drop" cx="130" cy="182" rx="2.2" ry="3" />
          <ellipse className="po-drop po-drop2" cx="130" cy="182" rx="2.2" ry="3" />
        </g>
      )}

      {/* Server: fills with the drink */}
      <g clipPath="url(#po-server)">
        <rect className="po-level" x="96" y={250 - 54 * serverLevel} width="68" height={54 * serverLevel} fill="#7a4b22" />
      </g>
      <path d="M98 196 h64 v44 a10 10 0 0 1 -10 10 h-44 a10 10 0 0 1 -10 -10 z" fill="none" stroke="var(--ink)" strokeWidth="3" />
      <path d="M162 206 q14 2 12 16 q-2 10 -12 10" fill="none" stroke="var(--ink)" strokeWidth="3" />

      {/* The scale */}
      <rect x="70" y="252" width="120" height="6" rx="3" fill="var(--ink)" opacity=".5" />
    </svg>
  );
}
