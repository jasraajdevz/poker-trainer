/**
 * The room behind the table: a breathing spotlight keyed to the theme colour,
 * four huge suit glyphs drifting like smoke, and a vignette to pull the eye in.
 * Pure CSS, pointer-events-none, sits behind everything.
 */
export function Ambient() {
  const suits: Array<{ ch: string; style: React.CSSProperties }> = [
    { ch: '♠', style: { top: '6%', left: '4%', fontSize: '17rem', animationDelay: '0s' } },
    { ch: '♥', style: { top: '48%', right: '2%', fontSize: '14rem', animationDelay: '-8s' } },
    { ch: '♦', style: { bottom: '4%', left: '14%', fontSize: '12rem', animationDelay: '-15s' } },
    { ch: '♣', style: { top: '14%', right: '22%', fontSize: '10rem', animationDelay: '-21s' } },
  ];
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="ambient-spot absolute inset-0" />
      {suits.map((s, i) => (
        <span key={i} className="ambient-suit absolute font-serif" style={s.style}>
          {s.ch}
        </span>
      ))}
      <div className="ambient-vignette absolute inset-0" />
    </div>
  );
}
