export type MonthStatus = 'verified' | 'sourced' | 'estimated' | 'pending';
export interface FruitRecord {
  id: number;
  category: string;
  product_name: string;
  full_origin: string;
  province: string;
  city: string;
  county: string;
  month_range_label: string;
  month_status: MonthStatus;
  month_note: string;
  origin_source_name: string;
  geo_status: 'resolved' | 'unresolved';
  variety_name?: string;
  variety_scope?: string;
  taste_profile?: string;
  taste_tags?: string;
  taste_scope?: string;
  merged_count?: number;
}
export interface FruitDetail extends FruitRecord {
  record_uid: string;
  county_code: string | null;
  township_village: string;
  source_status: string;
  source_note: string;
  origin_source_url: string;
  month_source_name: string;
  month_source_url: string;
  updated_at: string;
  months: number[];
  variety_source_name?: string;
  variety_source_url?: string;
  taste_source_name?: string;
  taste_source_url?: string;
  checked_at?: string;
}
export interface FilterState {
  month: number | null;
  category: string;
  province: string;
  county: string;
  month_status: MonthStatus | '';
  q: string;
  taste: string;
}
export const emptyFilters: FilterState = {
  month: null,
  category: '',
  province: '',
  county: '',
  month_status: '',
  q: '',
  taste: '',
};
export interface FilterOptions {
  categories: string[];
  provinces: string[];
  counties: { province: string; county: string; count: number }[];
  statuses: { month_status: MonthStatus; count: number }[];
}
export interface RecordPage {
  items: FruitRecord[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
export interface Summary {
  total: number;
  categories: number;
  counties: number;
  estimated: number;
  sourced: number;
  verified: number;
  pending: number;
  resolved: number;
  unresolved: number;
  distribution: { category: string; count: number }[];
  taste_records?: number;
  variety_records?: number;
}
export interface MapPoint {
  county_code: string;
  county: string;
  province: string;
  longitude: number;
  latitude: number;
  coordinate_system: string;
  record_count: number;
  estimated_count: number;
  sourced_count: number;
  verified_count: number;
  pending_count: number;
}
export interface MapPoints {
  points: MapPoint[];
  unresolved_count: number;
  province_aggregates?: ProvinceAggregate[];
  total_count?: number;
}
export interface ProvinceAggregate {
  province: string;
  record_count: number;
  estimated_count: number;
  sourced_count: number;
  verified_count: number;
  pending_count: number;
}
export interface MapConfig {
  provider: 'disabled' | 'amap' | 'tianditu' | 'datav';
  configured: boolean;
  js_key: string;
  attribution: string;
  review_number: string;
  publication_approved: boolean;
  coordinate_system?: string;
}
export interface PublicConfig {
  map: MapConfig;
  environment: string;
}
export const statusLabels: Record<MonthStatus, string> = {
  verified: '月份已核验',
  sourced: '月份有来源',
  estimated: '月份为估算',
  pending: '月份待补',
};
