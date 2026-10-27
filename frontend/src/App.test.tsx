import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { safeSource } from './api';
import { MapPanel } from './MapPanel';
import type { FruitRecord, MapPoint } from './types';

const sample: FruitRecord = {
  id: 1,
  category: '苹果',
  product_name: '测试苹果',
  full_origin: '测试省甲县',
  province: '测试省',
  city: '',
  county: '甲县',
  month_range_label: '9–10月（估算）',
  month_status: 'estimated',
  month_note: '按苹果常见成熟季估算，待当地核验',
  origin_source_name: '产地名录',
  geo_status: 'unresolved',
};
const point: MapPoint = {
  county_code: '999999',
  county: '甲县',
  province: '测试省',
  longitude: 100,
  latitude: 30,
  coordinate_system: 'CGCS2000',
  record_count: 2,
  estimated_count: 1,
  sourced_count: 1,
  verified_count: 0,
  pending_count: 0,
};
let urls: string[] = [];
beforeEach(() => {
  urls = [];
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      urls.push(input);
      const url = new URL(input, 'http://localhost');
      let data: unknown;
      if (url.pathname === '/api/auth/status') data = { private_mode: false, authenticated: true };
      else if (url.pathname === '/api/config')
        data = {
          map: {
            provider: 'disabled',
            configured: false,
            js_key: '',
            attribution: '',
            review_number: '',
            publication_approved: false,
          },
          environment: 'development',
        };
      else if (url.pathname === '/api/filters')
        data = {
          categories: ['苹果'],
          provinces: ['测试省'],
          counties: [{ province: '测试省', county: '甲县', count: 1 }],
          statuses: [],
        };
      else if (url.pathname === '/api/summary')
        data = {
          total: 1,
          categories: 1,
          counties: 1,
          estimated: 1,
          sourced: 0,
          verified: 0,
          pending: 0,
          resolved: 0,
          unresolved: 1,
          distribution: [{ category: '苹果', count: 1 }],
        };
      else if (url.pathname === '/api/map-points') data = { points: [], unresolved_count: 1 };
      else if (url.pathname === '/api/records/1')
        data = {
          ...sample,
          months: [9, 10],
          origin_source_url: 'https://example.org',
          source_status: '估算',
          source_note: '',
          month_source_name: '',
          month_source_url: '',
          updated_at: '2026-10-23',
          township_village: '',
        };
      else data = { items: [sample], total: 1, page: 1, page_size: 24, total_pages: 1 };
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('desktop atlas', () => {
  it('loads only page and aggregate endpoints and shows estimation evidence', async () => {
    render(<App />);
    await screen.findByRole('button', { name: '查看测试苹果详情' });
    expect(screen.getByText('按苹果常见成熟季估算，待当地核验')).toBeTruthy();
    expect(screen.getByText('月份为估算')).toBeTruthy();
    expect(urls.some((url) => url.includes('page_size=24'))).toBe(true);
    expect(urls.every((url) => url.startsWith('/api/'))).toBe(true);
  });
  it('changes month and county requests and resets to all year', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', { name: '查看测试苹果详情' });
    await user.click(screen.getByRole('button', { name: '10月' }));
    await waitFor(() =>
      expect(urls.some((url) => url.startsWith('/api/records?') && url.includes('month=10'))).toBe(
        true,
      ),
    );
    await user.selectOptions(screen.getByLabelText('县域'), JSON.stringify(['测试省', '甲县']));
    await waitFor(() =>
      expect(urls.some((url) => decodeURIComponent(url).includes('county=甲县'))).toBe(true),
    );
    await user.click(screen.getByRole('button', { name: '清除筛选' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '全年' }).getAttribute('aria-pressed')).toBe(
        'true',
      ),
    );
  });
  it('offers status filters and shows single record detail', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('button', { name: '查看测试苹果详情' });
    await user.click(screen.getByRole('button', { name: '更多筛选' }));
    await user.click(
      within(screen.getByRole('group', { name: '月份状态' })).getByRole('button', {
        name: '月份为估算',
      }),
    );
    await waitFor(() =>
      expect(urls.some((url) => url.includes('month_status=estimated'))).toBe(true),
    );
    await user.click(await screen.findByRole('button', { name: '查看测试苹果详情' }));
    expect(await screen.findByText('完整产地')).toBeTruthy();
    expect(screen.getByRole('link', { name: /产地名录/ }).getAttribute('href')).toBe(
      'https://example.org/',
    );
  });
  it('links province bubbles to records and summary while clearing the county filter', async () => {
    const original = window.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, ...args: unknown[]) => {
        const url = new URL(input, 'http://localhost');
        let data: unknown;
        if (url.pathname === '/api/config')
          data = {
            map: {
              provider: 'datav',
              configured: true,
              js_key: '',
              attribution: 'DataV',
              review_number: '',
              publication_approved: false,
            },
          };
        else if (url.pathname === '/api/map-boundary')
          data = {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { name: '测试省', center: [100, 30] },
                geometry: {
                  type: 'Polygon',
                  coordinates: [
                    [
                      [99, 29],
                      [101, 29],
                      [101, 31],
                      [99, 31],
                      [99, 29],
                    ],
                  ],
                },
              },
            ],
          };
        else if (url.pathname === '/api/map-points')
          data = {
            points: [],
            unresolved_count: 1,
            total_count: 1,
            province_aggregates: [
              {
                province: '测试省',
                record_count: 1,
                estimated_count: 1,
                sourced_count: 0,
                verified_count: 0,
                pending_count: 0,
              },
            ],
          };
        else return original(input, ...(args as []));
        urls.push(input);
        return Promise.resolve(
          new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }),
    );
    render(<App />);
    await screen.findByRole('button', { name: '测试省省级汇总，1条水果记录' });
    fireEvent.change(screen.getByLabelText('县域'), {
      target: { value: JSON.stringify(['测试省', '甲县']) },
    });
    const bubble = await screen.findByRole('button', { name: '测试省省级汇总，1条水果记录' });
    urls.length = 0;
    fireEvent.click(bubble);
    await waitFor(() => {
      for (const endpoint of ['/api/records', '/api/summary', '/api/map-points']) {
        expect(
          urls.some((input) => {
            const url = new URL(input, 'http://localhost');
            return (
              url.pathname === endpoint &&
              url.searchParams.get('province') === '测试省' &&
              !url.searchParams.has('county')
            );
          }),
        ).toBe(true);
      }
    });
    expect((screen.getByLabelText('县域') as HTMLSelectElement).value).toBe('');
  });
  it('links flavor exploration across the map and list and exposes separate evidence in details', async () => {
    const original = window.fetch;
    const evidence = {
      variety_name: '测试品种',
      variety_scope: '品种资料',
      taste_profile: '清甜而脆爽',
      taste_scope: '品种参考，非具体产地实测',
      taste_tags: '|清甜|脆爽|',
      taste_source_name: '测试口味来源',
      taste_source_url: 'https://example.org/flavor',
      variety_source_name: '测试品种来源',
      variety_source_url: 'https://example.org/cultivar',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, ...args: unknown[]) => {
        const response = await original(input, ...(args as []));
        const url = new URL(input, 'http://localhost');
        if (url.pathname !== '/api/records' && url.pathname !== '/api/records/1') return response;
        const data = await response.json();
        return new Response(
          JSON.stringify(
            url.pathname === '/api/records'
              ? {
                  ...data,
                  items: data.items.map((record: FruitRecord) => ({ ...record, ...evidence })),
                }
              : { ...data, ...evidence },
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    render(<App />);
    const card = await screen.findByRole('button', { name: '查看测试苹果详情' });
    expect(within(card).getByText('清甜而脆爽')).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole('group', { name: '口味偏好' })).getByRole('button', { name: '脆爽' }),
    );
    await waitFor(() => {
      for (const endpoint of ['/api/records', '/api/summary', '/api/map-points'])
        expect(
          urls.some((input) => {
            const url = new URL(input, 'http://localhost');
            return url.pathname === endpoint && url.searchParams.get('taste') === '脆爽';
          }),
        ).toBe(true);
    });
    fireEvent.click(screen.getByRole('button', { name: '本月尝鲜' }));
    await waitFor(() =>
      expect(
        urls.some((input) => {
          const url = new URL(input, 'http://localhost');
          return (
            url.pathname === '/api/records' &&
            url.searchParams.get('taste') === 'documented' &&
            url.searchParams.get('month') === String(new Date().getMonth() + 1)
          );
        }),
      ).toBe(true),
    );
    fireEvent.click(await screen.findByRole('button', { name: '查看测试苹果详情' }));
    expect(await screen.findByRole('link', { name: '测试口味来源' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '测试品种来源' }).getAttribute('href')).toBe(
      'https://example.org/cultivar',
    );
    expect(screen.getByText(/品种参考，非具体产地实测/)).toBeTruthy();
  });
  it('keeps cards usable when map request fails', async () => {
    const original = window.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, ...args: unknown[]) =>
        url.startsWith('/api/map-points')
          ? Promise.resolve(
              new Response(JSON.stringify({ detail: '地图暂不可用' }), { status: 503 }),
            )
          : original(url, ...(args as [])),
      ),
    );
    render(<App />);
    await screen.findByRole('button', { name: '查看测试苹果详情' });
    expect(await screen.findByText('地图暂不可用')).toBeTruthy();
  });
  it('rejects unsafe source protocols', () => {
    expect(safeSource('javascript:alert(1)')).toBeUndefined();
    expect(safeSource('data:text/html,test')).toBeUndefined();
    expect(safeSource('https://example.org')).toBe('https://example.org/');
  });
});

it('selects a county from an official-provider marker without reinitializing the map', async () => {
  let clickMarker = () => {};
  const created = vi.fn();
  const map = {
    centerAndZoom: vi.fn(),
    setViewport: vi.fn(),
    addOverLay: vi.fn(),
    removeOverLay: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    getZoom: () => 3,
  };
  const ctor = function () {
    created();
    return map;
  };
  window.T = {
    Map: ctor,
    LngLat: function (lng: number, lat: number) {
      return { lng, lat };
    },
    Point: function () {},
    Icon: function () {},
    Marker: function () {
      return {
        addEventListener: (event: string, callback: () => void) => {
          if (event === 'click') clickMarker = callback;
        },
      };
    },
  };
  const config = {
    provider: 'tianditu' as const,
    configured: true,
    js_key: 'test-only-not-a-real-key',
    attribution: '天地图',
    review_number: '测试审图信息',
    publication_approved: false,
  };
  const onSelect = vi.fn();
  const view = render(
    <MapPanel
      config={config}
      points={{ points: [point], unresolved_count: 0 }}
      month={null}
      total={2}
      county=""
      onSelect={onSelect}
      error=""
      retry={() => {}}
    />,
  );
  const script = document.querySelector('script[src*="api.tianditu.gov.cn"]');
  expect(script).toBeTruthy();
  fireEvent.load(script!);
  await waitFor(() => expect(map.addOverLay).toHaveBeenCalled());
  act(() => clickMarker());
  await screen.findByRole('button', { name: '查看该县水果' });
  fireEvent.click(screen.getByRole('button', { name: '查看该县水果' }));
  expect(onSelect).toHaveBeenCalledWith(point);
  view.rerender(
    <MapPanel
      config={config}
      points={{ points: [point], unresolved_count: 0 }}
      month={10}
      total={2}
      county="甲县"
      onSelect={onSelect}
      error=""
      retry={() => {}}
    />,
  );
  expect(created).toHaveBeenCalledTimes(1);
});
