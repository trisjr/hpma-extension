import { beforeEach, describe, expect, it } from 'vitest';

import { detectStage, runProbe } from '@/content/engine/probe';

const html = (markup: string): void => {
  document.body.innerHTML = markup;
};
const run = (samples = 3) =>
  runProbe('vi-VN', new AbortController().signal, samples, 0);

beforeEach(() => {
  html('');
  document.documentElement.lang = 'vi';
});

describe('detectStage', () => {
  it('dialog > menu > page', () => {
    expect(detectStage()).toBe('page');
    html('<div role="menu"><button>x</button></div>');
    expect(detectStage()).toBe('menu');
    html(
      '<div role="menu"></div><div role="dialog"><span role="radio" aria-label="Quản lý chiến dịch (quảng cáo)">Quản lý chiến dịch (quảng cáo)</span></div>'
    );
    expect(detectStage()).toBe('dialog-access');
  });

  it('nhận ra từng bước của hộp thoại bằng mỏ neo', () => {
    html(
      '<div role="dialog"><input aria-label="Nhập ID đối tác kinh doanh"><button aria-label="Tiếp">Tiếp</button></div>'
    );
    expect(detectStage()).toBe('dialog-bm');
    html(
      '<div role="dialog"><input aria-label="Tìm kiếm theo tên hoặc ID"></div>'
    );
    expect(detectStage()).toBe('dialog-assets');
    html(
      '<div role="dialog"><input aria-label="Tìm kiếm theo tên hoặc ID"><span role="radio" aria-label="Quyền truy cập một phần">Quyền truy cập một phần</span></div>'
    );
    // Đã chọn tài sản: bước quyền hiện cùng bước chọn tài sản, quyền thắng.
    expect(detectStage()).toBe('dialog-access');
  });

  it('bước chọn tài sản chưa tick gì: nút Hủy và Chỉ định tài sản đã có sẵn nhưng không phải mỏ neo của bước quyền', () => {
    html(
      '<div role="dialog"><div>Tài khoản quảng cáo</div><input aria-label="Tìm kiếm theo tên hoặc ID"><button aria-label="Hủy">Hủy</button><button aria-label="Chỉ định tài sản">Chỉ định tài sản</button></div>'
    );
    expect(detectStage()).toBe('dialog-assets');
  });

  it('hộp thoại không khớp mỏ neo nào thì không đoán', () => {
    html('<div role="dialog"><button aria-label="Hủy">Hủy</button></div>');
    expect(detectStage()).toBeUndefined();
  });

  it('trang chi tiết partner nhận ra bằng nút Chỉ định tài sản trên trang', () => {
    html(
      '<div role="main"><button aria-label="Chỉ định tài sản">Chỉ định tài sản</button></div>'
    );
    expect(detectStage()).toBe('detail');
  });
});

describe('runProbe', () => {
  it('trên trang thường chỉ đo key của màn page; key màn khác là chưa đo', async () => {
    html('<div role="main"><button aria-label="Thêm">Thêm</button></div>');
    const report = await run();
    const byKey = new Map(report.keys.map((item) => [item.key, item]));
    expect(report.stage).toBe('page');
    expect(report.samples).toBe(3);
    expect(byKey.get('partners.add')).toMatchObject({
      measured: true,
      hits: 3,
      samples: 3,
      winTier: 1,
    });
    expect(byKey.get('dialog.assign')).toMatchObject({
      measured: false,
      samples: 0,
    });
    expect(byKey.get('partner.assign')?.measured).toBe(false);
    expect(byKey.get('partners.give')?.measured).toBe(false);
  });

  it('key không có trên trang là trượt (đã đo, hit 0), không phải chưa đo', async () => {
    html('<div role="main"></div>');
    const report = await run(2);
    const add = report.keys.find((item) => item.key === 'partners.add');
    expect(add).toMatchObject({ measured: true, hits: 0, samples: 2 });
    expect(add?.winTier).toBeUndefined();
    expect(report.rate).toBeLessThan(1);
  });

  it('báo tầng thắng thấp hơn 1 và các tầng trượt', async () => {
    // Không có aria-label khớp, chỉ có đường lui cấu trúc (tầng 4) cho partners.add.
    // Không dùng [role=main]: nwsapi (jsdom) không khớp `:has` khi querySelectorAll trên phần tử con.
    html(
      '<div><input type="text"><span><button aria-haspopup="menu">?</button></span></div>'
    );
    const report = await run(2);
    const add = report.keys.find((item) => item.key === 'partners.add');
    expect(add?.winTier).toBe(4);
    expect(add?.missTiers).toEqual([1, 3]);
  });

  it('hộp thoại không nhận ra bước thì từ chối đo, trừ khi user chọn màn tay', async () => {
    html('<div role="dialog"><button aria-label="Hủy">Hủy</button></div>');
    await expect(run()).rejects.toThrow('unknown screen');
    const report = await runProbe(
      'vi',
      new AbortController().signal,
      2,
      0,
      'dialog-access'
    );
    expect(report.stage).toBe('dialog-access');
  });

  it('chỉ key của bước đang xem được đo; key bước khác là chưa đo, không phải trượt', async () => {
    html(
      '<div role="dialog"><input aria-label="Nhập ID đối tác kinh doanh"><button aria-label="Tiếp">Tiếp</button></div>'
    );
    const report = await run(2);
    const byKey = new Map(report.keys.map((item) => [item.key, item]));
    expect(report.stage).toBe('dialog-bm');
    expect(byKey.get('dialog.bmId')).toMatchObject({ measured: true, hits: 2 });
    expect(byKey.get('dialog.next')).toMatchObject({ measured: true, hits: 2 });
    expect(byKey.get('dialog.accessPartial')?.measured).toBe(false);
    expect(byKey.get('dialog.assetSearch')?.measured).toBe(false);
    expect(report.rate).toBe(1);
  });

  it('màn chọn tay được tôn trọng dù tự nhận diện ra màn khác', async () => {
    html(
      '<div role="dialog"><input aria-label="Tìm kiếm theo tên hoặc ID"></div>'
    );
    const report = await runProbe(
      'vi',
      new AbortController().signal,
      2,
      0,
      'dialog-assets'
    );
    expect(report.stage).toBe('dialog-assets');
    expect(
      report.keys.find((item) => item.key === 'dialog.assetSearch')
    ).toMatchObject({ measured: true, hits: 2 });
  });

  it('trong dialog đo key dialog.*; vùng tìm chưa có thì không tính mẫu', async () => {
    html(
      '<div role="dialog"><button aria-label="Hủy">Hủy</button><button aria-label="Chỉ định tài sản">Chỉ định tài sản</button></div>'
    );
    const report = await runProbe(
      'vi',
      new AbortController().signal,
      2,
      0,
      'dialog-access'
    );
    expect(report.stage).toBe('dialog-access');
    expect(report.manual).toBe(true);
    expect(
      report.keys.find((item) => item.key === 'dialog.cancel')
    ).toMatchObject({
      measured: true,
      hits: 2,
    });
    expect(
      report.keys.find((item) => item.key === 'partners.add')?.measured
    ).toBe(false);
  });

  it('báo cáo không chứa query hay ID: chỉ pathname và lang hợp lệ', async () => {
    window.history.pushState(
      {},
      '',
      '/latest/settings/partners?business_id=123'
    );
    const report = await run(1);
    expect(report.pathname).toBe('/latest/settings/partners');
    expect(JSON.stringify(report)).not.toContain('business_id');
    document.documentElement.lang = '<script>';
    expect((await run(1)).lang).toBe('vi-VN');
  });

  it('che đoạn số dài trong pathname vì đó là ID', async () => {
    window.history.pushState({}, '', '/settings/ad-accounts/123456789');
    expect((await run(1)).pathname).toBe('/settings/ad-accounts/:id');
  });

  it('màn đổi giữa các mẫu thì dừng sớm', async () => {
    html('<div role="main"><button aria-label="Thêm">Thêm</button></div>');
    const promise = runProbe('vi', new AbortController().signal, 5, 5);
    setTimeout(() => html('<div role="dialog"></div>'), 2);
    const report = await promise;
    const add = report.keys.find((item) => item.key === 'partners.add');
    expect(add?.samples).toBeLessThan(5);
  });
});
