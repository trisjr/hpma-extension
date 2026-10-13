import type { LocatorSpec } from '@/content/engine/locator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  activeDialog,
  findAssetCheckbox,
  isVisible,
  locate,
  resolveOnce,
  tryResolve,
} from '@/content/engine/locator';
import SELECTORS from '@/content/engine/selectors';
import RunStopped from '@/content/engine/stop';

import { drive } from '../helpers/timers';

const html = (markup: string): void => {
  document.body.innerHTML = markup;
};
const idOf = (result: ReturnType<typeof resolveOnce>): string =>
  result.ok ? result.el.id : result.reason;

beforeEach(() => {
  html('');
});

describe('isVisible (phần đồng bộ được trong jsdom)', () => {
  it('ẩn bằng hidden, aria-hidden, display:none, visibility:hidden, tổ tiên ẩn', () => {
    html(
      '<div id="ok"></div><div id="h" hidden></div><div aria-hidden="true"><i id="a"></i></div><div id="d" style="display:none"></div><div id="v" style="visibility:hidden"></div>'
    );
    const get = (id: string): Element => document.getElementById(id) as Element;
    expect(isVisible(get('ok'))).toBe(true);
    expect(isVisible(get('h'))).toBe(false);
    expect(isVisible(get('a'))).toBe(false);
    expect(isVisible(get('d'))).toBe(false);
    expect(isVisible(get('v'))).toBe(false);
    expect(isVisible(document.createElement('div'))).toBe(false);
  });
});

describe('activeDialog', () => {
  it('lấy hộp thoại hiện cuối cùng, bỏ qua hộp ẩn', () => {
    html(
      '<div role="dialog" id="a"></div><div role="dialog" id="b"></div><div role="dialog" id="c" hidden></div>'
    );
    expect(activeDialog()?.id).toBe('b');
    html('');
    expect(activeDialog()).toBeNull();
  });
});

describe('resolveOnce: các tầng', () => {
  const spec = (over: Partial<LocatorSpec>): LocatorSpec => ({
    key: 't',
    css: 'button, [role="button"], a, div',
    scope: 'document',
    ...over,
  });

  it('tầng 1: accessible name (aria-label / aria-labelledby / title)', () => {
    html(
      '<button id="a" aria-label="Tiếp"></button><button id="b">Hủy</button>'
    );
    expect(resolveOnce(spec({ label: 'dialog.next' }), 'vi')).toMatchObject({
      ok: true,
      tier: 1,
    });
    html(
      '<span id="l">Next</span><div id="x" role="button" aria-labelledby="l"></div>'
    );
    expect(idOf(resolveOnce(spec({ label: 'dialog.next' }), 'en'))).toBe('x');
  });

  it('tầng 2: thuộc tính chứa chuỗi', () => {
    html(
      '<a id="p" href="/latest/settings/partners?x=1">x</a><a href="/users">y</a>'
    );
    const result = resolveOnce(SELECTORS.navPartners, 'vi');
    expect(result).toMatchObject({ ok: true, tier: 2 });
    expect(idOf(result)).toBe('p');
  });

  it('tầng 3: text hiển thị, lấy phần tử trong cùng', () => {
    html('<div id="outer"><span id="inner">Tiếp</span></div>');
    const result = resolveOnce(
      spec({ label: 'dialog.next', css: 'div, span' }),
      'vi'
    );
    expect(result).toMatchObject({ ok: true, tier: 3 });
    expect(idOf(result)).toBe('inner');
  });

  it('tầng 4: cấu trúc khi nhãn trượt', () => {
    html('<div role="dialog"><input id="only" type="text"></div>');
    const result = resolveOnce(SELECTORS.bmIdInput, 'vi');
    expect(result).toMatchObject({ ok: true, tier: 4 });
    expect(idOf(result)).toBe('only');
  });

  it('khớp exact: "Thêm vào" không khớp nhãn "Thêm"; includes thì khớp', () => {
    html('<button id="a">Thêm vào</button>');
    expect(idOf(resolveOnce(spec({ label: 'partners.add' }), 'vi'))).toBe(
      'none'
    );
    expect(
      idOf(
        resolveOnce(spec({ label: 'partners.add', match: 'includes' }), 'vi')
      )
    ).toBe('a');
  });

  it('hai ứng viên cùng tầng thì xuống tầng dưới, hết tầng vẫn nhiều thì ambiguous', () => {
    html('<button id="a">Tiếp</button><button id="b">Tiếp</button>');
    expect(idOf(resolveOnce(spec({ label: 'dialog.next' }), 'vi'))).toBe(
      'ambiguous'
    );
    // Tầng 1 mơ hồ nhưng tầng 3 phân giải được thì lấy tầng 3.
    html(
      '<button id="a" aria-label="Tiếp">x</button><button id="b" aria-label="Tiếp">y</button><button id="c">Tiếp</button>'
    );
    expect(
      idOf(resolveOnce(spec({ label: 'dialog.next', css: 'button' }), 'vi'))
    ).toBe('c');
  });

  it('không có gì thì none; phần tử ẩn bị lọc', () => {
    html('<button hidden>Tiếp</button>');
    expect(idOf(resolveOnce(spec({ label: 'dialog.next' }), 'vi'))).toBe(
      'none'
    );
  });
});

describe('resolveOnce: phạm vi', () => {
  it('scope dialog chỉ tìm trong hộp thoại mới nhất; không có hộp thoại thì none', () => {
    html('<button id="out">Tiếp</button>');
    expect(idOf(resolveOnce(SELECTORS.next, 'vi'))).toBe('none');
    html(
      '<button>Tiếp</button><div role="dialog"><button id="in">Tiếp</button></div>'
    );
    expect(idOf(resolveOnce(SELECTORS.next, 'vi'))).toBe('in');
  });

  it('scope main ưu tiên [role=main], thiếu thì dùng body', () => {
    html(
      '<button id="out">Thêm</button><main role="main"><button id="in">Thêm</button></main>'
    );
    expect(idOf(resolveOnce(SELECTORS.partnersAdd, 'vi'))).toBe('in');
  });
});

describe('nhãn song ngữ EN/VI', () => {
  it.each([
    ['vi', 'Tiếp'],
    ['en', 'Next'],
    // locale detect sai vẫn tìm được vì luôn so cả hai bộ nhãn
    ['en', 'Tiếp'],
    ['vi', 'Next'],
  ])('lang=%s, nút "%s"', (lang, label) => {
    html(`<div role="dialog"><button id="n">${label}</button></div>`);
    expect(idOf(resolveOnce(SELECTORS.next, lang))).toBe('n');
  });

  it('nút Thêm/Add ở header (tầng 4 có :has) thắng nút empty-state', () => {
    const add = (id: string, label: string): string =>
      `<span><div id="${id}" role="button" aria-haspopup="menu">${label}</div></span>`;
    html(
      `<div><div><input aria-label="Search"></div>${add('header', 'Add')}</div><div>${add('empty', 'Add')}</div>`
    );
    expect(idOf(resolveOnce(SELECTORS.partnersAdd, 'en'))).toBe('header');
  });
});

describe('tryResolve', () => {
  it('trả phần tử hoặc undefined, không ném', () => {
    html('<div role="dialog"><button id="n">Next</button></div>');
    expect(tryResolve(SELECTORS.next, 'en')?.id).toBe('n');
    expect(tryResolve(SELECTORS.cancel, 'en')).toBeUndefined();
  });
});

describe('locate (chờ phần tử)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  const ctx = (controller = new AbortController()) => ({
    signal: controller.signal,
    lang: 'vi',
    gate: async () => undefined,
  });

  it('chờ tới khi phần tử xuất hiện', async () => {
    const result = locate(SELECTORS.next, ctx());
    setTimeout(() => {
      html('<div role="dialog"><button id="n">Tiếp</button></div>');
    }, 1500);
    expect((await drive(result)).id).toBe('n');
  });

  it('hết hạn: ERR_LOCATE_TIMEOUT kèm khoá locator', async () => {
    await expect(
      drive(locate(SELECTORS.next, ctx(), 1000))
    ).rejects.toMatchObject({
      code: 'ERR_LOCATE_TIMEOUT',
      detail: 'dialog.next',
    });
  });

  it('hết hạn mà vẫn mơ hồ: ERR_LOCATE_AMBIGUOUS', async () => {
    html('<div role="dialog"><button>Tiếp</button><button>Tiếp</button></div>');
    await expect(
      drive(locate(SELECTORS.next, ctx(), 1000))
    ).rejects.toMatchObject({
      code: 'ERR_LOCATE_AMBIGUOUS',
      detail: 'dialog.next',
    });
  });

  it('abort thì RunStopped, không phải lỗi locate', async () => {
    const controller = new AbortController();
    const result = locate(SELECTORS.next, ctx(controller));
    const assertion = expect(result).rejects.toBeInstanceOf(RunStopped);
    controller.abort();
    await assertion;
  });
});

describe('findAssetCheckbox', () => {
  const dialog = (names: string[]): HTMLElement => {
    html(
      `<div role="dialog">${names
        .map(
          (n, i) => `<label><input id="asset-${i}" type="checkbox">${n}</label>`
        )
        .join('')}</div>`
    );
    return document.querySelector('[role="dialog"]') as HTMLElement;
  };
  const kind = (query: string, names: string[], lang = 'vi'): string => {
    const match = findAssetCheckbox(query, dialog(names), lang);
    return match.kind === 'found' ? match.checkbox.id : match.kind;
  };

  it('ID: lấy hàng đầu, bỏ qua "Chọn tất cả"; chấp nhận tiền tố act_', () => {
    expect(
      kind('1432650704915908', ['Chọn tất cả', 'TrisJr 01', 'Other'])
    ).toBe('asset-1');
    expect(
      kind('act_1432650704915908', ['Select all', 'TrisJr 01'], 'en')
    ).toBe('asset-1');
  });

  it('tên: khớp chính xác, không lấy chuỗi con hay hàng đầu', () => {
    expect(kind('Shop', ['Chọn tất cả', 'Shop Extra', 'Shop'])).toBe('asset-2');
    expect(kind('shop', ['Shop Extra'])).toBe('none');
  });

  it('tên khớp sau khi bỏ phần "ID: ..." của hàng', () => {
    expect(kind('Shop Lan', ['Shop Lan ID: 1432650704915908'])).toBe('asset-0');
  });

  it('trùng tên chính xác thì ambiguous; rỗng thì none', () => {
    expect(kind('Shop', ['Shop', 'Shop'])).toBe('ambiguous');
    expect(kind('1432650704915908', ['Chọn tất cả'])).toBe('none');
    expect(kind('   ', ['Shop'])).toBe('none');
  });

  it('gạch ngang các loại coi như nhau khi so tên', () => {
    expect(kind('Shop - A', ['Shop – A'])).toBe('asset-0');
  });
});
