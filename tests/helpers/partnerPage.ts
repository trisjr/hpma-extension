/**
 * Trang Partners giả của Business Manager cho test flow (chuyển từ harness
 * tests/partner-existing.html). Mọi phần tử dựng bằng DOM thật của jsdom; các bộ đếm cho phép
 * khẳng định "Assign cuối cùng không bao giờ bị bấm" (FR-03) và "wizard đã được huỷ".
 */
import { BM_ID } from './fixtures';

export const ASSET_ID = '120253322039060067';
export const NEXT_ASSET_ID = '1432650704915908';
export const WRONG_BM_ID = '9999999999999999';
export const PERMISSIONS_TEXT =
  'Quản lý chiến dịch (quảng cáo), Xem hiệu quả và Quản lý mẫu mô phỏng trong Creative Hub';

export type PageMode = 'open' | 'search' | 'fallback' | 'new';

export type PartnerPage = {
  root: HTMLElement;
  counters: {
    writes: number;
    adds: number;
    assetOpens: number;
    nextClicks: number;
    cancelled: number;
  };
};

export type PageOptions = {
  mode: PageMode;
  // Partner tìm thấy lại là BM khác (không được cấp quyền cho nó).
  wrongIdentity?: boolean;
  // Chạy khi "user" bấm Assign cuối trong wizard (mặc định chỉ đếm).
  onAssign?: (page: PartnerPage) => void;
  // Chạy khi ô tìm TKQC của trang chi tiết partner được xoá về rỗng (Meta tự mở hộp thoại...).
  onAssetSearchCleared?: (page: PartnerPage) => void;
  // Trang chi tiết partner không có nút Assign của chính nó.
  hideDetailsAssign?: boolean;
  // Văn bản trợ giúp có sẵn trong wizard (vd. nhắc tới việc cần duyệt).
  wizardHelpText?: string;
};

export const assetRow = (
  name: string,
  permissions: string,
  assetId = ASSET_ID
): string =>
  `<div role="listitem"><span>${name}</span><span>${permissions}</span><a href="/latest/settings/ad_accounts/?selected_asset_id=${assetId}">View asset</a></div>`;

export const detailsPanel = (
  rows: string,
  partnerId = BM_ID,
  withAssign = true
): string =>
  `<section id="details"><header>ID: <a href="#">${partnerId}</a>${withAssign ? '<button id="openAssets">Chỉ định tài sản</button>' : ''}</header><div role="tab" aria-selected="true">Tài sản bạn đã chỉ định</div><input placeholder="Tìm kiếm theo tên hoặc ID"><div role="list">${rows}</div></section>`;

const SWITCH_LABELS = [
  'Quản lý chiến dịch (quảng cáo)',
  'Xem hiệu quả',
  'Quản lý mẫu mô phỏng trong Creative Hub',
  'Quản lý tài khoản quảng cáo',
];

export const wizardMarkup = (helpText = ''): string =>
  `<div role="dialog"><p>${helpText}</p><div>Tài khoản quảng cáo</div><input placeholder="Tìm kiếm theo tên hoặc ID"><div id="choices"><label><input type="checkbox">New Account</label></div>${SWITCH_LABELS.map((label) => `<label><input type="checkbox" role="switch" aria-label="${label}">${label}</label>`).join('')}<button id="cancel">Hủy</button><button id="assign">Chỉ định tài sản</button></div>`;

export function mountPartnerPage(options: PageOptions): PartnerPage {
  document.body.innerHTML = '<main role="main" id="fixture"></main>';
  const root = document.querySelector<HTMLElement>('#fixture') as HTMLElement;
  const page: PartnerPage = {
    root,
    counters: {
      writes: 0,
      adds: 0,
      assetOpens: 0,
      nextClicks: 0,
      cancelled: 0,
    },
  };
  const { counters } = page;
  const query = <T extends Element>(selector: string): T =>
    root.querySelector(selector) as T;

  function wizard(): void {
    counters.assetOpens += 1;
    root.querySelector('[role="dialog"]')?.remove();
    root.insertAdjacentHTML('beforeend', wizardMarkup(options.wizardHelpText));
    query<HTMLElement>('#cancel').onclick = () => {
      counters.cancelled += 1;
      query('[role="dialog"]').remove();
    };
    query<HTMLElement>('#assign').onclick = () => {
      counters.writes += 1;
      options.onAssign?.(page);
    };
  }

  function details(partnerId = BM_ID): void {
    root.querySelector('#details')?.remove();
    root.insertAdjacentHTML(
      'beforeend',
      detailsPanel(
        assetRow('Existing Account', PERMISSIONS_TEXT),
        partnerId,
        !options.hideDetailsAssign
      )
    );
    const open = root.querySelector<HTMLElement>('#openAssets');
    if (open) open.onclick = wizard;
    query<HTMLInputElement>('#details input').oninput = (event) => {
      const { value } = event.target as HTMLInputElement;
      query('[role="list"]').innerHTML =
        value === NEXT_ASSET_ID
          ? ''
          : assetRow('Existing Account', PERMISSIONS_TEXT);
      if (value === '') options.onAssetSearchCleared?.(page);
    };
  }

  root.innerHTML =
    '<div><div><input placeholder="Tìm kiếm theo tên hoặc ID"></div><span><button aria-haspopup="menu" id="add">Thêm</button></span></div><div role="grid" id="partners"></div>';
  let found = options.mode === 'search';
  const search = query<HTMLInputElement>('input');
  search.oninput = () => {
    query('#partners').innerHTML = found
      ? '<div role="row"><div role="gridcell"><div role="button" tabindex="0">Partner</div></div><div role="gridcell"><div role="button" tabindex="-1"><a href="#" id="partner">Details</a></div></div></div>'
      : '';
    const link = root.querySelector<HTMLElement>('#partner');
    if (link) {
      link.onclick = () => {
        if (link.isConnected) {
          details(options.wrongIdentity ? WRONG_BM_ID : BM_ID);
        }
      };
    }
  };
  // Meta có thể thay hàng khi ô tìm kiếm mất focus; phần tử cũ không mở chi tiết.
  search.onblur = search.oninput;
  if (options.mode === 'open') details();

  query<HTMLElement>('#add').onclick = () => {
    counters.adds += 1;
    root.insertAdjacentHTML(
      'beforeend',
      '<button id="give">Cấp cho đối tác quyền truy cập vào tài sản của bạn</button>'
    );
    query<HTMLElement>('#give').onclick = () => {
      query('#give').remove();
      root.insertAdjacentHTML(
        'beforeend',
        '<div role="dialog"><input aria-label="Nhập ID đối tác kinh doanh"><button id="cancel">Hủy</button><button id="next">Tiếp</button></div>'
      );
      query<HTMLElement>('#cancel').onclick = () => {
        counters.cancelled += 1;
        query('[role="dialog"]').remove();
      };
      query<HTMLElement>('#next').onclick = () => {
        counters.nextClicks += 1;
        if (options.mode === 'fallback') {
          found = true;
          query<HTMLButtonElement>('#next').disabled = true;
          query('[role="dialog"]').insertAdjacentHTML(
            'afterbegin',
            '<div>Đã có mối quan hệ kinh doanh với đối tác</div>'
          );
        } else wizard();
      };
    };
  };
  return page;
}
