/**
 * locator.ts — định vị phần tử đa tầng (file 17 §3, §9; FR-02).
 * Tìm lại từ DOM ở MỖI lần gọi (không giữ Element qua các bước), lọc phần tử ẩn,
 * strict-mode: ≥ 2 ứng viên cùng tầng thì xuống tầng dưới, hết tầng vẫn nhiều
 * thì báo mơ hồ — không bao giờ lấy `first()` mù.
 */
import type { LabelKey } from './labels';
import type { ActionContext } from './primitives';

import EngineError from './errors';
import { labelsOf } from './labels';
import { waitFor } from './primitives';
import { matchKey, normalizeText } from './text';

export type LocatorScope = 'document' | 'main' | 'dialog';

export type LocatorSpec = {
  // Khoá ổn định, xuất hiện trong mã lỗi/audit (vd. 'partners.add').
  key: string;
  // Ứng viên cơ sở (CSS), vd. 'button, [role="button"]'.
  css: string;
  // Tầng 1 (accessible name) và tầng 3 (text hiển thị).
  label?: LabelKey;
  match?: 'exact' | 'includes';
  // Tầng 2: thuộc tính chứa chuỗi (vd. href chứa 'partners').
  attrs?: { name: string; contains: string }[];
  // Tầng 4: CSS cấu trúc, phải ra đúng một phần tử trong phạm vi.
  structure?: string;
  scope: LocatorScope;
};

// Gốc để tìm ứng viên: cả trang hoặc một vùng (dialog/main).
export type SearchRoot = Document | HTMLElement;

export type Resolution =
  | { ok: true; el: HTMLElement; tier: number }
  | { ok: false; reason: 'none' | 'ambiguous' };

export function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest('[hidden],[aria-hidden="true"]')) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

// Hộp thoại mới nhất đang hiện (Comet có thể xếp chồng nhiều dialog).
export function activeDialog(root: SearchRoot = document): HTMLElement | null {
  const dialogs = Array.from(
    root.querySelectorAll<HTMLElement>('[role="dialog"]')
  ).filter(isVisible);
  return dialogs[dialogs.length - 1] ?? null;
}

function scopeRoot(scope: LocatorScope): SearchRoot | null {
  if (scope === 'dialog') return activeDialog();
  if (scope === 'main') {
    return (
      document.querySelector<HTMLElement>('[role="main"]') ?? document.body
    );
  }
  return document;
}

function ariaName(el: HTMLElement): string {
  const parts: string[] = [];
  const label = el.getAttribute('aria-label');
  if (label) parts.push(label);
  const ids = el.getAttribute('aria-labelledby');
  if (ids) {
    ids.split(/\s+/).forEach((id) => {
      const text = document.getElementById(id)?.textContent;
      if (text) parts.push(text);
    });
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    Array.from(el.labels ?? []).forEach((item) => {
      if (item.textContent) parts.push(item.textContent);
    });
  }
  const title = el.getAttribute('title');
  if (title) parts.push(title);
  return parts.join(' ');
}

function matches(
  haystack: string,
  names: string[],
  mode: 'exact' | 'includes'
): boolean {
  const text = normalizeText(haystack);
  if (text === '') return false;
  return names.some((name) => {
    const wanted = normalizeText(name);
    return mode === 'exact' ? text === wanted : text.includes(wanted);
  });
}

// Giữ phần tử trong cùng (loại phần tử bao ngoài nếu bên trong cũng khớp).
function innermost(found: HTMLElement[]): HTMLElement[] {
  return found.filter(
    (el) => !found.some((other) => other !== el && el.contains(other))
  );
}

function tierMatches(
  tier: number,
  candidates: HTMLElement[],
  spec: LocatorSpec,
  scope: SearchRoot,
  lang: string
): HTMLElement[] {
  const mode = spec.match ?? 'exact';
  const names = spec.label ? labelsOf(spec.label, lang) : [];
  if (tier === 1) {
    if (!spec.label) return [];
    return candidates.filter((el) => matches(ariaName(el), names, mode));
  }
  if (tier === 2) {
    const { attrs } = spec;
    if (!attrs || attrs.length === 0) return [];
    return candidates.filter((el) =>
      attrs.some((attr) =>
        (el.getAttribute(attr.name) ?? '').includes(attr.contains)
      )
    );
  }
  if (tier === 3) {
    if (!spec.label) return [];
    return candidates.filter((el) =>
      matches(el.textContent ?? '', names, mode)
    );
  }
  if (!spec.structure) return [];
  return Array.from(scope.querySelectorAll<HTMLElement>(spec.structure)).filter(
    isVisible
  );
}

// Một lần thử (đồng bộ). `lang` là `document.documentElement.lang`.
export function resolveOnce(spec: LocatorSpec, lang: string): Resolution {
  const scope = scopeRoot(spec.scope);
  if (!scope) return { ok: false, reason: 'none' };
  const candidates = Array.from(
    scope.querySelectorAll<HTMLElement>(spec.css)
  ).filter(isVisible);
  let ambiguous = false;
  for (let tier = 1; tier <= 4; tier += 1) {
    const found = innermost(tierMatches(tier, candidates, spec, scope, lang));
    if (found.length === 1) return { ok: true, el: found[0], tier };
    if (found.length > 1) ambiguous = true;
  }
  return { ok: false, reason: ambiguous ? 'ambiguous' : 'none' };
}

// Chờ tới khi định vị được đúng một phần tử. Mơ hồ có thể chỉ là tạm thời
// (đang tải) nên vẫn chờ; hết hạn thì báo đúng lý do cuối cùng.
export async function locate(
  spec: LocatorSpec,
  ctx: ActionContext,
  timeoutMs?: number
): Promise<HTMLElement> {
  // Gán trong closure nên TS không tự thu hẹp; ép kiểu để so sánh bên dưới hợp lệ.
  let last = 'none' as 'none' | 'ambiguous';
  try {
    return await waitFor(
      () => {
        const result = resolveOnce(spec, ctx.lang);
        if (result.ok) return result.el;
        last = result.reason;
        return undefined;
      },
      { signal: ctx.signal, timeoutMs }
    );
  } catch (error) {
    if (error instanceof EngineError && error.code === 'ERR_STEP_TIMEOUT') {
      throw new EngineError(
        last === 'ambiguous' ? 'ERR_LOCATE_AMBIGUOUS' : 'ERR_LOCATE_TIMEOUT',
        spec.key
      );
    }
    throw error;
  }
}

// Không bắt buộc phải có (vd. nút chọn loại tài sản): không thấy thì trả undefined.
export function tryResolve(
  spec: LocatorSpec,
  lang: string
): HTMLElement | undefined {
  const result = resolveOnce(spec, lang);
  return result.ok ? result.el : undefined;
}

export type AssetMatch =
  | { kind: 'found'; checkbox: HTMLElement; rowText: string }
  | { kind: 'none' }
  | { kind: 'ambiguous' };

const CHECKBOX_CSS = '[role="checkbox"], input[type="checkbox"]';

// Văn bản của hàng tài sản = ancestor gần nhất chỉ chứa đúng một checkbox.
function rowTextOf(checkbox: HTMLElement, root: SearchRoot): string {
  let node: HTMLElement | null = checkbox;
  for (let depth = 0; depth < 8 && node; depth += 1) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    if (parent.querySelectorAll(CHECKBOX_CSS).length > 1) break;
    node = parent;
    if (root instanceof Node && node === root) break;
  }
  return node?.textContent ?? '';
}

// Chỉ gọi sau khi search đã lọc danh sách: ID lấy hàng đầu, tên phải trùng chính xác.
export function findAssetCheckbox(
  query: string,
  root: SearchRoot,
  lang: string
): AssetMatch {
  const wanted = matchKey(query.replace(/^act_/i, ''));
  if (wanted === '') return { kind: 'none' };
  const idQuery = /^\d{10,}$/.test(wanted);
  const selectAll = labelsOf('asset.selectAll', lang).map(matchKey);
  const rows = Array.from(root.querySelectorAll<HTMLElement>(CHECKBOX_CSS))
    .filter((el) => isVisible(el) || isVisible(el.parentElement ?? el))
    .map((checkbox) => {
      const rowText = rowTextOf(checkbox, root);
      return { checkbox, rowText, key: matchKey(rowText) };
    })
    .filter((row) => row.key !== '' && !selectAll.includes(row.key));
  // Tên khớp chính xác: cả hàng, hoặc phần tên sau khi bỏ "ID: …" (cùng cách verifyTokens tách tên).
  const nameOf = (rowText: string): string =>
    matchKey(rowText.replace(/\bid\s*:?\s*\d[\d\s]*/gi, ' '));
  const pool = idQuery
    ? rows.slice(0, 1)
    : rows.filter(
        (row) => row.key === wanted || nameOf(row.rowText) === wanted
      );
  if (pool.length === 0) return { kind: 'none' };
  if (pool.length > 1) return { kind: 'ambiguous' };
  return {
    kind: 'found',
    checkbox: pool[0].checkbox,
    rowText: pool[0].rowText,
  };
}
