import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Maximize2, Minus, Plus, Globe2 } from 'lucide-react';
import { ErrorState } from './components';
import { useResource } from './hooks';
import ProvinceBubbleLayer from './ProvinceBubbleLayer';
import { makeProvinceBubbles, type ProvinceBubble } from './provinceBubbles';
import {
  createBoundaryProjection,
  defaultMapView,
  geometryPath,
  type BoundaryCollection,
} from './datavGeometry';
import type { MapConfig, MapPoint, MapPoints } from './types';

type MapView = { scale: number; x: number; y: number };

export default function DataVMap({
  points,
  province,
  onProvince,
}: {
  config: MapConfig;
  points: MapPoints | null;
  province: string;
  county: string;
  onProvince?: (name: string) => void;
  onSelect: (point: MapPoint) => void;
}) {
  const boundary = useResource<BoundaryCollection>('/api/map-boundary');
  const svg = useRef<SVGSVGElement>(null);
  const [adjustedView, setAdjustedView] = useState<MapView | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const ignoreClick = useRef(false);
  const projection = useMemo(
    () => (boundary.data ? createBoundaryProjection(boundary.data) : null),
    [boundary.data],
  );
  const paths = useMemo(
    () =>
      boundary.data && projection
        ? boundary.data.features.map((feature) => ({
            feature,
            path: geometryPath(feature.geometry, projection),
          }))
        : [],
    [boundary.data, projection],
  );
  const homeView = useMemo(
    () => (projection ? defaultMapView(projection) : { scale: 1, x: 0, y: 0 }),
    [projection],
  );
  const view = adjustedView ?? homeView;
  function setView(next: MapView | ((old: MapView) => MapView)) {
    setAdjustedView((old) => (typeof next === 'function' ? next(old ?? homeView) : next));
  }
  const [hoveredProvince, setHoveredProvince] = useState<ProvinceBubble | null>(null);
  const bubbles = useMemo(
    () =>
      boundary.data ? makeProvinceBubbles(boundary.data, points?.province_aggregates || []) : [],
    [boundary.data, points],
  );
  const coveredCount = bubbles.reduce((total, bubble) => total + bubble.record_count, 0);
  const totalCount = points?.total_count ?? coveredCount;
  const activeTooltip =
    hoveredProvince && bubbles.find((bubble) => bubble.province === hoveredProvince.province);

  function zoom(factor: number, anchor = { x: 450, y: 325 }) {
    setView((old) => {
      const scale = Math.max(1, Math.min(8, old.scale * factor));
      if (scale === 1) return { scale: 1, x: 0, y: 0 };
      return {
        scale,
        x: anchor.x - ((anchor.x - old.x) * scale) / old.scale,
        y: anchor.y - ((anchor.y - old.y) * scale) / old.scale,
      };
    });
  }
  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const matrix = node.getScreenCTM();
      if (matrix) {
        const anchor = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
        zoom(event.deltaY < 0 ? 1.15 : 1 / 1.15, anchor);
      } else
        zoom(event.deltaY < 0 ? 1.15 : 1 / 1.15, {
          x: ((event.clientX - rect.left) * 900) / rect.width,
          y: ((event.clientY - rect.top) * 650) / rect.height,
        });
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [boundary.data]);
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const current = drag.current;
    if (!current) return;
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const start = new DOMPoint(current.x, current.y).matrixTransform(matrix.inverse());
    const end = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    if (Math.abs(event.clientX - current.x) + Math.abs(event.clientY - current.y) > 4) {
      current.moved = true;
      ignoreClick.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setView((old) => ({
        ...old,
        x: current.startX + end.x - start.x,
        y: current.startY + end.y - start.y,
      }));
    }
  }
  function selectProvince(name?: string) {
    if (name && !ignoreClick.current) onProvince?.(name);
  }

  if (boundary.error)
    return (
      <div className="map-unconfigured">
        <ErrorState message={boundary.error} retry={boundary.retry} />
      </div>
    );
  if (!boundary.data || !projection)
    return (
      <div className="map-unconfigured">
        <p>正在加载 DataV 底图…</p>
      </div>
    );
  return (
    <>
      <svg
        ref={svg}
        className="datav-svg"
        viewBox="0 0 900 650"
        aria-label="DataV 中国省级边界地图"
        onPointerDown={(event) => {
          if (event.button === 0) {
            ignoreClick.current = false;
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              startX: view.x,
              startY: view.y,
              moved: false,
            };
          }
        }}
        onPointerMove={pointerMove}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
          {paths.map(({ feature, path }, index) => (
            <path
              key={feature.properties.adcode ?? index}
              d={path}
              className={`datav-province ${feature.properties.name && province === feature.properties.name ? 'selected' : ''}`}
              fillRule="evenodd"
              vectorEffect="non-scaling-stroke"
              role={feature.properties.name ? 'button' : undefined}
              tabIndex={feature.properties.name ? 0 : undefined}
              aria-label={feature.properties.name ? `筛选${feature.properties.name}` : undefined}
              onClick={() => selectProvince(feature.properties.name)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  selectProvince(feature.properties.name);
                }
              }}
            >
              <title>{feature.properties.name || 'DataV 原始未命名几何'}</title>
            </path>
          ))}
          {paths.map(({ feature }, index) => {
            const center = feature.properties.centroid || feature.properties.center;
            if (!center || !feature.properties.name) return null;
            const [x, y] = projection(center);
            return (
              <text key={index} x={x} y={y} className="datav-label" fontSize={10 / view.scale}>
                {feature.properties.name}
              </text>
            );
          })}
        </g>
        <ProvinceBubbleLayer
          bubbles={bubbles}
          project={projection}
          view={view}
          selected={province}
          onSelect={selectProvince}
          onHover={setHoveredProvince}
        />
      </svg>
      <div className="map-controls glass">
        <button aria-label="放大地图" onClick={() => zoom(1.4)}>
          <Plus size={17} />
        </button>
        <button aria-label="缩小地图" onClick={() => zoom(1 / 1.4)}>
          <Minus size={17} />
        </button>
        <button
          aria-label="恢复默认视角"
          title="恢复默认视角"
          onClick={() => setView(defaultMapView(projection))}
        >
          <Maximize2 size={16} />
        </button>
        <button
          aria-label="查看完整全国地图"
          title="查看完整全国地图"
          onClick={() => setView({ scale: 1, x: 0, y: 0 })}
        >
          <Globe2 size={16} />
        </button>
      </div>
      <button
        className="map-overview glass"
        aria-label="查看全国全貌"
        onClick={() => setView({ scale: 1, x: 0, y: 0 })}
      >
        <svg viewBox="0 0 900 650" aria-hidden="true">
          {paths.map(({ feature, path }, index) => (
            <path
              key={index}
              d={path}
              fillRule="evenodd"
              className={feature.properties.name === province ? 'selected' : ''}
            />
          ))}
        </svg>
        <span>全国全貌</span>
      </button>
      <span className="province-bubble-mode">按省汇总</span>
      <div className="province-bubble-coverage">
        {points && !points.province_aggregates
          ? '请重启后端以加载省级气泡'
          : `已汇总 ${coveredCount} / ${totalCount} 条${totalCount > coveredCount ? ` · ${totalCount - coveredCount} 条产区待归属` : ''}`}
      </div>
      {activeTooltip && (
        <div className="province-bubble-tooltip glass" role="tooltip">
          <span className="eyebrow">省级汇总</span>
          <h3>{activeTooltip.province}</h3>
          <p>
            <strong>{activeTooltip.record_count}</strong> 条水果记录
          </p>
          <div>
            <span>已核验 {activeTooltip.verified_count}</span>
            <span>有来源 {activeTooltip.sourced_count}</span>
            <span>估算 {activeTooltip.estimated_count}</span>
            <span>待补 {activeTooltip.pending_count}</span>
          </div>
          <small>点击气泡查看该省水果</small>
        </div>
      )}
    </>
  );
}
