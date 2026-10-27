import type { BoundaryCollection, Coordinate } from './datavGeometry';
import type { ProvinceAggregate } from './types';

export interface ProvinceBubble extends ProvinceAggregate {
  center: Coordinate;
}
export interface PlacedProvinceBubble extends ProvinceBubble {
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
  radius: number;
}

export function makeProvinceBubbles(
  boundary: BoundaryCollection,
  aggregates: ProvinceAggregate[],
): ProvinceBubble[] {
  const centers = new Map(
    boundary.features.flatMap((feature) => {
      const center = feature.properties.centroid || feature.properties.center;
      return feature.properties.name && center ? [[feature.properties.name, center] as const] : [];
    }),
  );
  return aggregates.flatMap((aggregate) => {
    const center = centers.get(aggregate.province);
    return center && aggregate.record_count > 0 ? [{ ...aggregate, center }] : [];
  });
}

export function placeProvinceBubbles(
  bubbles: ProvinceBubble[],
  project: (point: Coordinate) => Coordinate,
  view: { scale: number; x: number; y: number },
): PlacedProvinceBubble[] {
  const maximum = Math.max(1, ...bubbles.map((bubble) => bubble.record_count));
  const placed = bubbles.map((bubble) => {
    const [px, py] = project(bubble.center);
    const anchorX = px * view.scale + view.x,
      anchorY = py * view.scale + view.y;
    return {
      ...bubble,
      anchorX,
      anchorY,
      x: anchorX,
      y: anchorY,
      radius: 10 + 19 * Math.sqrt(bubble.record_count / maximum),
    };
  });
  // Only annotation bubbles move to avoid collisions; leaders retain the exact source anchors.
  // Neither province geometry nor source centers are changed.
  for (let pass = 0; pass < 100; pass++) {
    let collision = false;
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i],
          b = placed[j];
        let dx = b.x - a.x,
          dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        const gap = a.radius + b.radius + 5;
        if (distance >= gap) continue;
        if (distance < 0.001) {
          dx = 1;
          dy = 0;
          distance = 1;
        }
        const push = (gap - distance) / 2;
        a.x -= (dx / distance) * push;
        a.y -= (dy / distance) * push;
        b.x += (dx / distance) * push;
        b.y += (dy / distance) * push;
        collision = true;
      }
    if (!collision) break;
  }
  return placed.sort((a, b) => b.radius - a.radius || a.province.localeCompare(b.province));
}
