import { ALL_HAND_CLASSES, Range, handClassName, isPairClass, isSuitedClass } from '../../engine/ranges';

export interface CellMark { loose: number; tight: number; right: number; }

/**
 * The 13x13 grid. Baseline range as the fill, your own answers as the overlay:
 * amber where you opened hands the chart folds, blue where you folded hands it
 * opens. The shape of your leak is literally the shape on this grid.
 */
export function RangeGrid({
  range, marks, size = 22,
}: {
  range: Range;
  marks?: Map<number, CellMark>;
  size?: number;
}) {
  return (
    <div
      className="inline-grid gap-px rounded-lg bg-emerald-950/60 p-1"
      style={{ gridTemplateColumns: `repeat(13, ${size}px)` }}
    >
      {ALL_HAND_CLASSES.map((hc) => {
        const inRange = range.has(hc);
        const m = marks?.get(hc);
        let bg = inRange ? 'bg-emerald-600/70' : 'bg-black/40';
        let ring = '';
        if (m) {
          if (m.loose > m.tight && m.loose > 0) { bg = 'bg-amber-500/70'; ring = 'ring-1 ring-amber-300'; }
          else if (m.tight > 0) { bg = 'bg-sky-500/70'; ring = 'ring-1 ring-sky-300'; }
        }
        const label = handClassName(hc);
        return (
          <div
            key={hc}
            title={`${label}${inRange ? ' — baseline opens' : ' — baseline folds'}${
              m ? ` · you: ${m.right} right, ${m.loose} too loose, ${m.tight} too tight` : ''}`}
            className={`flex items-center justify-center ${bg} ${ring} ${
              isPairClass(hc) ? 'font-bold' : ''}`}
            style={{ width: size, height: size, fontSize: size <= 20 ? 8 : 9 }}
          >
            <span className={inRange || m ? 'text-emerald-50' : 'text-emerald-200/25'}>
              {isSuitedClass(hc) || isPairClass(hc) ? label : label.slice(0, 2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function GridLegend() {
  const item = (cls: string, text: string) => (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${cls}`} />
      <span className="text-[11px] text-emerald-200/55">{text}</span>
    </span>
  );
  return (
    <div className="mt-2 flex flex-wrap gap-4">
      {item('bg-emerald-600/70', 'baseline opens')}
      {item('bg-black/40 border border-emerald-900', 'baseline folds')}
      {item('bg-amber-500/70', 'you opened, it folds')}
      {item('bg-sky-500/70', 'you folded, it opens')}
    </div>
  );
}
