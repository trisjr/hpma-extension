import { describe, expect, it } from 'vitest';

import { uiTaskKeys } from '@/content/flows/partnerTasks';

describe('uiTaskKeys', () => {
  it('MANAGE bao trọn mọi quyền thấp hơn', () => {
    expect(uiTaskKeys(['MANAGE'])).toEqual(['taskManage']);
    expect(uiTaskKeys(['ADVERTISE', 'ANALYZE', 'MANAGE'])).toEqual([
      'taskManage',
    ]);
  });

  it('ADVERTISE + ANALYZE -> Manage campaigns; ANALYZE -> View performance', () => {
    expect(uiTaskKeys(['ADVERTISE', 'ANALYZE'])).toEqual(['taskCampaigns']);
    expect(uiTaskKeys(['ANALYZE'])).toEqual(['taskPerformance']);
  });

  it('ADVERTISE riêng lẻ bị từ chối (sẽ cấp dư quyền ANALYZE)', () => {
    expect(uiTaskKeys(['ADVERTISE'])).toBeUndefined();
  });

  it('không có task nào thì từ chối', () => {
    expect(uiTaskKeys([])).toBeUndefined();
  });
});
