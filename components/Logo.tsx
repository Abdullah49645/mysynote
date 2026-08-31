"use client";

/**
 * The note glyph stands in for the "s" in "Mysynote" — sized and baseline-
 * aligned to sit inline with the surrounding letters. It's the one place in
 * the UI that gets a persistent, deliberate animation (a slow pendulum sway,
 * like a VU needle at rest) — everywhere else motion only answers something
 * the person did.
 */
function NoteGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="note-sway"
      style={{ transformOrigin: "50% 85%" }}
      aria-hidden
    >
      <defs>
        <filter id="noteGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#noteGlow)">
        <path d="M15.5 3v11.1a3.6 3.6 0 1 0 1.6 3V6.8l3.4-1.1V3.9L15.5 3Z" fill="#ffb84f" />
        <ellipse cx="13.6" cy="17.1" rx="3.4" ry="2.6" fill="#ffb84f" />
      </g>
    </svg>
  );
}

export default function Logo({ size = "text-lg" }: { size?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-0 font-display font-semibold tracking-tight text-studio-text ${size}`}>
      <span>My</span>
      <span className="relative mx-[1px] inline-flex translate-y-[3px]">
        <NoteGlyph size={size === "text-lg" ? 20 : 28} />
      </span>
      <span>ynote</span>
    </span>
  );
}
