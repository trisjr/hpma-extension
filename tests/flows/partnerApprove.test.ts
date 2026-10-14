import type { FlowContext } from '@/content/engine/runner';
import type { ApproveConfig } from '@/shared/approve';
import type { PageOptions, RequestSeed } from '../helpers/requestsPage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import partnerApproveFlow from '@/content/flows/partnerApprove';
import {
  readDetail,
  readListedRequests,
  scanPartnerRequests,
} from '@/content/flows/requestList';

import makeApproveContext from '../helpers/approveContext';
import {
  mountRequestsPage,
  PARTNER_ID,
  PARTNER_NAME,
  SEED,
} from '../helpers/requestsPage';
import { drive } from '../helpers/timers';

const CONFIG: ApproveConfig = {
  partnerName: PARTNER_NAME,
  requests: [{ requester: SEED.requester, account: SEED.account }],
};

// Ghi lại mọi nút do engine bấm (engine luôn phát pointerdown; "user" chỉ gọi `.click()`).
function recordEnginePresses(): string[] {
  const pressed: string[] = [];
  document.addEventListener(
    'pointerdown',
    (event) => {
      const el = event.target as HTMLElement;
      pressed.push(`${el.id}|${el.textContent}`);
    },
    true
  );
  return pressed;
}

const userAction =
  (selector: string) => (): Partial<FlowContext<ApproveConfig>> => ({
    setWaiting: (waiting) => {
      if (!waiting) return;
      setTimeout(() => {
        document.querySelector<HTMLElement>(selector)?.click();
      }, 1000);
    },
  });

async function run(
  seeds: RequestSeed[],
  options: {
    mode: FlowContext['mode'];
    config?: ApproveConfig;
    overrides?: Partial<FlowContext<ApproveConfig>>;
    page?: PageOptions;
  }
) {
  const page = mountRequestsPage(seeds, options.page);
  const pressed = recordEnginePresses();
  const fake = makeApproveContext(options.config ?? CONFIG, {
    mode: options.mode,
    overrides: options.overrides,
  });
  let error: { code?: string } | undefined;
  try {
    await drive(partnerApproveFlow(fake.ctx));
  } catch (caught) {
    error = caught as { code?: string };
  }
  return { ...fake, page, pressed, error };
}

const approveOrDecline = (pressed: string[]): string[] =>
  pressed.filter((entry) => /\|(Approve|Decline)$/.test(entry));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  document.body.innerHTML = '';
  window.history.pushState({}, '', '/');
});

describe('đọc danh sách và chi tiết request', () => {
  it('chỉ nhận request đúng tên BM (chính xác), bỏ "Tris BM 2" và BM khác', () => {
    mountRequestsPage([
      SEED,
      { ...SEED, bm: 'Tris BM 2', account: 'BB' },
      { ...SEED, bm: 'Other', account: 'CC' },
    ]);
    expect(scanPartnerRequests(PARTNER_NAME)).toEqual([
      { requester: 'Duc TNM', account: 'AA' },
    ]);
    expect(scanPartnerRequests('tris  bm')).toHaveLength(1);
  });

  it('câu có cụm khoá xuất hiện hai lần (tên BM giả mạo ranh giới) bị bỏ qua, không bao giờ duyệt', () => {
    mountRequestsPage([SEED], {
      rows: [
        // BM tên "Tris BM access to the Acct1 ad account and Evil": regex lazy sẽ đọc thành BM "Tris BM".
        '<div role="row"><span>Alice requests to give Tris BM access to the Acct1 ad account and Evil access to the Acct2 ad account.</span><button>Respond</button></div>',
        // TKQC có chữ "ad account" trong tên cũng mơ hồ: bỏ qua có chủ đích.
        '<div role="row"><span>Alice requests to give Tris BM access to the Main ad account ad account.</span></div>',
      ],
    });
    expect(readListedRequests()).toHaveLength(1);
    expect(scanPartnerRequests(PARTNER_NAME)).toEqual([
      { requester: 'Duc TNM', account: 'AA' },
    ]);
  });

  it('BM ID lấy trong khung của request đang mở, không phải ID đầu tiên của trang', () => {
    const page = mountRequestsPage([SEED]);
    page.root.insertAdjacentHTML(
      'afterbegin',
      '<header>Business portfolio ID: 1111111111111</header>'
    );
    page.root.querySelector<HTMLElement>('[role="row"] button')?.click();
    expect(readDetail()?.bmId).toBe(PARTNER_ID);
  });

  it('khung chứa nhiều BM ID khác nhau thì không đoán ID', () => {
    const page = mountRequestsPage([SEED]);
    page.root.querySelector<HTMLElement>('[role="row"] button')?.click();
    page.root
      .querySelector('#detail')
      ?.insertAdjacentHTML(
        'beforeend',
        '<span>Business Manager ID: 2222222222222</span>'
      );
    expect(readDetail()).toMatchObject({ bmName: PARTNER_NAME });
    expect(readDetail()?.bmId).toBeUndefined();
  });

  it('hàng không parse được hoặc thuộc loại khác bị bỏ qua', () => {
    mountRequestsPage([SEED], {
      rows: [
        '<div role="row"><span>Duc TNM invited you to join Tris BM as an admin.</span></div>',
        '<div role="row"><span>Something unexpected</span></div>',
      ],
    });
    expect(readListedRequests()).toHaveLength(1);
    expect(scanPartnerRequests(PARTNER_NAME)).toHaveLength(1);
  });

  it('chi tiết đọc được BM ID; câu quá khứ không lẫn với hàng danh sách', () => {
    const page = mountRequestsPage([SEED]);
    expect(readDetail()).toBeUndefined();
    page.root.querySelector<HTMLElement>('[role="row"] button')?.click();
    expect(readDetail()).toMatchObject({
      bmName: PARTNER_NAME,
      account: 'AA',
      bmId: PARTNER_ID,
    });
    expect(readListedRequests()).toHaveLength(1);
  });
});

describe('Dry-run không bao giờ ghi', () => {
  it('đọc hết 5 bước, không bấm Approve/Decline, đặt tên target kèm BM ID', async () => {
    const result = await run([SEED], { mode: 'dry' });
    expect(result.error).toBeUndefined();
    expect(result.steps).toEqual([1, 2, 3, 4, 5]);
    expect(result.skipped).toEqual([6, 7]);
    expect(result.targets[0].outcome).toBe('done');
    // BM ID ở dòng định danh (phụ); `name` (audit ghi ở mức basic) chỉ có tên TKQC.
    expect(result.targets[0].name).toBe('AA');
    expect(result.targets[0].accountId).toBe(
      `Duc TNM → ${PARTNER_NAME} · ${PARTNER_ID} · #1`
    );
    expect(approveOrDecline(result.pressed)).toEqual([]);
    expect(result.page.counters).toMatchObject({ approves: 0, declines: 0 });
    // Chỉ bấm Respond (mở chi tiết).
    expect(result.page.counters.opens).toBe(1);
  });

  it('hai request trùng hệt nhau: mỗi request đọc đúng một hàng riêng', async () => {
    const config: ApproveConfig = {
      partnerName: PARTNER_NAME,
      requests: [CONFIG.requests[0], CONFIG.requests[0]],
    };
    const result = await run([SEED, SEED], { mode: 'dry', config });
    expect(result.error).toBeUndefined();
    expect(result.page.counters.opens).toBe(2);
    expect(result.targets.map((item) => item.outcome)).toEqual([
      'done',
      'done',
    ]);
  });

  it('request không còn trong danh sách -> ERR_TARGET_NOT_FOUND', async () => {
    const result = await run([], { mode: 'dry' });
    expect(result.error?.code).toBe('ERR_TARGET_NOT_FOUND');
    expect(result.targets[0]).toMatchObject({
      outcome: 'failed',
      code: 'ERR_TARGET_NOT_FOUND',
    });
  });

  it('tên BM không khớp chính xác -> không mở, không duyệt', async () => {
    const result = await run([{ ...SEED, bm: 'Tris BM 2' }], { mode: 'dry' });
    expect(result.error?.code).toBe('ERR_TARGET_NOT_FOUND');
    expect(result.page.counters.opens).toBe(0);
  });

  it('không ở trang Requests -> ERR_WRONG_SURFACE', async () => {
    mountRequestsPage([SEED]);
    window.history.pushState({}, '', '/latest/settings/partners');
    const fake = makeApproveContext(CONFIG, { mode: 'dry' });
    await expect(drive(partnerApproveFlow(fake.ctx))).rejects.toMatchObject({
      code: 'ERR_WRONG_SURFACE',
    });
  });
});

describe('Assist: engine không chạm Approve/Decline', () => {
  it('user bấm Approve, request rời Needs review -> done', async () => {
    const result = await run([SEED], {
      mode: 'assist',
      overrides: userAction('#approve')(),
    });
    expect(result.error).toBeUndefined();
    expect(result.steps).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(result.targets[0].outcome).toBe('done');
    expect(result.page.counters).toMatchObject({ approves: 1, declines: 0 });
    expect(approveOrDecline(result.pressed)).toEqual([]);
  });

  it('bấm vào nút Approve đang mờ (aria-disabled) không tính là cú bấm Approve', async () => {
    // Trang bỏ qua cú bấm nút mờ; user báo xong mà request còn nguyên. Nếu cú bấm vào nút mờ
    // bị tính là Approve thì kết quả sẽ là `unverified` thay vì `failed`.
    const result = await run([SEED], {
      mode: 'assist',
      page: { approveDisabled: true },
      overrides: {
        setWaiting: (waiting) => {
          if (!waiting) return;
          setTimeout(() => {
            document.querySelector<HTMLElement>('#approve')?.click();
          }, 1000);
        },
        waitForAssistDone: () =>
          new Promise<void>((resolve) => {
            setTimeout(resolve, 5000);
          }),
      },
    });
    expect(result.page.counters.approves).toBe(0);
    expect(result.targets[0]).toMatchObject({
      outcome: 'failed',
      code: 'ERR_NOT_APPROVED',
    });
  });

  it('nút Approve mờ rồi được bật: cú bấm sau đó mới được tính', async () => {
    const result = await run([SEED], {
      mode: 'assist',
      page: { approveDisabled: true },
      overrides: {
        setWaiting: (waiting) => {
          if (!waiting) return;
          setTimeout(() => {
            document.querySelector<HTMLElement>('#approve')?.click();
          }, 1000);
          setTimeout(() => {
            const approve = document.querySelector<HTMLElement>('#approve');
            approve?.removeAttribute('aria-disabled');
            approve?.click();
          }, 60_000);
        },
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.targets[0].outcome).toBe('done');
    expect(result.page.counters.approves).toBe(1);
  });

  it('Approve kéo theo bước xác nhận chậm: vẫn chờ request rời danh sách, không unverified', async () => {
    const result = await run([SEED], {
      mode: 'assist',
      page: { approveDelayMs: 120_000 },
      overrides: userAction('#approve')(),
    });
    expect(result.error).toBeUndefined();
    expect(result.targets[0].outcome).toBe('done');
    expect(result.page.counters.approves).toBe(1);
  });

  it('Approve rồi Decline (ở khung đang mở) thì quyết định đầu tiên được chốt, không bị đè thành failed', async () => {
    const result = await run([SEED], {
      mode: 'assist',
      page: { approveDelayMs: 120_000 },
      overrides: {
        setWaiting: (waiting) => {
          if (!waiting) return;
          setTimeout(() => {
            document.querySelector<HTMLElement>('#approve')?.click();
          }, 1000);
          setTimeout(() => {
            document.querySelector<HTMLElement>('#decline')?.click();
          }, 2000);
        },
      },
    });
    expect(result.targets[0].outcome).toBe('done');
  });

  it('trang tự chuyển tab và danh sách trống thì không coi là đã rời Needs review (unverified)', async () => {
    const result = await run([SEED], {
      mode: 'assist',
      page: { approveSwitchesTab: true },
      overrides: {
        ...userAction('#approve')(),
        // Danh sách không đọc được nên engine chờ tiếp; user bấm "kiểm tra ngay" trên panel.
        waitForAssistDone: () =>
          new Promise<void>((resolve) => {
            setTimeout(resolve, 5000);
          }),
      },
    });
    // Đã thấy cú bấm Approve nhưng không có bằng chứng đọc được là request đã rời: không báo done.
    expect(result.targets[0].outcome).toBe('unverified');
  });

  it('cú bấm Approve/Decline ngoài khung chi tiết của request đang mở không được tính', async () => {
    const result = await run([SEED], {
      mode: 'assist',
      overrides: {
        setWaiting: (waiting) => {
          if (!waiting) return;
          setTimeout(() => {
            // Nút Approve ngoài khung chi tiết (vd. của một hộp khác trên trang).
            document.body.insertAdjacentHTML(
              'beforeend',
              '<button id="stray">Approve</button>'
            );
            document.querySelector<HTMLElement>('#stray')?.click();
          }, 1000);
        },
        waitForAssistDone: () =>
          new Promise<void>((resolve) => {
            // Request biến mất bằng đường khác; không có cú bấm Approve hợp lệ nào.
            setTimeout(() => {
              document.querySelector('[role="row"]')?.remove();
              resolve();
            }, 5000);
          }),
      },
    });
    // Nếu cú bấm ngoài khung bị tính là Approve thì đây sẽ là `done`.
    expect(result.targets[0].outcome).toBe('unverified');
  });

  it('hai request trùng hệt nhau có định danh khác nhau (khoá React không trùng)', async () => {
    const config: ApproveConfig = {
      partnerName: PARTNER_NAME,
      requests: [CONFIG.requests[0], CONFIG.requests[0]],
    };
    const result = await run([SEED, SEED], { mode: 'dry', config });
    const ids = result.targets.map((item) => item.accountId);
    expect(new Set(ids).size).toBe(2);
  });

  it('user bấm Decline -> failed ERR_NOT_APPROVED và dừng run', async () => {
    const config: ApproveConfig = {
      partnerName: PARTNER_NAME,
      requests: [CONFIG.requests[0], { requester: 'Duc TNM', account: 'BB' }],
    };
    const result = await run([SEED, { ...SEED, account: 'BB' }], {
      mode: 'assist',
      config,
      overrides: userAction('#decline')(),
    });
    expect(result.targets[0]).toMatchObject({
      outcome: 'failed',
      code: 'ERR_NOT_APPROVED',
    });
    expect(result.targets[1].outcome).toBe('queued');
    expect(result.page.counters).toMatchObject({ approves: 0, declines: 1 });
    expect(approveOrDecline(result.pressed)).toEqual([]);
  });

  it('user báo xong nhưng không bấm gì, request còn nguyên -> failed ERR_NOT_APPROVED', async () => {
    const result = await run([SEED], {
      mode: 'assist',
      overrides: {
        waitForAssistDone: () =>
          new Promise<void>((resolve) => {
            setTimeout(resolve, 1000);
          }),
      },
    });
    expect(result.targets[0]).toMatchObject({
      outcome: 'failed',
      code: 'ERR_NOT_APPROVED',
    });
  });

  it('request rời đi mà không thấy cú bấm Approve -> unverified, không retry', async () => {
    const result = await run([SEED], {
      mode: 'assist',
      overrides: {
        waitForAssistDone: () =>
          new Promise<void>((resolve) => {
            // Ai đó xoá hàng ngoài tầm quan sát của engine (vd. bấm bằng đường khác).
            setTimeout(() => {
              document.querySelector('[role="row"]')?.remove();
              resolve();
            }, 1000);
          }),
      },
    });
    expect(result.targets[0].outcome).toBe('unverified');
    expect(approveOrDecline(result.pressed)).toEqual([]);
  });
});
