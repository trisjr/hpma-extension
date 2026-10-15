import { describe, expect, it } from 'vitest';

import {
  generateMachineId,
  getMachineId,
  isMachineId,
} from '@/shared/machineId';

import { storageState } from '../helpers/browserMock';

describe('machineId', () => {
  it('sinh ULID đúng định dạng và tăng dần theo thời gian', () => {
    const a = generateMachineId(1_760_000_000_000);
    const b = generateMachineId(1_760_000_001_000);
    expect(isMachineId(a)).toBe(true);
    expect(a.slice(0, 10) < b.slice(0, 10)).toBe(true);
  });

  it('từ chối giá trị không phải ULID', () => {
    expect(isMachineId('abc')).toBe(false);
    expect(isMachineId('8'.repeat(26))).toBe(false);
    expect(isMachineId(undefined)).toBe(false);
  });

  it('ổn định qua nhiều lần đọc (lưu storage.local)', async () => {
    const first = await getMachineId();
    const second = await getMachineId();
    expect(isMachineId(first)).toBe(true);
    expect(second).toBe(first);
  });

  it('giá trị đã lưu bị hỏng thì sinh lại', async () => {
    storageState.data['remote:machineId'] = 'hong';
    const id = await getMachineId();
    expect(isMachineId(id)).toBe(true);
  });
});
