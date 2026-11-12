import type { ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';

/** Diagramfärger per tema. Serie­färgerna (#0284c7, #65a30d) fungerar mot både mörk och ljus yta. */
const PALETTES = {
  dark: { run: '#0284c7', gym: '#65a30d', ref: '#8b98a8', grid: '#2a3442', axis: '#8b98a8', panel: '#141a22', panel2: '#1c2430', ink: '#e6edf3' },
  light: { run: '#0284c7', gym: '#65a30d', ref: '#6b7787', grid: '#d5dce5', axis: '#5b6677', panel: '#ffffff', panel2: '#ffffff', ink: '#0f172a' },
};

/** Aktuella färger (uppdateras av setChartTheme; diagrammen ritas om när temat byts). */
export const C = { ...PALETTES.dark };
export const axisProps = { stroke: C.grid, tick: { fill: C.axis, fontSize: 11 }, tickLine: false, axisLine: false };
export const tooltipProps = {
  contentStyle: { background: C.panel2, border: `1px solid ${C.grid}`, borderRadius: 12, color: C.ink, fontSize: 13 },
  labelStyle: { color: C.axis },
  itemStyle: { color: C.ink },
  cursor: { stroke: C.ref, strokeWidth: 1, fill: 'rgba(139,152,168,0.08)' },
};

export function setChartTheme(t: 'dark' | 'light') {
  Object.assign(C, PALETTES[t]);
  axisProps.stroke = C.grid;
  axisProps.tick.fill = C.axis;
  Object.assign(tooltipProps.contentStyle, { background: C.panel2, border: `1px solid ${C.grid}`, color: C.ink });
  tooltipProps.labelStyle.color = C.axis;
  tooltipProps.itemStyle.color = C.ink;
  tooltipProps.cursor.stroke = C.ref;
}

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
