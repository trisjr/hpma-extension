// Chuyển từ tests/partner-readback.html (harness chạy trong trình duyệt) sang jsdom.
import { beforeEach, describe, expect, it } from 'vitest';

import { isAssignedAccount } from '@/content/flows/partnerAssign';

import { BM_ID } from '../helpers/fixtures';

const row = (name: string): string =>
  `<div role="listitem"><span>${name}</span><span>Quyền truy cập một phần</span><a href="/latest/settings/ad_accounts/?selected_asset_id=120253322039060067">View asset</a></div>`;
const panel = (rows: string, id = BM_ID, selected = true): string =>
  `<section><header>YumYum Network ID: <a href="?selected_partner_id=${id}">${id}</a></header><div><div role="tablist"><div role="tab" aria-selected="${selected}">Tài sản bạn đã chỉ định</div><div role="tab" aria-selected="${!selected}">Tài sản được chỉ định cho bạn</div></div></div><div role="list">${rows}</div></section>`;

function check(html: string, tokens = ['trisjr 01']): boolean {
  document.body.innerHTML = `<div id="fixture">${html}</div>`;
  return isAssignedAccount(BM_ID, tokens, 'vi');
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('Readback xác nhận đã gán (partner-readback.html)', () => {
  it('Already-open partner details confirmed', () => {
    expect(check(panel(row('TrisJr 01')))).toBe(true);
  });

  it('Wrong partner rejected', () => {
    expect(check(panel(row('TrisJr 01'), '9999999999999999'))).toBe(false);
  });

  it('Correct ID outside wrong partner details ignored', () => {
    expect(
      check(
        `<a href="#">${BM_ID}</a>${panel(row('TrisJr 01'), '9999999999999999')}`
      )
    ).toBe(false);
  });

  it('Assets assigned to you cannot confirm outgoing access', () => {
    expect(check(panel(row('TrisJr 01'), BM_ID, false))).toBe(false);
  });

  it('Name elsewhere on page ignored', () => {
    expect(check(`<div>TrisJr 01</div>${panel(row('Other'))}`)).toBe(false);
  });

  it('Partial name rejected', () => {
    expect(check(panel(row('TrisJr 010')))).toBe(false);
  });

  it('Missing asset rejected', () => {
    expect(check(panel(''))).toBe(false);
  });

  it('Duplicate names rejected', () => {
    expect(check(panel(row('TrisJr 01') + row('TrisJr 01')))).toBe(false);
  });

  it('Non-ad-account asset ignored', () => {
    expect(check(panel(row('TrisJr 01').replace('ad_accounts', 'pages')))).toBe(
      false
    );
  });

  it('Hidden row ignored', () => {
    expect(check(panel(`<div hidden>${row('TrisJr 01')}</div>`))).toBe(false);
  });

  it('Open wizard cannot confirm a write', () => {
    expect(
      check(
        `${panel(row('TrisJr 01'))}<div role="dialog">Wizard still open</div>`
      )
    ).toBe(false);
  });
});
