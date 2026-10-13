import { describe, expect, it } from 'vitest';

import RunStopped, { throwIfAborted } from '@/content/engine/stop';

describe('stop', () => {
  it('throwIfAborted chỉ ném khi signal đã abort', () => {
    const controller = new AbortController();
    expect(() => throwIfAborted(controller.signal)).not.toThrow();
    controller.abort();
    expect(() => throwIfAborted(controller.signal)).toThrow(RunStopped);
  });

  it('RunStopped phân biệt được với lỗi thường', () => {
    const error = new RunStopped();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('RunStopped');
  });
});
