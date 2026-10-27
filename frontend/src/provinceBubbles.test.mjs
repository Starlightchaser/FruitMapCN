// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createBoundaryProjection, defaultMapView } from './datavGeometry';
import { makeProvinceBubbles, placeProvinceBubbles } from './provinceBubbles';

const boundary = JSON.parse(readFileSync('../backend/assets/maps/datav-china.geojson', 'utf8'));
const summary = (province, record_count) => ({
  province,
  record_count,
  estimated_count: record_count,
  sourced_count: 0,
  verified_count: 0,
  pending_count: 0,
});

it('keeps source centers and boundaries intact and excludes unassigned/empty aggregates', () => {
  const before = JSON.stringify(boundary);
  const result = makeProvinceBubbles(boundary, [
    summary('陕西省', 20),
    summary('台湾省', 0),
    summary('四川、重庆', 2),
  ]);
  expect(result).toHaveLength(1);
  const feature = boundary.features.find((item) => item.properties.name === '陕西省');
  expect(result[0].center).toEqual(feature.properties.centroid || feature.properties.center);
  placeProvinceBubbles(result, createBoundaryProjection(boundary), { scale: 1, x: 0, y: 0 });
  expect(JSON.stringify(boundary)).toBe(before);
});

it('separates dense province annotations while retaining anchors and fixed sizes on zoom', () => {
  const aggregates = boundary.features.flatMap((feature) =>
    feature.properties.name ? [summary(feature.properties.name, 20)] : [],
  );
  const bubbles = makeProvinceBubbles(boundary, aggregates);
  const before = JSON.stringify(bubbles);
  const project = createBoundaryProjection(boundary);
  const placed = placeProvinceBubbles(bubbles, project, { scale: 1, x: 0, y: 0 });
  for (let i = 0; i < placed.length; i++) {
    const a = placed[i];
    expect([a.anchorX, a.anchorY]).toEqual(project(a.center));
    expect(a.x - a.radius).toBeGreaterThanOrEqual(0);
    expect(a.x + a.radius).toBeLessThanOrEqual(900);
    expect(a.y - a.radius).toBeGreaterThanOrEqual(0);
    expect(a.y + a.radius).toBeLessThanOrEqual(650);
    for (const b of placed.slice(i + 1))
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.radius + b.radius + 4.9);
  }
  const zoomed = placeProvinceBubbles(bubbles, project, { scale: 3, x: 10, y: -10 });
  expect(zoomed.map((b) => b.radius)).toEqual(placed.map((b) => b.radius));
  expect(JSON.stringify(bubbles)).toBe(before);
});

it('can separate bubbles sharing the same annotation center', () => {
  const bubbles = ['甲', '乙', '丙'].map((province) => ({
    ...summary(province, 1),
    center: [100, 30],
  }));
  const placed = placeProvinceBubbles(bubbles, () => [450, 325], { scale: 1, x: 0, y: 0 });
  for (let i = 0; i < placed.length; i++)
    for (const b of placed.slice(i + 1))
      expect(Math.hypot(placed[i].x - b.x, placed[i].y - b.y)).toBeGreaterThanOrEqual(62.9);
});

it('opens on the main fruit-growing regions with Taiwan and Hainan visible and keeps the full boundary intact', () => {
  const original = JSON.stringify(boundary);
  const project = createBoundaryProjection(boundary),
    view = defaultMapView(project);
  for (const province of ['台湾省', '海南省', '陕西省', '黑龙江省', '新疆维吾尔自治区']) {
    const feature = boundary.features.find((item) => item.properties.name === province);
    const [x, y] = project(feature.properties.centroid || feature.properties.center);
    expect(x * view.scale + view.x).toBeGreaterThan(0);
    expect(x * view.scale + view.x).toBeLessThan(900);
    expect(y * view.scale + view.y).toBeGreaterThan(0);
    expect(y * view.scale + view.y).toBeLessThan(650);
  }
  expect(JSON.stringify(boundary)).toBe(original);
});
