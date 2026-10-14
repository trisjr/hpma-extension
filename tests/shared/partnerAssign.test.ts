import { describe, expect, it } from 'vitest';

import { parseDraft, pickedBusinessId } from '@/shared/partnerAssign';

const A = '1451597353550362';
const B = '1451597353550999';

describe('pickedBusinessId: BM mà run được phép chạy', () => {
  it('danh sách chưa tải thì dùng BM đã lưu (content script kiểm lại với URL)', () => {
    expect(pickedBusinessId(A, undefined)).toBe(A);
  });

  it('danh sách đang tải cho đúng BM đã chọn thì dùng BM đó', () => {
    expect(pickedBusinessId(A, A)).toBe(A);
  });

  it('danh sách đang tải cho BM khác (tab đã đổi BM) thì không có BM hợp lệ để gửi', () => {
    expect(pickedBusinessId(A, B)).toBeUndefined();
  });

  it('chưa từng chọn TKQC ở BM nào thì không có BM để gửi', () => {
    expect(pickedBusinessId(undefined, undefined)).toBeUndefined();
    expect(pickedBusinessId(undefined, B)).toBeUndefined();
  });
});

describe('parseDraft: businessId của lựa chọn TKQC', () => {
  const draft = (extra: Record<string, unknown>): unknown => ({
    config: { partnerBmId: A, accountIds: ['x'], tasks: ['ANALYZE'] },
    step: 3,
    ...extra,
  });

  it('giữ businessId hợp lệ', () => {
    expect(parseDraft(draft({ businessId: B }))?.businessId).toBe(B);
  });

  it('bỏ businessId sai định dạng hoặc thiếu (bản nháp cũ)', () => {
    expect(
      parseDraft(draft({ businessId: 'abc' }))?.businessId
    ).toBeUndefined();
    expect(parseDraft(draft({ businessId: 42 }))?.businessId).toBeUndefined();
    expect(parseDraft(draft({}))?.businessId).toBeUndefined();
  });
});
