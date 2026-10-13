import { describe, expect, it } from 'vitest';

import { matchKey, normalizeText } from '@/content/engine/text';

describe('normalizeText', () => {
  it('bỏ ký tự vô hình (zero-width) Meta chèn vào nhãn', () => {
    expect(normalizeText('Th​êm')).toBe('thêm');
    expect(normalizeText('﻿Đối‍ tác')).toBe('đối tác');
  });

  it('gộp mọi loại khoảng trắng (NBSP, xuống dòng) thành một dấu cách', () => {
    expect(normalizeText('  Cấp cho\n\t đối   tác ')).toBe('cấp cho đối tác');
  });

  it('chuẩn hoá NFC nhưng giữ dấu tiếng Việt', () => {
    const decomposed = 'Tiếp'; // "Tiếp" ở dạng NFD
    expect(normalizeText(decomposed)).toBe(normalizeText('Tiếp'));
    expect(normalizeText('Tiếp')).toBe('tiếp');
    expect(normalizeText('Tiếp')).not.toBe(normalizeText('Tiep'));
  });
});

describe('matchKey', () => {
  it('coi các loại gạch ngang như nhau', () => {
    expect(matchKey('Shop – A')).toBe(matchKey('shop - a'));
    expect(matchKey('Shop — A')).toBe(matchKey('Shop ‐ A'));
    expect(matchKey('Shop − A')).toBe('shop - a');
  });
});
