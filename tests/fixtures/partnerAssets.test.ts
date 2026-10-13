// Chuyển từ tests/partner-assets.html (harness chạy trong trình duyệt) sang jsdom.
import type { FlowContext } from '@/content/engine/runner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { findAssetCheckbox, resolveOnce } from '@/content/engine/locator';
import SELECTORS from '@/content/engine/selectors';
import partnerAssignFlow from '@/content/flows/partnerAssign';

import makeFlowContext from '../helpers/flowContext';
import { drive } from '../helpers/timers';

function locatorCheck(tabs: string, lang = 'vi'): string {
  document.body.innerHTML = `<div role="dialog">${tabs}</div>`;
  const result = resolveOnce(SELECTORS.assetTypeAdAccounts, lang);
  return result.ok ? result.el.id : result.reason;
}

function assetCheck(query: string, names: string[], lang = 'vi'): string {
  document.body.innerHTML = `<div role="dialog">${names.map((name, i) => `<label><input id="asset-${i}" type="checkbox">${name}</label>`).join('')}</div>`;
  const match = findAssetCheckbox(
    query,
    document.body.firstElementChild as HTMLElement,
    lang
  );
  return match.kind === 'found' ? match.checkbox.id : match.kind;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Tab loại tài sản (partner-assets.html)', () => {
  it('Plain nested label', () => {
    expect(
      locatorCheck('<div><span id="tab">Tài khoản quảng cáo</span></div>')
    ).toBe('tab');
  });

  it('English tab', () => {
    expect(
      locatorCheck('<div role="tab" id="tab">Ad accounts</div>', 'en')
    ).toBe('tab');
  });

  it('Hidden duplicate', () => {
    expect(
      locatorCheck(
        '<div hidden>Tài khoản quảng cáo</div><div id="tab">Tài khoản quảng cáo</div>'
      )
    ).toBe('tab');
  });

  it('Ambiguous tabs', () => {
    expect(
      locatorCheck(
        '<div>Tài khoản quảng cáo</div><div>Tài khoản quảng cáo</div>'
      )
    ).toBe('ambiguous');
  });

  it('Missing tab', () => {
    expect(locatorCheck('<div>Trang Facebook</div>')).toBe('none');
  });
});

describe('Chọn checkbox TKQC (partner-assets.html)', () => {
  it('ID picks first asset, skips Select all', () => {
    expect(
      assetCheck('1432650704915908', ['Chọn tất cả', 'TrisJr 01', 'Other'])
    ).toBe('asset-1');
  });

  it('act_ ID and English Select all', () => {
    expect(
      assetCheck('act_1432650704915908', ['Select all', 'TrisJr 01'], 'en')
    ).toBe('asset-1');
  });

  it('Name picks exact result, not first partial', () => {
    expect(assetCheck('Shop', ['Chọn tất cả', 'Shop Extra', 'Shop'])).toBe(
      'asset-2'
    );
  });

  it('Partial name rejected', () => {
    expect(assetCheck('Shop', ['Shop Extra'])).toBe('none');
  });

  it('Duplicate exact names rejected', () => {
    expect(assetCheck('Shop', ['Shop', 'Shop'])).toBe('ambiguous');
  });

  it('Empty search result', () => {
    expect(assetCheck('1432650704915908', ['Chọn tất cả'])).toBe('none');
  });
});

describe('Bước 4 của flow: chọn TKQC (partner-assets.html)', () => {
  it('Search replaces previous query, waits for results, selects ID then exact name', async () => {
    document.body.innerHTML = `<div role="dialog"><div id="tab"><span>Tài khoản quảng cáo</span></div><input type="search" aria-label="Tìm kiếm theo tên hoặc ID"><div id="assets"><label><input type="checkbox">Dev Tool</label></div></div>`;
    const selectedNames: string[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    (
      document.querySelector('input[type="search"]') as HTMLElement
    ).addEventListener('input', (event) => {
      clearTimeout(timer);
      const query = (event.target as HTMLInputElement).value;
      // Meta debounce: kết quả mới tới trễ, kết quả cũ còn hiện trong lúc chờ.
      timer = setTimeout(() => {
        let names = ['Chọn tất cả'];
        if (query === '1432650704915908') names = ['Chọn tất cả', 'TrisJr 01'];
        if (query === 'Shop') names = ['Chọn tất cả', 'Shop Extra', 'Shop'];
        (document.querySelector('#assets') as HTMLElement).innerHTML = names
          .map((name) => `<label><input type="checkbox">${name}</label>`)
          .join('');
        document
          .querySelectorAll('#assets input')
          .forEach((input) =>
            input.addEventListener('change', () =>
              selectedNames.push(input.parentElement?.textContent ?? '')
            )
          );
      }, 600);
    });
    let switched = false;
    document.querySelector('#tab')?.addEventListener('click', () => {
      switched = true;
    });
    const stop = new Error('step 4 complete');
    const { ctx, targets } = makeFlowContext({
      mode: 'assist',
      config: { queries: ['1432650704915908', 'Shop'] },
      step: (async (
        index: number,
        body: (h: { acted: () => void }) => unknown
      ) => {
        if (index < 4) return undefined;
        if (index > 4) throw stop;
        return body({ acted: () => undefined });
      }) as FlowContext['step'],
    });
    await expect(drive(partnerAssignFlow(ctx))).rejects.toBe(stop);
    expect(switched).toBe(true);
    expect(targets.every((target) => target.outcome === 'running')).toBe(true);
    expect(selectedNames).toEqual(['TrisJr 01', 'Shop']);
    expect(
      (
        document.querySelector(
          '#assets label:last-child input'
        ) as HTMLInputElement
      ).checked
    ).toBe(true);
  });
});
