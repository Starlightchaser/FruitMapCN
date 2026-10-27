import { useMemo } from 'react';
import { placeProvinceBubbles, type ProvinceBubble } from './provinceBubbles';
import type { Coordinate } from './datavGeometry';

export default function ProvinceBubbleLayer({
  bubbles,
  project,
  view,
  selected,
  onSelect,
  onHover,
}: {
  bubbles: ProvinceBubble[];
  project: (point: Coordinate) => Coordinate;
  view: { scale: number; x: number; y: number };
  selected: string;
  onSelect?: (province: string) => void;
  onHover: (bubble: ProvinceBubble | null) => void;
}) {
  const placed = useMemo(
    () => placeProvinceBubbles(bubbles, project, view),
    [bubbles, project, view],
  );
  return (
    <g className="province-bubbles" aria-label="按省汇总的水果记录气泡">
      {placed.map((bubble) => (
        <g key={bubble.province} className="province-bubble-leader" aria-hidden="true">
          {Math.hypot(bubble.x - bubble.anchorX, bubble.y - bubble.anchorY) > 8 && (
            <>
              <line x1={bubble.anchorX} y1={bubble.anchorY} x2={bubble.x} y2={bubble.y} />
              <circle cx={bubble.anchorX} cy={bubble.anchorY} r={2} />
            </>
          )}
        </g>
      ))}
      {placed.map((bubble) => (
        <g
          key={bubble.province}
          transform={`translate(${bubble.x} ${bubble.y})`}
          className={`province-bubble ${selected === bubble.province ? 'selected' : ''}`}
          data-level="province"
          data-record-count={bubble.record_count}
          role="button"
          tabIndex={0}
          aria-label={`${bubble.province}省级汇总，${bubble.record_count}条水果记录`}
          onClick={(event) => {
            event.stopPropagation();
            onSelect?.(bubble.province);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              onSelect?.(bubble.province);
            }
          }}
          onMouseEnter={() => onHover(bubble)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover(bubble)}
          onBlur={() => onHover(null)}
        >
          <title>{`${bubble.province} · 省级汇总\n${bubble.record_count}条记录，其中${bubble.estimated_count}条月份估算\n点击查看该省水果`}</title>
          <circle className="bubble-halo" r={bubble.radius + 5} />
          <circle className="bubble-fill" r={bubble.radius} />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={bubble.radius >= 20 ? 14 : 11}
          >
            {bubble.record_count}
          </text>
        </g>
      ))}
    </g>
  );
}
