import { useEffect, useMemo, useRef, useState } from "react";
import { formatDayTime, formatPrice, formatPriceCompact } from "../lib/format";

const PAD = { top: 18, right: 18, bottom: 30, left: 60 };
const HEIGHT = 250;
const SERIES = "#3a6ea5"; // matches --primary in index.css

// Builds a padded y-domain. A flat series (every scrape returned the same
// price) would otherwise collapse to a zero-height band, so it gets a nominal
// spread around the value instead. The lower bound never crosses zero, because
// a negative axis tick on a price chart reads as a real value.
function yDomain(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = min === max ? Math.max(1, Math.abs(min) * 0.05) : (max - min) * 0.12;
  const lower = min >= 0 ? Math.max(0, min - pad) : min - pad;
  return [lower, max + pad];
}

function niceTicks([min, max], count = 4) {
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

export default function PriceChart({ points }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState(null);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const next = entry.contentRect.width;
      if (next > 0) setWidth(next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const chart = useMemo(() => {
    if (!points.length) return null;

    const innerW = Math.max(width - PAD.left - PAD.right, 10);
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const domain = yDomain(points.map((p) => p.price));
    const [minY, maxY] = domain;

    const times = points.map((p) => p.time);
    const minX = Math.min(...times);
    const maxX = Math.max(...times);
    const spanX = maxX - minX;

    const x = (time) =>
      // A single point — or several sharing one timestamp — has no span to
      // scale across, so it is centred rather than pinned to the left edge.
      spanX === 0 ? PAD.left + innerW / 2 : PAD.left + ((time - minX) / spanX) * innerW;
    const y = (price) => PAD.top + innerH - ((price - minY) / (maxY - minY)) * innerH;

    const placed = points.map((p, index) => ({ ...p, index, cx: x(p.time), cy: y(p.price) }));
    const line = placed.map((p, i) => `${i === 0 ? "M" : "L"}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(" ");
    const baseline = PAD.top + innerH;
    const area =
      placed.length > 1
        ? `${line} L${placed[placed.length - 1].cx.toFixed(1)},${baseline} L${placed[0].cx.toFixed(1)},${baseline} Z`
        : null;

    return { placed, line, area, ticks: niceTicks(domain), baseline, innerW };
  }, [points, width]);

  if (!chart) return null;

  const { placed, line, area, ticks, baseline, innerW } = chart;
  const last = placed[placed.length - 1];
  const activePoint = active === null ? null : placed[active];
  const showDots = placed.length <= 40;

  const pickNearest = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    let nearest = 0;
    let best = Infinity;
    placed.forEach((p, index) => {
      const distance = Math.abs(p.cx - pointerX);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    });
    setActive(nearest);
  };

  const onKeyDown = (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setActive((current) => {
      const start = current === null ? placed.length - 1 : current;
      const next = event.key === "ArrowLeft" ? start - 1 : start + 1;
      return Math.min(Math.max(next, 0), placed.length - 1);
    });
  };

  // Keep the readout inside the plot rather than letting it run off an edge.
  const tooltipLeft = activePoint
    ? Math.min(Math.max(activePoint.cx, PAD.left + 70), PAD.left + innerW - 70)
    : 0;
  // A point near the top has no room for a readout above it, where it would
  // escape the chart and cover the tabs, so it flips underneath instead.
  const tooltipBelow = activePoint ? activePoint.cy < 62 : false;

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg
        className="chart-svg"
        width={width}
        height={HEIGHT}
        role="img"
        tabIndex={0}
        aria-label={`Price history: ${placed.length} recorded ${placed.length === 1 ? "point" : "points"}, latest ${formatPrice(last.price)}`}
        onPointerMove={pickNearest}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(placed.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKeyDown}
      >
        {ticks.map((tick) => {
          const ty = PAD.top + (HEIGHT - PAD.top - PAD.bottom) * (1 - (tick - ticks[0]) / (ticks[ticks.length - 1] - ticks[0]));
          return (
            <g key={tick}>
              <line className="chart-grid" x1={PAD.left} x2={PAD.left + innerW} y1={ty} y2={ty} />
              <text className="chart-axis-label" x={PAD.left - 10} y={ty + 4} textAnchor="end">
                {formatPriceCompact(tick)}
              </text>
            </g>
          );
        })}

        {area && <path d={area} fill={SERIES} fillOpacity="0.1" />}
        {placed.length > 1 && (
          <path className="chart-line" d={line} fill="none" stroke={SERIES} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {showDots &&
          placed.map((p) => (
            <circle
              key={p.index}
              cx={p.cx}
              cy={p.cy}
              r={activePoint?.index === p.index ? 5 : 3.5}
              fill={SERIES}
              stroke="#fff"
              strokeWidth="2"
            />
          ))}

        {activePoint && (
          <line className="chart-crosshair" x1={activePoint.cx} x2={activePoint.cx} y1={PAD.top} y2={baseline} />
        )}

        <text className="chart-axis-label" x={placed[0].cx} y={HEIGHT - 10} textAnchor="start">
          {formatDayTime(placed[0].raw)}
        </text>
        {placed.length > 1 && (
          <text className="chart-axis-label" x={last.cx} y={HEIGHT - 10} textAnchor="end">
            {formatDayTime(last.raw)}
          </text>
        )}
      </svg>

      {activePoint && (
        <div
          className={tooltipBelow ? "chart-tooltip chart-tooltip-below" : "chart-tooltip"}
          style={{ left: tooltipLeft, top: activePoint.cy + (tooltipBelow ? 16 : -16) }}
        >
          <strong>{formatPrice(activePoint.price)}</strong>
          <span>{formatDayTime(activePoint.raw)}</span>
        </div>
      )}
    </div>
  );
}
