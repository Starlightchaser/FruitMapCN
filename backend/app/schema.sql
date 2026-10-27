CREATE TABLE IF NOT EXISTS county_locations (
 county_code TEXT PRIMARY KEY,
 province TEXT NOT NULL,
 city TEXT NOT NULL DEFAULT '',
 county TEXT NOT NULL,
 longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 latitude REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 coordinate_system TEXT NOT NULL CHECK(coordinate_system IN ('GCJ02','WGS84','CGCS2000')),
 source_url TEXT NOT NULL,
 verified_at TEXT NOT NULL,
 UNIQUE(province, county)
);
CREATE TABLE IF NOT EXISTS fruit_records (
 id INTEGER PRIMARY KEY,
 record_uid TEXT NOT NULL UNIQUE,
 content_hash TEXT NOT NULL,
 category TEXT NOT NULL,
 product_name TEXT NOT NULL,
 full_origin TEXT NOT NULL,
 province TEXT NOT NULL DEFAULT '',
 city TEXT NOT NULL DEFAULT '',
 county TEXT NOT NULL DEFAULT '',
 township_village TEXT NOT NULL DEFAULT '',
 county_code TEXT REFERENCES county_locations(county_code),
 longitude REAL,
 latitude REAL,
 coordinate_system TEXT,
 geo_status TEXT NOT NULL DEFAULT 'unresolved' CHECK(geo_status IN ('resolved','unresolved')),
 month_range_label TEXT NOT NULL,
 month_status TEXT NOT NULL CHECK(month_status IN ('verified','sourced','estimated','pending')),
 month_note TEXT NOT NULL DEFAULT '',
 origin_source_name TEXT NOT NULL DEFAULT '',
 origin_source_url TEXT NOT NULL DEFAULT '',
 month_source_name TEXT NOT NULL DEFAULT '',
 month_source_url TEXT NOT NULL DEFAULT '',
 source_status TEXT NOT NULL DEFAULT '',
 source_note TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL,
 CHECK(month_status != 'estimated' OR length(month_note)>0),
 CHECK((geo_status='unresolved' AND county_code IS NULL AND longitude IS NULL AND latitude IS NULL) OR
       (geo_status='resolved' AND county_code IS NOT NULL AND longitude IS NOT NULL AND latitude IS NOT NULL AND coordinate_system IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS fruit_record_months (
 record_id INTEGER NOT NULL REFERENCES fruit_records(id) ON DELETE CASCADE,
 month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
 PRIMARY KEY(record_id, month)
);
CREATE INDEX IF NOT EXISTS idx_month_record ON fruit_record_months(month, record_id);
CREATE INDEX IF NOT EXISTS idx_category ON fruit_records(category);
CREATE INDEX IF NOT EXISTS idx_province ON fruit_records(province);
CREATE INDEX IF NOT EXISTS idx_county ON fruit_records(county);
CREATE INDEX IF NOT EXISTS idx_county_code ON fruit_records(county_code);
CREATE INDEX IF NOT EXISTS idx_month_status ON fruit_records(month_status);
CREATE INDEX IF NOT EXISTS idx_product_name ON fruit_records(product_name);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS fruit_curation (
 record_uid TEXT PRIMARY KEY REFERENCES fruit_records(record_uid) ON DELETE CASCADE,
 origin_display TEXT NOT NULL,
 province_display TEXT NOT NULL,
 county_display TEXT NOT NULL,
 township TEXT NOT NULL DEFAULT '',
 variety_name TEXT NOT NULL DEFAULT '',
 variety_scope TEXT NOT NULL DEFAULT '',
 variety_source_name TEXT NOT NULL DEFAULT '',
 variety_source_url TEXT NOT NULL DEFAULT '',
 taste_profile TEXT NOT NULL DEFAULT '',
 taste_tags TEXT NOT NULL DEFAULT '',
 taste_scope TEXT NOT NULL DEFAULT '',
 taste_source_name TEXT NOT NULL DEFAULT '',
 taste_source_url TEXT NOT NULL DEFAULT '',
 checked_at TEXT NOT NULL DEFAULT '',
 duplicate_of TEXT REFERENCES fruit_records(record_uid),
 CHECK(duplicate_of IS NULL OR duplicate_of!=record_uid)
);
CREATE INDEX IF NOT EXISTS idx_curation_duplicate ON fruit_curation(duplicate_of);
CREATE VIEW IF NOT EXISTS fruit_catalog AS
 SELECT r.id,r.record_uid,r.content_hash,r.category,r.product_name,
 CASE WHEN c.record_uid IS NULL THEN r.full_origin ELSE c.origin_display END full_origin,
 COALESCE(c.province_display,r.province) province,r.city,
 COALESCE(c.county_display,r.county) county,
 CASE WHEN c.record_uid IS NULL THEN r.township_village ELSE c.township END township_village,
 r.county_code,r.longitude,r.latitude,r.coordinate_system,r.geo_status,
 r.month_range_label,r.month_status,r.month_note,r.origin_source_name,r.origin_source_url,
 r.month_source_name,r.month_source_url,r.source_status,r.source_note,r.updated_at,
 COALESCE(c.variety_name,'') variety_name,COALESCE(c.variety_scope,'') variety_scope,
 COALESCE(c.variety_source_name,'') variety_source_name,COALESCE(c.variety_source_url,'') variety_source_url,
 COALESCE(c.taste_profile,'') taste_profile,COALESCE(c.taste_tags,'') taste_tags,
 COALESCE(c.taste_scope,'') taste_scope,COALESCE(c.taste_source_name,'') taste_source_name,
 COALESCE(c.taste_source_url,'') taste_source_url,COALESCE(c.checked_at,'') checked_at,
 (SELECT COUNT(*) FROM fruit_curation d WHERE d.duplicate_of=r.record_uid)+1 merged_count
 FROM fruit_records r LEFT JOIN fruit_curation c ON c.record_uid=r.record_uid
 WHERE c.duplicate_of IS NULL;
PRAGMA user_version=2;
