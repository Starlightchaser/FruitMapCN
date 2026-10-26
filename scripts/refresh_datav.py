"""Download the user-selected DataV boundary verbatim, with TLS verification."""
import hashlib
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SOURCE = 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json'
ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'backend' / 'assets' / 'maps' / 'datav-china.geojson'


def main():
    request = urllib.request.Request(SOURCE, headers={'User-Agent':'FruitMap/0.1', 'Referer':'https://datav.aliyun.com/'})
    with urllib.request.urlopen(request, timeout=45) as response:
        raw = response.read(10_000_001)
    if len(raw) > 10_000_000:
        raise ValueError('Boundary file exceeds the expected size limit')
    data = json.loads(raw)
    if data.get('type') != 'FeatureCollection' or not data.get('features'):
        raise ValueError('Invalid DataV GeoJSON')
    names = [str(feature.get('properties', {}).get('name', '')) for feature in data['features']]
    for expected in ('台湾', '香港', '澳门', '海南'):
        if not any(expected in name for name in names):
            raise ValueError(f'Missing expected source region: {expected}; do not patch the boundary manually')
    positions = []
    def visit(value):
        if isinstance(value, list) and len(value) >= 2 and isinstance(value[0], (int, float)):
            positions.append(value[:2])
        elif isinstance(value, list):
            for child in value:
                visit(child)
    for feature in data['features']:
        visit(feature['geometry']['coordinates'])
    if not positions or min(point[1] for point in positions) >= 10:
        raise ValueError('Expected southern source geometry is absent; do not fabricate missing boundaries')
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_bytes(raw)
    metadata = dict(source=SOURCE, portal='https://datav.aliyun.com/portal/school/atlas/area_selector',
        retrieved_at=datetime.now(timezone.utc).isoformat(), sha256=hashlib.sha256(raw).hexdigest(),
        bytes=len(raw), feature_count=len(names), region_names=names,
        geometry_modified=False, publication_approved=False,
        coordinate_reference='Source provides longitude/latitude; datum not asserted by this application')
    TARGET.with_suffix('.source.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(metadata, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
