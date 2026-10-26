import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DataVMap from './DataVMap';
import { createBoundaryProjection, geometryPath, type BoundaryCollection } from './datavGeometry';
import type { MapPoints } from './types';

const boundary: BoundaryCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: '陕西省', adcode: 610000, center: [108, 35] },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [105, 32],
            [111, 32],
            [111, 37],
            [105, 37],
            [105, 32],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { name: '台湾省', adcode: 710000, center: [121, 24] },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [120, 22],
              [122, 22],
              [122, 25],
              [120, 25],
              [120, 22],
            ],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [110, 3.4],
              [111, 3.4],
              [111, 5],
              [110, 5],
              [110, 3.4],
            ],
          ],
        ],
      },
    },
  ],
};
const config = {
  provider: 'datav' as const,
  configured: true,
  js_key: '',
  attribution: 'DataV',
  review_number: '',
  publication_approved: false,
};
beforeEach(() =>
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(boundary), {
          status: 200,
          headers: { 'Content-Type': 'application/geo+json' },
        }),
    ),
  ),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('renders DataV without a key and selects a province', async () => {
  const onProvince = vi.fn();
  render(
    <DataVMap
      config={config}
      points={{ points: [], unresolved_count: 441 }}
      province=""
      county=""
      onProvince={onProvince}
      onSelect={() => {}}
    />,
  );
  const shaanxi = await screen.findByRole('button', { name: '筛选陕西省' });
  expect(screen.getByRole('button', { name: '筛选台湾省' })).toBeTruthy();
  fireEvent.click(shaanxi);
  expect(onProvince).toHaveBeenCalledWith('陕西省');
  expect(fetch).toHaveBeenCalledWith('/api/map-boundary', expect.anything());
  const group = document.querySelector('svg.datav-svg > g')!;
  const initial = group.getAttribute('transform');
  expect(initial).toContain('scale(1.65)');
  fireEvent.click(screen.getByRole('button', { name: '放大地图' }));
  expect(group.getAttribute('transform')).not.toBe(initial);
  fireEvent.click(screen.getByRole('button', { name: '恢复默认视角' }));
  expect(group.getAttribute('transform')).toBe(initial);
  fireEvent.click(screen.getByRole('button', { name: '查看完整全国地图' }));
  expect(group.getAttribute('transform')).toBe('translate(0 0) scale(1)');
  expect(document.querySelectorAll('path.datav-province')).toHaveLength(3);
  expect(document.querySelectorAll('.map-overview path')).toHaveLength(3);
});

it('fits all geometry including the unnamed southern feature without modifying coordinates', () => {
  const original = JSON.stringify(boundary);
  const project = createBoundaryProjection(boundary);
  for (const point of [
    [105, 37],
    [122, 25],
    [110, 3.4],
  ] as [number, number][]) {
    const [x, y] = project(point);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(900);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(650);
  }
  expect(geometryPath(boundary.features[1].geometry, project)).toMatch(/^M.*Z$/);
  expect(JSON.stringify(boundary)).toBe(original);
});

it('shows one bubble per matched province even without county coordinates and filters on click', async () => {
  const onProvince = vi.fn();
  const points: MapPoints = {
    points: [],
    unresolved_count: 12,
    total_count: 12,
    province_aggregates: [
      {
        province: '陕西省',
        record_count: 9,
        estimated_count: 5,
        sourced_count: 2,
        verified_count: 1,
        pending_count: 1,
      },
      {
        province: '台湾省',
        record_count: 2,
        estimated_count: 2,
        sourced_count: 0,
        verified_count: 0,
        pending_count: 0,
      },
      {
        province: '跨省记录',
        record_count: 1,
        estimated_count: 1,
        sourced_count: 0,
        verified_count: 0,
        pending_count: 0,
      },
    ],
  };
  const { rerender } = render(
    <DataVMap
      config={config}
      points={points}
      province=""
      county=""
      onProvince={onProvince}
      onSelect={() => {}}
    />,
  );
  const bubble = await screen.findByRole('button', { name: '陕西省省级汇总，9条水果记录' });
  expect(document.querySelectorAll('.province-bubble')).toHaveLength(2);
  expect(screen.getByText('已汇总 11 / 12 条 · 1 条产区待归属')).toBeTruthy();
  const radius = Number(bubble.querySelector('.bubble-fill')!.getAttribute('r'));
  const smaller = screen.getByRole('button', { name: '台湾省省级汇总，2条水果记录' });
  expect(radius).toBeGreaterThan(Number(smaller.querySelector('.bubble-fill')!.getAttribute('r')));
  fireEvent.mouseEnter(bubble);
  expect(screen.getByRole('tooltip').textContent).toContain('估算 5');
  expect(screen.getByRole('tooltip').textContent).toContain('已核验 1');
  fireEvent.click(bubble);
  expect(onProvince).toHaveBeenCalledWith('陕西省');
  fireEvent.mouseLeave(bubble);
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.keyDown(smaller, { key: 'Enter' });
  expect(onProvince).toHaveBeenLastCalledWith('台湾省');
  const filtered: MapPoints = {
    ...points,
    total_count: 1,
    province_aggregates: [
      {
        ...points.province_aggregates![0],
        record_count: 1,
        estimated_count: 1,
        sourced_count: 0,
        verified_count: 0,
        pending_count: 0,
      },
    ],
  };
  rerender(
    <DataVMap
      config={config}
      points={filtered}
      province="陕西省"
      county=""
      onProvince={onProvince}
      onSelect={() => {}}
    />,
  );
  expect(
    screen
      .getByRole('button', { name: '陕西省省级汇总，1条水果记录' })
      .classList.contains('selected'),
  ).toBe(true);
  expect(document.querySelectorAll('.province-bubble')).toHaveLength(1);
  expect(screen.getByText('已汇总 1 / 1 条')).toBeTruthy();
});
