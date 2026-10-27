import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { MapPinned, Maximize2, Plus, Minus, Layers3 } from 'lucide-react';
import type { MapConfig, MapPoints, MapPoint } from './types';
import { ErrorState } from './components';
import { clusterCounties } from './mapClusters';
const DataVMap = lazy(() => import('./DataVMap'));

// SDKs are supplied by the selected official provider. No national polygons are bundled.
type ProviderMap = {
  destroy?: () => void;
  remove?: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  centerAndZoom?: (p: unknown, z: number) => void;
  setBounds?: (b: unknown) => void;
  setZoomAndCenter?: (zoom: number, center: number[]) => void;
  setViewport?: (p: unknown[]) => void;
  addOverLay?: (m: unknown) => void;
  removeOverLay?: (m: unknown) => void;
  getZoom: () => number;
  on?: (event: string, cb: () => void) => void;
  addEventListener?: (event: string, cb: () => void) => void;
  lngLatToContainerPoint?: (p: unknown) => { x: number; y: number };
  clearMap?: () => void;
};
// Vendor SDK types are intentionally kept at this integration boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global {
  interface Window {
    T: any;
    AMap: any;
    _AMapSecurityConfig: { serviceHost: string };
  }
}
const loads = new Map<string, Promise<void>>();
function loadSdk(config: MapConfig) {
  const src =
    config.provider === 'tianditu'
      ? `https://api.tianditu.gov.cn/api?v=4.0&tk=${encodeURIComponent(config.js_key)}`
      : `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(config.js_key)}`;
  if (config.provider === 'amap')
    window._AMapSecurityConfig = { serviceHost: window.location.origin + '/_AMapService' };
  if (!loads.has(src))
    loads.set(
      src,
      new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        const timeout = window.setTimeout(() => {
          script.remove();
          loads.delete(src);
          reject(new Error('地图连接超时，请重试。'));
        }, 20000);
        script.onload = () => {
          clearTimeout(timeout);
          resolve();
        };
        script.onerror = () => {
          clearTimeout(timeout);
          script.remove();
          loads.delete(src);
          reject(new Error('地图服务未能加载，请检查配置与网络。'));
        };
        document.head.append(script);
      }),
    );
  return loads.get(src)!;
}
export function MapAttribution({ config }: { config: MapConfig }) {
  return (
    <div className="map-attribution">
      {config.configured ? (
        <>
          <span>{config.attribution || '地图来源待确认'}</span>
          <span>{config.review_number || '审图信息待确认 · 仅开发预览'}</span>
        </>
      ) : (
        <span>尚未加载地图底图</span>
      )}
    </div>
  );
}
export function MapPanel({
  config,
  points,
  month,
  total,
  county,
  province = '',
  onProvince,
  onSelect,
  error,
  retry,
}: {
  config: MapConfig | null;
  points: MapPoints | null;
  month: number | null;
  total: number | undefined;
  county: string;
  province?: string;
  onProvince?: (name: string) => void;
  onSelect: (p: MapPoint) => void;
  error: string;
  retry: () => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<ProviderMap | null>(null),
    select = useRef(onSelect),
    markers = useRef<unknown[]>([]);
  const [sdkError, setSdkError] = useState(''),
    [ready, setReady] = useState(false),
    [revision, setRevision] = useState(0),
    [zoom, setZoom] = useState(3),
    [popup, setPopup] = useState<MapPoint | null>(null);
  select.current = onSelect;
  const reset = () => {
    if (config?.provider === 'tianditu')
      map.current?.setViewport?.([new window.T.LngLat(73, 3), new window.T.LngLat(136, 54)]);
    else if (config?.provider === 'amap')
      map.current?.setBounds?.(new window.AMap.Bounds([73, 3], [136, 54]));
    setPopup(null);
  };
  useEffect(() => {
    if (!config?.configured || config.provider === 'datav' || !container.current) return;
    let cancelled = false;
    setSdkError('');
    setReady(false);
    loadSdk(config)
      .then(() => {
        if (cancelled || !container.current) return;
        if (config.provider === 'tianditu') {
          if (!window.T) throw new Error('地图服务未初始化，请核对 Key。');
          map.current = new window.T.Map(container.current, { projection: 'EPSG:900913' });
          map.current!.centerAndZoom?.(new window.T.LngLat(104, 32), 3);
          map.current!.setViewport?.([new window.T.LngLat(73, 3), new window.T.LngLat(136, 54)]);
        } else {
          map.current = new window.AMap.Map(container.current, {
            viewMode: '2D',
            center: [104, 32],
            zoom: 3,
            resizeEnable: true,
          });
          map.current!.setBounds?.(new window.AMap.Bounds([73, 3], [136, 54]));
        }
        const handleZoom = () => {
          if (map.current) setZoom(map.current.getZoom());
        };
        map.current?.on?.('zoomend', handleZoom);
        map.current?.addEventListener?.('zoomend', handleZoom);
        handleZoom();
        setReady(true);
      })
      .catch((e) => {
        if (!cancelled) setSdkError(e.message);
      });
    return () => {
      cancelled = true;
      map.current?.destroy?.();
      map.current?.remove?.();
      map.current = null;
      markers.current = [];
    };
  }, [config, revision]);
  useEffect(() => {
    if (!ready || !map.current || !config) return;
    const instance = map.current;
    if (config.provider === 'tianditu')
      markers.current.forEach((marker) => instance.removeOverLay?.(marker));
    else instance.clearMap?.();
    markers.current = [];
    setPopup((previous) => (previous?.county === county ? previous : null));
    const compatible = (points?.points || []).filter((p) =>
      config.provider === 'tianditu'
        ? ['WGS84', 'CGCS2000'].includes(p.coordinate_system)
        : p.coordinate_system === 'GCJ02',
    );
    for (const group of clusterCounties(compatible, zoom, county)) {
      const point = group.members[0];
      const multiple = group.members.length > 1;
      const selected = !multiple && point.county === county;
      const radius = group.recordCount > 1 ? 20 : 12;
      const color = selected ? '#D69E5F' : '#3F7C6D';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><circle cx="24" cy="24" r="${radius}" fill="${color}" fill-opacity=".9" stroke="white" stroke-width="2"/>${group.recordCount > 1 ? `<text x="24" y="29" fill="white" text-anchor="middle" font-size="12" font-family="sans-serif">${group.recordCount}</text>` : ''}</svg>`;
      const click = () => {
        if (multiple) {
          if (config.provider === 'tianditu')
            instance.centerAndZoom?.(
              new window.T.LngLat(group.longitude, group.latitude),
              zoom + 2,
            );
          else instance.setZoomAndCenter?.(zoom + 2, [group.longitude, group.latitude]);
        } else {
          select.current(point);
          setPopup(point);
        }
      };
      if (config.provider === 'tianditu') {
        const marker = new window.T.Marker(new window.T.LngLat(group.longitude, group.latitude), {
          icon: new window.T.Icon({
            iconUrl: 'data:image/svg+xml,' + encodeURIComponent(svg),
            iconSize: new window.T.Point(48, 48),
            iconAnchor: new window.T.Point(24, 24),
          }),
        });
        marker.addEventListener('click', click);
        instance.addOverLay?.(marker);
        markers.current.push(marker);
      } else {
        const marker = new window.AMap.Marker({
          position: [group.longitude, group.latitude],
          icon: new window.AMap.Icon({
            image: 'data:image/svg+xml,' + encodeURIComponent(svg),
            size: new window.AMap.Size(48, 48),
          }),
          offset: new window.AMap.Pixel(-24, -24),
          map: instance,
        });
        marker.on('click', click);
        markers.current.push(marker);
      }
    }
  }, [points, county, ready, config, zoom]);
  return (
    <section className="map-panel panel" aria-label="水果产地地图">
      <div ref={container} className="map-canvas">
        {config?.configured && config.provider === 'datav' && (
          <Suspense fallback={<div className="map-unconfigured">正在加载地图…</div>}>
            <DataVMap
              config={config}
              points={points}
              province={province}
              county={county}
              onProvince={onProvince}
              onSelect={onSelect}
            />
          </Suspense>
        )}
      </div>
      <div className="map-heading glass">
        <span className="eyebrow">FRUIT ATLAS</span>
        <h2>{month ? `${month}月` : '全年'} · 全国水果产地</h2>
        <p>{total === undefined ? '正在查询…' : `当前匹配 ${total.toLocaleString()} 条记录`}</p>
      </div>
      {!config?.configured ? (
        <div className="map-unconfigured">
          <span className="map-empty-icon">
            <MapPinned size={38} strokeWidth={1.2} />
          </span>
          <h3>等待接入地图服务</h3>
          <p>
            产地清单已可浏览。配置官方地图服务后，
            <br />
            将在此显示底图与经核验的县域点。
          </p>
          <div className="map-note">
            <Layers3 size={15} />
            <span>底图与水果数据独立维护</span>
          </div>
        </div>
      ) : sdkError ? (
        <div className="map-unconfigured">
          <ErrorState message={sdkError} retry={() => setRevision((x) => x + 1)} />
        </div>
      ) : !ready && config.provider !== 'datav' ? (
        <div className="map-unconfigured">
          <p>正在加载地图…</p>
        </div>
      ) : null}
      {error && (
        <div className="map-error">
          <ErrorState message={error} retry={retry} />
        </div>
      )}
      {ready && (
        <div className="map-controls glass">
          <button aria-label="放大地图" onClick={() => map.current?.zoomIn()}>
            <Plus size={17} />
          </button>
          <button aria-label="缩小地图" onClick={() => map.current?.zoomOut()}>
            <Minus size={17} />
          </button>
          <button aria-label="查看全国地图" onClick={reset}>
            <Maximize2 size={16} />
          </button>
        </div>
      )}
      {popup && (
        <div className="county-popup glass">
          <button className="popup-close" aria-label="关闭产地信息" onClick={() => setPopup(null)}>
            ×
          </button>
          <strong>
            {popup.province} · {popup.county}
          </strong>
          <p>
            {popup.record_count} 条水果记录 · {popup.estimated_count} 条月份估算
          </p>
          <button
            className="primary"
            onClick={() => {
              select.current(popup);
              setPopup(null);
            }}
          >
            查看该县水果
          </button>
        </div>
      )}
      <div className="map-bottom">
        <div className="map-legend">
          <span>
            <i />
            {config?.provider === 'datav' ? '省级气泡 · 数字为记录数' : '县域水果产地'}
          </span>
          <span>
            <i className="selected" />
            当前选中
          </span>
        </div>
        <span>
          {config?.provider === 'datav'
            ? '点击气泡筛选产区'
            : points
              ? `${points.unresolved_count} 条产地待核验`
              : '产地核验中'}
        </span>
      </div>
      {config && <MapAttribution config={config} />}
    </section>
  );
}
