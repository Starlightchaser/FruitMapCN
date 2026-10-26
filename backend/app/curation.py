"""Conservative, repeatable presentation curation; the imported source rows stay intact."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sqlite3

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / 'data' / 'curation' / 'evidence.json'


def clean_county(county: str) -> str:
    if len(county.strip()) <= 1:
        return ''
    # Remove an enclosing prefecture only when a full county follows it.
    # 蓟州区、肃州区、嵊州市 are names themselves and must retain 州.
    county = re.sub(r'^.*?(?:自治州|州|市)(?=[^市州县区旗]{2,}(?:自治县|自治旗|县|区|旗))', '', county)
    match = re.match(r'.*?(?:自治县|自治旗|县|区|旗)', county)
    return match.group() if match else ('' if re.search(r'镇|乡|村|街道', county) else county)


def province_name(value: str, origin: str, names: list[str]) -> str:
    aliases = {name: name for name in names}
    for name in names:
        alias = re.sub(r'(?:壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市)$', '', name)
        aliases[alias] = name
    # Cross-province records remain unassigned; do not force them into a single bubble.
    if '等' in value:
        return value
    found = {full for alias, full in aliases.items() if alias in value}
    if len(found) == 1:
        return next(iter(found))
    if len(found) > 1:
        return value
    candidates = [full for alias, full in aliases.items() if origin.startswith(alias)]
    return candidates[0] if candidates else value


def town_origin(origin: str, province: str = '', city: str = '', county: str = '') -> tuple[str, str]:
    """Stop at a documented township. Never infer a missing township from a village."""
    # Start beyond a documented county; 镇宁县 and 崔村镇 must not be mistaken for lower units.
    county_end = origin.find(county) + len(county) if county and county in origin else 0
    start = max(county_end, origin.find(province) + len(province) if province and province in origin else 0)
    remainder = origin[start:]
    match = re.search(r'街道(?:办事处)?|办事处|苏木|镇(?!村)|乡(?!村)', remainder)
    if match:
        end = start + match.end()
        township = remainder[:match.end()]
        return origin[:end], township
    # Production corps regiments are retained, but sub-regiment companies are omitted.
    corps = re.search(r'第?[一二三四五六七八九十百\d]+团', remainder)
    if '兵团' in origin and corps:
        end = start + corps.end()
        return origin[:end], remainder[:corps.end()]
    if re.search(r'村|社区|居委会|生产队|农业区|连队', remainder):
        if county_end:
            return origin[:county_end], ''
        city_end = origin.find(city) + len(city) if city and city in origin else 0
        if city_end:
            return origin[:city_end], ''
        if province and origin.startswith(province):
            return province, ''
        return '', ''
    return origin, ''


def curate(db: sqlite3.Connection, evidence_path: Path = EVIDENCE) -> dict:
    """Rebuild derived data inside the caller's transaction. Never alter imported records."""
    db.row_factory = sqlite3.Row
    facts = json.loads(evidence_path.read_text('utf8')) if evidence_path.exists() else {'records': []}
    facts_by_uid = {item['record_uid']: item for item in facts['records']}
    if len(facts_by_uid) != len(facts['records']):
        raise ValueError('Duplicate evidence record UID')
    boundary = json.loads((ROOT / 'backend/assets/maps/datav-china.geojson').read_text('utf8'))
    names = [item['properties']['name'] for item in boundary['features'] if item['properties'].get('name')]
    rows = db.execute('SELECT * FROM fruit_records ORDER BY id').fetchall()
    db.execute('DELETE FROM fruit_curation')
    groups, report = {}, Counter(source_records=len(rows))
    for row in rows:
        county = clean_county(row['county'])
        origin, township = town_origin(row['full_origin'], row['province'], row['city'], county)
        province = province_name(row['province'], row['full_origin'], names)
        if any(separator in province for separator in ('、', '，', ',', '/', '等')):
            county = ''
        if not origin:
            origin = province
        values = dict(record_uid=row['record_uid'],origin_display=origin,province_display=province,
                      county_display=county,township=township)
        fact = facts_by_uid.get(row['record_uid'])
        matches = [p for p in facts.get('profiles',[]) if row['product_name'] in p['products']
                   and row['full_origin'].startswith(p.get('origin_prefix',''))]
        if len(matches)>1:
            raise ValueError('Overlapping cultivar profiles: '+row['product_name'])
        if not fact and matches:
            fact = dict(matches[0], expected_product_name=row['product_name'])
        extracted = facts.get('name_extractions',{}).get(row['product_name'])
        if extracted:
            values.update(variety_name=extracted,variety_scope='原始名称',
                          variety_source_name='最终主表 · 产品名称提取',variety_source_url=row['origin_source_url'])
        if fact:
            if fact['expected_product_name'] != row['product_name']:
                raise ValueError('Evidence no longer matches source product: '+row['record_uid'])
            for prefix, field in [('variety','variety_name'),('taste','taste_profile')]:
                if fact.get(field):
                    if not fact.get(prefix+'_source_name') or not fact.get(prefix+'_source_url','').startswith(('https://','http://')):
                        raise ValueError('Missing evidence provenance: '+row['record_uid'])
                    for key in (field,prefix+'_scope',prefix+'_source_name',prefix+'_source_url'):
                        values[key] = fact.get(key,'')
            values['taste_tags'] = '|'+ '|'.join(fact.get('taste_tags',[]))+'|' if fact.get('taste_profile') else ''
            values['checked_at'] = fact.get('checked_at','')
        # Merge only the same product, origin, season and evidence status; preserve every source row.
        months = tuple(r[0] for r in db.execute('SELECT month FROM fruit_record_months WHERE record_id=? ORDER BY month',(row['id'],)))
        key=(row['product_name'],origin,months,row['month_status'],row['month_note'],values.get('variety_name',''),values.get('taste_profile',''))
        if key in groups:
            values['duplicate_of'] = groups[key]
            report['merged_duplicates'] += 1
        else:
            groups[key] = row['record_uid']
        columns=','.join(values)
        db.execute(f'INSERT INTO fruit_curation ({columns}) VALUES ({",".join("?" for _ in values)})',tuple(values.values()))
        report['origin_changed'] += origin != row['full_origin']
        report['province_normalized'] += province != row['province']
        report['county_cleaned'] += county != row['county']
    report['catalog_records'] = db.execute('SELECT COUNT(*) FROM fruit_catalog').fetchone()[0]
    report['with_variety'] = db.execute("SELECT COUNT(*) FROM fruit_catalog WHERE variety_name!=''").fetchone()[0]
    report['with_taste'] = db.execute("SELECT COUNT(*) FROM fruit_catalog WHERE taste_profile!=''").fetchone()[0]
    return dict(report)


def main():
    from app.config import Settings
    from app.db import initialize, connect
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true',help='Back up the database, then apply curation')
    parser.add_argument('--report',type=Path)
    args=parser.parse_args()
    path=Settings().db_path
    if args.apply:
        stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        backup=ROOT/'data/backups'/f'before-curation-{stamp}.db'
        backup.parent.mkdir(parents=True,exist_ok=True)
        with sqlite3.connect(path.as_uri()+'?mode=ro',uri=True) as source,sqlite3.connect(backup) as target:
            source.backup(target)
        initialize(path)
        with connect(path) as db:
            db.execute('BEGIN IMMEDIATE')
            report=curate(db)
        report['backup']=str(backup)
    else:
        with sqlite3.connect(':memory:') as db,sqlite3.connect(path.as_uri()+'?mode=ro',uri=True) as source:
            source.backup(db)
            db.executescript(Path(__file__).with_name('schema.sql').read_text('utf8'))
            report=curate(db)
    report['applied']=args.apply
    if args.report:
        args.report.parent.mkdir(parents=True,exist_ok=True)
        args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8')
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=='__main__':
    main()
