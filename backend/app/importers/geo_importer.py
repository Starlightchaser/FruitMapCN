"""Import a locally reviewed county gazetteer; never infer missing coordinates."""
import argparse
import csv
import json
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse
from app.config import Settings
from app.db import connect, initialize


def import_locations(path: Path, database: Path, dry_run: bool = False) -> dict:
    records, seen, seen_codes = [], set(), set()
    with path.open(encoding='utf-8-sig', newline='') as handle:
        for index, row in enumerate(csv.DictReader(handle), start=2):
            required = ('province','county','county_code','longitude','latitude','coordinate_system','source_url','verified_at','verified')
            if any(not row.get(k, '').strip() for k in required):
                raise ValueError(f'第 {index} 行缺少必要信息')
            if row['verified'].lower() != 'true':
                raise ValueError(f'第 {index} 行未经人工核验')
            if not re.fullmatch(r'\d{6}', row['county_code']):
                raise ValueError(f'第 {index} 行县域代码无效')
            if row['coordinate_system'] not in ('GCJ02','WGS84','CGCS2000'):
                raise ValueError(f'第 {index} 行坐标系无效')
            if urlparse(row['source_url']).scheme not in ('https','http'):
                raise ValueError(f'第 {index} 行来源 URL 无效')
            datetime.fromisoformat(row['verified_at'])
            longitude, latitude = float(row['longitude']), float(row['latitude'])
            if not (-180 <= longitude <= 180 and -90 <= latitude <= 90):
                raise ValueError(f'第 {index} 行坐标无效')
            key = (row['province'], row['county'])
            if key in seen or row['county_code'] in seen_codes:
                raise ValueError('同省同名县域存在歧义，不允许自动匹配')
            seen.add(key)
            seen_codes.add(row['county_code'])
            records.append((row['county_code'],row['province'],row.get('city',''),row['county'],longitude,latitude,row['coordinate_system'],row['source_url'],row['verified_at']))
    if dry_run:
        return {'valid':len(records),'committed':False}
    initialize(database)
    with connect(database) as db:
        for row in records:
            db.execute('''INSERT INTO county_locations VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(county_code) DO UPDATE SET
                province=excluded.province,city=excluded.city,county=excluded.county,longitude=excluded.longitude,
                latitude=excluded.latitude,coordinate_system=excluded.coordinate_system,source_url=excluded.source_url,verified_at=excluded.verified_at''', row)
        db.execute("UPDATE fruit_records SET county_code=NULL,longitude=NULL,latitude=NULL,coordinate_system=NULL,geo_status='unresolved'")
        db.execute('''UPDATE fruit_records SET county_code=c.county_code,longitude=c.longitude,latitude=c.latitude,
            coordinate_system=c.coordinate_system,geo_status='resolved' FROM county_locations c
            WHERE fruit_records.province=c.province AND fruit_records.county=c.county
            AND instr(fruit_records.full_origin,c.province)>0 AND instr(fruit_records.full_origin,c.county)>0''')
        resolved = db.execute("SELECT COUNT(*) FROM fruit_records WHERE geo_status='resolved'").fetchone()[0]
    return {'valid':len(records),'resolved_records':resolved,'committed':True}


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file',type=Path)
    parser.add_argument('--database',type=Path,default=Settings().db_path)
    parser.add_argument('--dry-run',action='store_true')
    args=parser.parse_args()
    print(json.dumps(import_locations(args.file,args.database.resolve(),args.dry_run),ensure_ascii=False,indent=2))
