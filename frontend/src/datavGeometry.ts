export type Coordinate = [number, number];
export interface BoundaryGeometry {
  type: string;
  coordinates: unknown;
}
export interface BoundaryFeature {
  type: 'Feature';
  properties: {
    name?: string;
    adcode?: string | number;
    center?: Coordinate;
    centroid?: Coordinate;
  };
  geometry: BoundaryGeometry;
}
export interface BoundaryCollection {
  type: 'FeatureCollection';
  features: BoundaryFeature[];
}

function positions(value: unknown, result: Coordinate[] = []): Coordinate[] {
  if (!Array.isArray(value)) return result;
  if (typeof value[0] === 'number' && typeof value[1] === 'number') {
    result.push([value[0], value[1]]);
  } else value.forEach((child) => positions(child, result));
  return result;
}

function mercator([longitude, latitude]: Coordinate): Coordinate {
  return [
    (longitude * Math.PI) / 180,
    -Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360)),
  ];
}

export function createBoundaryProjection(collection: BoundaryCollection) {
  const points = collection.features
    .flatMap((feature) => positions(feature.geometry.coordinates))
    .map(mercator);
  if (!points.length) throw new Error('底图没有可绘制的坐标');
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  // Fit ALL source geometry, including unnamed southern geometry, without moving islands.
  const scale = Math.min(810 / (maxX - minX), 465 / (maxY - minY));
  const offsetX = 450 - ((minX + maxX) / 2) * scale;
  const offsetY = 325 - ((minY + maxY) / 2) * scale;
  return (point: Coordinate): Coordinate => {
    const [x, y] = mercator(point);
    return [x * scale + offsetX, y * scale + offsetY];
  };
}

export function defaultMapView(project: (point: Coordinate) => Coordinate) {
  const [x, y] = project([104, 34]);
  const scale = 1.65;
  return { scale, x: 450 - x * scale, y: 310 - y * scale };
}

export function geometryPath(
  geometry: BoundaryGeometry,
  project: (point: Coordinate) => Coordinate,
): string {
  function line(coordinates: unknown, close: boolean) {
    const points = positions(coordinates);
    return (
      points.map((point, index) => `${index ? 'L' : 'M'}${project(point).join(',')}`).join(' ') +
      (close ? 'Z' : '')
    );
  }
  const coordinates = geometry.coordinates as unknown[];
  if (geometry.type === 'Polygon') return coordinates.map((ring) => line(ring, true)).join(' ');
  if (geometry.type === 'MultiPolygon')
    return (coordinates as unknown[][])
      .flatMap((polygon) => polygon.map((ring) => line(ring, true)))
      .join(' ');
  if (geometry.type === 'LineString') return line(coordinates, false);
  if (geometry.type === 'MultiLineString')
    return coordinates.map((ring) => line(ring, false)).join(' ');
  return '';
}
