// Chuyển từ tests/partners-add.html (harness chạy trong trình duyệt) sang jsdom.
import { beforeEach, describe, expect, it } from 'vitest';

import { resolveOnce } from '@/content/engine/locator';
import SELECTORS from '@/content/engine/selectors';

const button = (id: string, label = 'Thêm'): string =>
  `<span><div id="${id}" role="button" aria-haspopup="menu">${label}</div></span>`;
const header = (id: string, label?: string): string =>
  `<div><div><input aria-label="Search"></div>${button(id, label)}</div>`;

function check(html: string, lang = 'vi'): string {
  document.body.innerHTML = html;
  const result = resolveOnce(SELECTORS.partnersAdd, lang);
  return result.ok ? result.el.id : result.reason;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('Partners Add locator (partners-add.html)', () => {
  it('No main: header and empty-state Add', () => {
    expect(
      check(
        `${header('header')}<div><h3>No Partners added yet</h3>${button('empty')}</div>`
      )
    ).toBe('header');
  });

  it('English duplicate Add', () => {
    expect(
      check(
        `${header('header', 'Add')}<div>${button('empty', 'Add')}</div>`,
        'en'
      )
    ).toBe('header');
  });

  it('Existing main scope', () => {
    expect(
      check(`${button('outside')}<main role="main">${button('inside')}</main>`)
    ).toBe('inside');
  });

  it('Single Add without header structure', () => {
    expect(check(button('single'))).toBe('single');
  });

  it('Hidden header ignored', () => {
    expect(
      check(`<div hidden>${header('hidden')}</div>${button('visible')}`)
    ).toBe('visible');
  });

  it('Two header candidates remain ambiguous', () => {
    expect(check(`${header('one')}${header('two')}`)).toBe('ambiguous');
  });

  it('Unrecognized duplicate layout remains ambiguous', () => {
    expect(check(`${button('one')}${button('two')}`)).toBe('ambiguous');
  });

  it('Missing Add', () => {
    expect(check('')).toBe('none');
  });
});
