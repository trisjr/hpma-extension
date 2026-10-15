import { describe, expect, it } from 'vitest';

import {
  businessChanged,
  classifyPath,
  classifyText,
  matchText,
} from '@/content/engine/signals';

describe('businessChanged', () => {
  const A = '1451597353550362';
  const B = '1451597353550999';

  it('chỉ true khi cả hai là ID hợp lệ và khác nhau', () => {
    expect(businessChanged(A, B)).toBe(true);
    expect(businessChanged(A, A)).toBe(false);
  });

  it('thiếu hoặc sai định dạng một phía thì không kết luận là đổi BM', () => {
    expect(businessChanged(undefined, B)).toBe(false);
    expect(businessChanged(A, undefined)).toBe(false);
    expect(businessChanged(A, 'abc')).toBe(false);
    expect(businessChanged('abc', B)).toBe(false);
  });
});

describe('classifyPath', () => {
  it('checkpoint và đăng nhập, không phân biệt hoa/thường', () => {
    expect(classifyPath('/checkpoint/1501092823525282')).toBe('ERR_CHECKPOINT');
    expect(classifyPath('/Login.php')).toBe('ERR_LOGGED_OUT');
    expect(classifyPath('/business/loginpage/')).toBe('ERR_LOGGED_OUT');
  });

  it('checkpoint thắng khi đường dẫn có cả hai', () => {
    expect(classifyPath('/checkpoint/login')).toBe('ERR_CHECKPOINT');
  });

  it('trang bình thường thì không có tín hiệu', () => {
    expect(classifyPath('/latest/settings/partners')).toBeUndefined();
  });
});

describe('classifyText (EN + VI)', () => {
  it.each([
    ['Please confirm your identity to continue', 'ERR_CHECKPOINT'],
    ['Chúng tôi phát hiện hoạt động bất thường', 'ERR_CHECKPOINT'],
    ['Xác minh danh tính của bạn', 'ERR_CHECKPOINT'],
    ['Security Check required', 'ERR_CHECKPOINT'],
    ['Your session has expired', 'ERR_LOGGED_OUT'],
    ['Phiên đăng nhập đã hết hạn', 'ERR_LOGGED_OUT'],
    ['You are temporarily blocked from this feature', 'ERR_RATE_LIMITED'],
    ['Bạn đã bị giới hạn tần suất. Hãy thử lại sau', 'ERR_RATE_LIMITED'],
    ["You can't use this feature right now", 'ERR_RATE_LIMITED'],
  ])('%s -> %s', (text, expected) => {
    expect(classifyText(text)).toBe(expected);
  });

  it('chịu được ký tự vô hình chen giữa từ khoá', () => {
    expect(classifyText('Blocked, try​ again later')).toBe('ERR_RATE_LIMITED');
  });

  it('"thử lại sau" đứng riêng là lỗi tạm thời, không phải rate-limit', () => {
    expect(
      classifyText('Something went wrong. Try again later')
    ).toBeUndefined();
    expect(classifyText('Đã xảy ra lỗi. Hãy thử lại sau')).toBeUndefined();
  });

  it('"thử lại sau" kèm từ nói rõ bị chặn/giới hạn thì vẫn là rate-limit', () => {
    expect(classifyText("You're blocked. Try again later")).toBe(
      'ERR_RATE_LIMITED'
    );
    expect(classifyText('Bạn bị chặn tạm thời, thử lại sau')).toBe(
      'ERR_RATE_LIMITED'
    );
  });

  it('matchText trả từ khoá đã khớp và đoạn đầu dialog làm bằng chứng', () => {
    expect(matchText('You are temporarily blocked from this feature')).toEqual({
      code: 'ERR_RATE_LIMITED',
      evidence: {
        keyword: 'temporarily blocked',
        snippet: 'you are temporarily blocked from this feature',
      },
    });
    expect(matchText('Blocked. Try again later')?.evidence.keyword).toBe(
      'try again later+blocked'
    );
    expect(matchText('x'.repeat(500))).toBeUndefined();
    expect(
      matchText(`captcha ${'y'.repeat(500)}`)?.evidence.snippet
    ).toHaveLength(160);
  });

  it('văn bản bình thường thì không có tín hiệu', () => {
    expect(classifyText('Chỉ định tài sản thành công')).toBeUndefined();
    expect(classifyText('')).toBeUndefined();
  });
});
