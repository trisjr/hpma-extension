// Chuẩn hoá để so khớp nhãn (PRD §4.3 điểm 2): Meta chèn ký tự vô hình
// (zero-width space, ...) vào nhãn nên so khớp chính xác sẽ trượt nếu không bỏ.
// Không bỏ dấu tiếng Việt: nhãn Meta có dấu đầy đủ (file 17 §4.2).
export function normalizeText(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\p{Cf}/gu, '')
    .replace(/\p{Zs}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Dùng khi so tên TKQC: gạch ngang/en dash/em dash coi như nhau.
export function matchKey(raw: string): string {
  return normalizeText(raw).replace(/[‐-―−]/g, '-');
}
