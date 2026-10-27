import type { MapPoint } from './types';

export interface CountyCluster {
  longitude: number;
  latitude: number;
  recordCount: number;
  members: MapPoint[];
}

// Cluster business points in screen-sized Web Mercator cells. This never alters a base map.
export function clusterCounties(
  points: MapPoint[],
  zoom: number,
  selectedCounty = '',
): CountyCluster[] {
  const cells = new Map<string, MapPoint[]>();
  const scale = 256 * 2 ** zoom;
  for (const point of points) {
    const sin = Math.sin((Math.max(-85, Math.min(85, point.latitude)) * Math.PI) / 180);
    const x = ((point.longitude + 180) / 360) * scale;
    const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
    const key =
      zoom >= 10 || point.county === selectedCounty
        ? point.county_code
        : `${Math.floor(x / 48)}:${Math.floor(y / 48)}`;
    const group = cells.get(key) || [];
    group.push(point);
    cells.set(key, group);
  }
  return [...cells.values()].map((members) => ({
    longitude: members.reduce((total, point) => total + point.longitude, 0) / members.length,
    latitude: members.reduce((total, point) => total + point.latitude, 0) / members.length,
    recordCount: members.reduce((total, point) => total + point.record_count, 0),
    members,
  }));
}
