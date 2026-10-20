import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// Лёгкие SVG-графики без библиотек: колонки (одна или несколько серий) и линия.
// Метки — токены текста, марки — цвета серий; подсказка по наведению/касанию.

const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });
export const fmtCompact = (n: number) => compact.format(n);

export interface Series {
  name: string;
  /** CSS-переменная цвета серии, например var(--series-1) */
  color: string;
  values: number[];
}

interface ChartProps {
  labels: string[];
  series: Series[];
  /** Подписи под осью X; по умолчанию — labels */
  ticks?: string[];
  height?: number;
  format: (n: number) => string;
  /** Заголовок и строки подсказки для столбца i */
  tooltip: (i: number) => { title: string; rows: ReactNode[] };
  ariaLabel: string;
}

interface Pad {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// Ширина символа подписи оси (шрифт 11px) — отступ слева подбирается под самую длинную подпись
const AXIS_CHAR_W = 6.4;

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** «Красивый» верх шкалы и деления. */
function niceScale(max: number) {
  if (max <= 0) return { top: 1, ticks: [0] };
  const step0 = max / 4;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0)!;
  const top = step * Math.ceil(max / step);
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
}

/** Общая геометрия: шкала, отступы и ширина полосы на одну категорию. */
function useLayout(props: ChartProps, width: number, height: number) {
  const scale = niceScale(Math.max(0, ...props.series.flatMap((s) => s.values)));
  const longest = Math.max(...scale.ticks.map((t) => props.format(t).length));
  const pad: Pad = { top: 12, right: 8, bottom: 24, left: Math.max(28, Math.ceil(longest * AXIS_CHAR_W) + 10) };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const bandW = innerW / props.labels.length;
  const y = (v: number) => pad.top + innerH - (v / scale.top) * innerH;
  return { scale, pad, innerW, innerH, bandW, y };
}

/** Колонка со скруглённым верхом 4px и прямым основанием. */
function columnPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function Axes({
  height,
  layout,
  ticks,
  format,
}: {
  height: number;
  layout: ReturnType<typeof useLayout>;
  ticks: string[];
  format: (n: number) => string;
}) {
  const { scale, pad, innerW, bandW, y } = layout;
  // Не больше одной подписи на ~44px по оси X
  const every = Math.ceil(ticks.length / Math.max(1, Math.floor(innerW / 44)));
  return (
    <>
      {scale.ticks.map((t) => (
        <g key={t}>
          <line className="grid" x1={pad.left} x2={pad.left + innerW} y1={y(t)} y2={y(t)} />
          <text className="axis" x={pad.left - 6} y={y(t)} dy="0.32em" textAnchor="end">
            {format(t)}
          </text>
        </g>
      ))}
      {ticks.map((t, i) =>
        i % every === 0 ? (
          <text key={i} className="axis" x={pad.left + bandW * (i + 0.5)} y={height - 6} textAnchor="middle">
            {t}
          </text>
        ) : null,
      )}
      <line className="baseline" x1={pad.left} x2={pad.left + innerW} y1={y(0)} y2={y(0)} />
    </>
  );
}

function HitAreas({ count, layout, height, onActive }: { count: number; layout: ReturnType<typeof useLayout>; height: number; onActive: (i: number) => void }) {
  const { pad, bandW } = layout;
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <rect
          key={i}
          className="viz-hit"
          x={pad.left + bandW * i}
          y={pad.top}
          width={bandW}
          height={height - pad.top}
          onPointerEnter={() => onActive(i)}
          onPointerDown={() => onActive(i)}
        />
      ))}
    </>
  );
}

function Tooltip({ x, width, title, rows }: { x: number; width: number; title: string; rows: ReactNode[] }) {
  // Подсказка встаёт сбоку от выбранной полосы, чтобы не закрывать её марки
  const side = x > width / 2 ? { right: width - x + 16 } : { left: x + 16 };
  return (
    <div className="viz-tip" style={side} role="status">
      <div className="viz-tip-title">{title}</div>
      {rows.map((r, i) => (
        <div key={i}>{r}</div>
      ))}
    </div>
  );
}

export function ColumnChart(props: ChartProps) {
  const { labels, series, ticks = labels, height = 200, format, tooltip, ariaLabel } = props;
  const { ref, width } = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const layout = useLayout(props, width, height);
  const { pad, innerH, bandW, y } = layout;
  const k = series.length;
  const gap = 2;
  const barW = Math.max(2, Math.min(24, (bandW * 0.7 - gap * (k - 1)) / k));
  const tip = active === null ? null : tooltip(active);

  return (
    <div className="viz" ref={ref} onPointerLeave={() => setActive(null)}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        <Axes height={height} layout={layout} ticks={ticks} format={format} />
        {active !== null && <rect className="viz-hover" x={pad.left + bandW * active} y={pad.top} width={bandW} height={innerH} />}
        {labels.map((_, i) => {
          const groupW = barW * k + gap * (k - 1);
          const x0 = pad.left + bandW * i + (bandW - groupW) / 2;
          return series.map((s, j) => (
            <path
              key={`${i}-${j}`}
              d={columnPath(x0 + j * (barW + gap), y(s.values[i]), barW, y(0) - y(s.values[i]))}
              fill={s.color}
            />
          ));
        })}
        <HitAreas count={labels.length} layout={layout} height={height} onActive={setActive} />
      </svg>
      {tip && active !== null && <Tooltip x={pad.left + bandW * (active + 0.5)} width={width} {...tip} />}
    </div>
  );
}

export function LineChart(props: ChartProps) {
  const { labels, series, ticks = labels, height = 180, format, tooltip, ariaLabel } = props;
  const { ref, width } = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const layout = useLayout(props, width, height);
  const { pad, bandW, y } = layout;
  const x = (i: number) => pad.left + bandW * (i + 0.5);
  const tip = active === null ? null : tooltip(active);

  return (
    <div className="viz" ref={ref} onPointerLeave={() => setActive(null)}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        <Axes height={height} layout={layout} ticks={ticks} format={format} />
        {active !== null && <line className="crosshair" x1={x(active)} x2={x(active)} y1={pad.top} y2={y(0)} />}
        {series.map((s) => (
          <g key={s.name}>
            <polyline
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.values.map((v, i) =>
              i === active || i === s.values.length - 1 ? (
                <circle key={i} className="viz-dot" cx={x(i)} cy={y(v)} r={4} fill={s.color} />
              ) : null,
            )}
          </g>
        ))}
        <HitAreas count={labels.length} layout={layout} height={height} onActive={setActive} />
      </svg>
      {tip && active !== null && <Tooltip x={x(active)} width={width} {...tip} />}
    </div>
  );
}

export function Legend({ series }: { series: Pick<Series, 'name' | 'color'>[] }) {
  return (
    <div className="legend">
      {series.map((s) => (
        <span key={s.name} className="legend-item">
          <span className="swatch" style={{ background: s.color }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}
