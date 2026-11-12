import type { ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';

/** Validerade färger mot mörk yta (#141a22). */
export const C = {
  run: '#0284c7',
  gym: '#65a30d',
  ref: '#8b98a8',
  grid: '#2a3442',
  axis: '#8b98a8',
};

export const axisProps = {
  stroke: C.grid,
  tick: { fill: C.axis, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export const tooltipProps = {
  contentStyle: { background: '#1c2430', border: '1px solid #2a3442', borderRadius: 12, color: '#e6edf3', fontSize: 13 },
  labelStyle: { color: '#8b98a8' },
  itemStyle: { color: '#e6edf3' },
  cursor: { stroke: '#8b98a8', strokeWidth: 1, fill: 'rgba(139,152,168,0.08)' },
} as const;

export function ChartBox({ title, children, legend, empty }: { title: string; children: ReactNode; legend?: ReactNode; empty?: boolean }) {
  return (
    <div className="rounded-2xl bg-panel border border-line p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="font-semibold">{title}</div>
        {legend}
      </div>
      {empty ? (
        <div className="h-40 flex items-center justify-center text-sm text-mute">Ingen data än</div>
      ) : (
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            {children as React.ReactElement}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1 text-xs text-mute">
      <span className="inline-block w-4" style={{ borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}` }} />
      {label}
    </span>
  );
}
