import { expect, it } from 'vitest';
import { clusterCounties } from './mapClusters';
import type { MapPoint } from './types';

const one: MapPoint = {
  county_code: '100001',
  county: '甲县',
  province: '测试省',
  longitude: 100,
  latitude: 30,
  coordinate_system: 'CGCS2000',
  record_count: 3,
  estimated_count: 2,
  sourced_count: 1,
  verified_count: 0,
  pending_count: 0,
};
const two = { ...one, county_code: '100002', county: '乙县', longitude: 100.001, record_count: 2 };
it('groups adjacent counties at national zoom and expands at local zoom', () => {
  const groups = clusterCounties([one, two], 3);
  expect(groups).toHaveLength(1);
  expect(groups[0].recordCount).toBe(5);
  expect(groups[0].members).toHaveLength(2);
  expect(clusterCounties([one, two], 10)).toHaveLength(2);
});
it('keeps the selected county distinct from neighboring clusters', () => {
  expect(clusterCounties([one, two], 3, '甲县')).toHaveLength(2);
});
