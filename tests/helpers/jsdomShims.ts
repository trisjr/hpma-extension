/**
 * Bù các chỗ jsdom không có/không tính (không sửa code production):
 * - jsdom không layout: `getBoundingClientRect` luôn 0×0 nên `isVisible` coi mọi thứ là ẩn.
 *   Shim trả hộp khác 0 cho phần tử còn trong cây; ẩn/hiện do `[hidden]`, `aria-hidden`,
 *   `display:none` quyết định (đúng các nhánh mà `isVisible` kiểm trước khi đo hộp).
 * - jsdom không có `innerText`: dùng `textContent`, bỏ nội dung của phần tử `hidden`.
 * - `scrollIntoView` không có.
 * Không kiểm thử được dưới jsdom: layout thật (che khuất, ngoài viewport), `isTrusted`.
 */

function visibleTextOf(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof HTMLElement)) return '';
  if (node.hidden || node.style.display === 'none') return '';
  return Array.from(node.childNodes).map(visibleTextOf).join('');
}

export default function installJsdomShims(): void {
  if (typeof window === 'undefined') return;
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    configurable: true,
    get(this: HTMLElement): string {
      return visibleTextOf(this);
    },
  });
  HTMLElement.prototype.scrollIntoView = () => undefined;
  Element.prototype.getBoundingClientRect = function getRect(
    this: Element
  ): DOMRect {
    const size = this.isConnected ? { width: 100, height: 20 } : null;
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: size?.width ?? 0,
      bottom: size?.height ?? 0,
      width: size?.width ?? 0,
      height: size?.height ?? 0,
      toJSON: () => ({}),
    };
  };
}
