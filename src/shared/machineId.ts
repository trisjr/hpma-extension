/**
 * machineId.ts — định danh ổn định của một profile (SPEC-AUTO-001 §4.3).
 * `runtime.id` không ổn định giữa các profile/bản unpacked nên không dùng làm khoá: machineId là ULID
 * sinh một lần, lưu `storage.local`. Xoá dữ liệu extension = máy mới (ops phải gán lại claim).
 */
import browser from 'webextension-polyfill';

const STORAGE_KEY = 'remote:machineId';
// Bảng Crockford base32 của ULID (bỏ I, L, O, U).
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
// 10 ký tự thời gian (48 bit) + 16 ký tự ngẫu nhiên (80 bit).
const TIME_CHARS = 10;
const RANDOM_CHARS = 16;
export const MACHINE_ID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

export function isMachineId(value: unknown): value is string {
  return typeof value === 'string' && MACHINE_ID_PATTERN.test(value);
}

export function generateMachineId(now: number = Date.now()): string {
  let time = '';
  let remaining = now;
  for (let i = 0; i < TIME_CHARS; i += 1) {
    time = ALPHABET[remaining % 32] + time;
    remaining = Math.floor(remaining / 32);
  }
  const bytes = crypto.getRandomValues(new Uint8Array(RANDOM_CHARS));
  const random = Array.from(bytes, (byte) => ALPHABET[byte % 32]).join('');
  return time + random;
}

// Đọc machineId đã lưu; chưa có (hoặc hỏng) thì sinh mới và lưu.
export async function getMachineId(): Promise<string> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const current: unknown = stored[STORAGE_KEY];
  if (isMachineId(current)) return current;
  const created = generateMachineId();
  await browser.storage.local.set({ [STORAGE_KEY]: created });
  return created;
}
