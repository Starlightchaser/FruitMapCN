import math
import sqlite3
from typing import Optional
from dataclasses import dataclass


@dataclass(frozen=True)
class Filters:
    month: Optional[int] = None
    category: str = ''
    province: str = ''
    county: str = ''
    county_code: str = ''
    month_status: str = ''
    q: str = ''
    taste: str = ''

    def sql(self) -> tuple[str, list]:
        clauses, args = ['1=1'], []
        for key in ('category', 'province', 'county', 'county_code', 'month_status'):
            value = getattr(self, key)
            if value:
                clauses.append(f'r.{key}=?')
                args.append(value)
        if self.month is not None:
            clauses.append('EXISTS (SELECT 1 FROM fruit_record_months m WHERE m.record_id=r.id AND m.month=?)')
            args.append(self.month)
        if self.taste == 'documented':
            clauses.append("r.taste_profile!=''")
        elif self.taste:
            clauses.append('r.taste_tags LIKE ?')
            args.append('%|' + self.taste + '|%')
        if self.q.strip():
            pattern = '%' + self.q.strip().replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
            clauses.append("(r.product_name LIKE ? ESCAPE '\\' OR r.full_origin LIKE ? ESCAPE '\\' OR r.category LIKE ? ESCAPE '\\' OR r.variety_name LIKE ? ESCAPE '\\' OR r.taste_profile LIKE ? ESCAPE '\\')")
            args.extend([pattern] * 5)
        return ' AND '.join(clauses), args


CARD_FIELDS = 'id,category,product_name,full_origin,province,city,county,month_range_label,month_status,month_note,origin_source_name,geo_status,variety_name,variety_scope,taste_profile,taste_tags,taste_scope,merged_count'
DETAIL_FIELDS = CARD_FIELDS + ',record_uid,county_code,township_village,source_status,source_note,origin_source_url,month_source_name,month_source_url,updated_at,variety_source_name,variety_source_url,taste_source_name,taste_source_url,checked_at'


def records(db: sqlite3.Connection, filters: Filters, page: int, page_size: int, sort: str) -> dict:
    where, args = filters.sql()
    total = db.execute('SELECT COUNT(*) FROM fruit_catalog r WHERE ' + where, args).fetchone()[0]
    order = {'discovery': "CASE WHEN r.taste_profile!='' THEN 0 WHEN r.variety_name!='' THEN 1 ELSE 2 END,r.category,r.product_name,r.id", 'default': 'r.category,r.product_name,r.id', 'name': 'r.product_name,r.id', 'updated': 'r.updated_at DESC,r.id', 'status': "CASE r.month_status WHEN 'verified' THEN 0 WHEN 'sourced' THEN 1 WHEN 'estimated' THEN 2 ELSE 3 END,r.id"}[sort]
    items = db.execute(f'SELECT {CARD_FIELDS} FROM fruit_catalog r WHERE {where} ORDER BY {order} LIMIT ? OFFSET ?', [*args, page_size, (page - 1) * page_size]).fetchall()
    return dict(items=[dict(x) for x in items], total=total, page=page, page_size=page_size, total_pages=math.ceil(total / page_size))


def summary(db: sqlite3.Connection, filters: Filters) -> dict:
    where, args = filters.sql()
    result = dict(db.execute(f'''SELECT COUNT(*) total,COUNT(DISTINCT category) categories,
        COUNT(DISTINCT CASE WHEN county!='' THEN province||char(31)||county END) counties,
        COALESCE(SUM(month_status='estimated'),0) estimated,
        COALESCE(SUM(month_status='sourced'),0) sourced,COALESCE(SUM(month_status='verified'),0) verified,
        COALESCE(SUM(month_status='pending'),0) pending,
        COALESCE(SUM(geo_status='unresolved'),0) unresolved,
        COALESCE(SUM(geo_status='resolved'),0) resolved,
        COALESCE(SUM(taste_profile!=''),0) taste_records,
        COALESCE(SUM(variety_name!=''),0) variety_records FROM fruit_catalog r WHERE {where}''', args).fetchone())
    result['distribution'] = [dict(x) for x in db.execute(f'SELECT category,COUNT(*) count FROM fruit_catalog r WHERE {where} GROUP BY category ORDER BY count DESC,category LIMIT 8', args)]
    return result


def map_points(db: sqlite3.Connection, filters: Filters) -> dict:
    where, args = filters.sql()
    points = db.execute(f'''SELECT county_code,county,province,longitude,latitude,coordinate_system,
      COUNT(*) record_count,SUM(month_status='estimated') estimated_count,
      SUM(month_status='sourced') sourced_count,SUM(month_status='verified') verified_count,
      SUM(month_status='pending') pending_count FROM fruit_catalog r
      WHERE {where} AND geo_status='resolved' GROUP BY county_code ORDER BY county_code''', args).fetchall()
    unresolved = db.execute(f"SELECT COUNT(*) FROM fruit_catalog r WHERE {where} AND geo_status='unresolved'", args).fetchone()[0]
    provinces = [dict(row) for row in db.execute(f'''SELECT province,COUNT(*) record_count,
      SUM(month_status='estimated') estimated_count,SUM(month_status='sourced') sourced_count,
      SUM(month_status='verified') verified_count,SUM(month_status='pending') pending_count
      FROM fruit_catalog r WHERE {where} GROUP BY province ORDER BY record_count DESC,province''', args)]
    return dict(points=[dict(x) for x in points], unresolved_count=unresolved,
                province_aggregates=provinces, total_count=sum(row['record_count'] for row in provinces))
