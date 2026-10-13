import type { LabelKey } from '@/content/engine/labels';
import { describe, expect, it } from 'vitest';

import { LABELS, labelsOf } from '@/content/engine/labels';
import SELECTORS from '@/content/engine/selectors';

const keys = Object.keys(LABELS) as LabelKey[];

describe('LABELS (dữ liệu song ngữ)', () => {
  it.each(keys)('%s có cả nhãn vi và en, không rỗng', (key) => {
    const { vi, en } = LABELS[key];
    expect(vi.length).toBeGreaterThan(0);
    expect(en.length).toBeGreaterThan(0);
    [...vi, ...en].forEach((label) => expect(label.trim()).not.toBe(''));
  });

  it('mọi selector tham chiếu một khoá nhãn có thật', () => {
    Object.values(SELECTORS).forEach((spec) => {
      if ('label' in spec && spec.label) {
        expect(keys).toContain(spec.label);
      }
    });
  });

  it('khoá locator là duy nhất (xuất hiện trong mã lỗi/audit)', () => {
    const specKeys = Object.values(SELECTORS).map((spec) => spec.key);
    expect(new Set(specKeys).size).toBe(specKeys.length);
  });
});

describe('labelsOf', () => {
  it('locale trang lên đầu nhưng luôn gồm cả hai bộ nhãn', () => {
    expect(labelsOf('partners.add', 'vi')).toEqual(['Thêm', 'Add']);
    expect(labelsOf('partners.add', 'vi-VN')).toEqual(['Thêm', 'Add']);
    expect(labelsOf('partners.add', 'en-US')).toEqual(['Add', 'Thêm']);
    expect(labelsOf('partners.add', 'VI')[0]).toBe('Thêm');
  });

  it('locale lạ hoặc rỗng thì ưu tiên tiếng Anh, vẫn có tiếng Việt', () => {
    expect(labelsOf('dialog.next', '')).toEqual(['Next', 'Tiếp']);
    expect(labelsOf('dialog.next', 'fr')).toEqual(['Next', 'Tiếp']);
  });
});
