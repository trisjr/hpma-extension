import type { FlowContext } from '@/content/engine/runner';
import type { RunTarget } from '@/shared/run';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { labelsOf } from '@/content/engine/labels';
import partnerAssignFlow, {
  approvalAppeared,
  verifyTokens,
} from '@/content/flows/partnerAssign';

import { BM_ID } from '../helpers/fixtures';
import makeFlowContext from '../helpers/flowContext';
import {
  assetRow,
  detailsPanel,
  mountPartnerPage,
  NEXT_ASSET_ID,
  PERMISSIONS_TEXT,
} from '../helpers/partnerPage';
import { drive } from '../helpers/timers';

type PageOptions = Parameters<typeof mountPartnerPage>[0];
type PartnerPage = ReturnType<typeof mountPartnerPage>;

const ASSIGN_LABEL = 'Chỉ định tài sản';

type StepBody = (h: { acted: () => void }) => unknown;

// Ghi lại mọi cú bấm do engine thực hiện (engine luôn phát pointerdown trước click;
// "user" trong test chỉ gọi `.click()` nên không để lại pointerdown).
function recordEngineClicks(): string[] {
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

const engineAssignClicks = (pressed: string[]): string[] =>
  pressed.filter((entry) => entry.endsWith(`|${ASSIGN_LABEL}`));

type Run = {
  error: { code?: string; detail?: string } | undefined;
  targets: RunTarget[];
  skipped: number[];
  steps: number[];
  page: PartnerPage;
  pressed: string[];
};

// Chạy cả flow (bước 1 thật) trên trang partner giả.
async function runFlow(
  page: PageOptions,
  context: {
    mode: FlowContext['mode'];
    queries: string[];
    skipStepOne?: boolean;
    overrides?: (page: PartnerPage) => Partial<FlowContext>;
  }
): Promise<Run> {
  window.history.pushState({}, '', '/latest/settings/partners');
  const mounted = mountPartnerPage(page);
  document.body.insertAdjacentHTML(
    'afterbegin',
    '<a href="/latest/settings/partners" id="nav">Đối tác</a>'
  );
  const pressed = recordEngineClicks();
  const fake = makeFlowContext({
    mode: context.mode,
    config: { queries: context.queries },
    overrides: context.overrides?.(mounted),
    step: context.skipStepOne
      ? ((async (index: number, body: StepBody) =>
          index === 1 ? undefined : body({ acted: () => undefined })) as never)
      : undefined,
  });
  let error: Run['error'];
  try {
    await drive(partnerAssignFlow(fake.ctx));
  } catch (caught) {
    error = caught as Run['error'];
  }
  return { error, ...fake, page: mounted, pressed };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  document.body.innerHTML = '';
  window.history.pushState({}, '', '/');
});

describe('Dry-run không bao giờ ghi', () => {
  it('đi hết các bước (kể cả bước 1 thật), huỷ wizard, không bấm Assign', async () => {
    const run = await runFlow(
      { mode: 'new' },
      { mode: 'dry', queries: [NEXT_ASSET_ID] }
    );
    expect(run.error).toBeUndefined();
    expect(run.targets[0].outcome).toBe('done');
    expect(run.steps).toEqual([1, 2, 3, 4, 5, 6]);
    expect(run.skipped).toEqual([6, 7]);
    expect(run.page.counters.writes).toBe(0);
    expect(run.page.counters.cancelled).toBe(1);
    expect(engineAssignClicks(run.pressed)).toEqual([]);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('đã đến bước ghi mà lỗi giữa chừng thì dry vẫn huỷ wizard đã cấu hình sẵn', async () => {
    // Quyền ngoài phần cần cấp bị bật sẵn: assertExactPermissions ném, wizard đã mở.
    const run = await runFlow(
      { mode: 'new' },
      {
        mode: 'dry',
        queries: [NEXT_ASSET_ID],
        overrides: () => ({
          pause: async () => {
            const creative = Array.from(
              document.querySelectorAll<HTMLInputElement>('[role="switch"]')
            ).find(
              (input) =>
                input.getAttribute('aria-label') ===
                'Quản lý mẫu mô phỏng trong Creative Hub'
            );
            if (creative) creative.checked = true;
          },
        }),
      }
    );
    expect(run.error?.code).toBe('ERR_PERMISSION_MISMATCH');
    expect(run.page.counters.writes).toBe(0);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(run.page.counters.cancelled).toBe(1);
  });
});

describe('Assist: engine không chạm nút Assign', () => {
  const toast = (text: string) => (page: PartnerPage) => {
    page.root.querySelector('[role="dialog"]')?.remove();
    if (text) {
      page.root.insertAdjacentHTML(
        'beforeend',
        `<div role="status">${text}</div>`
      );
    }
  };

  // "User" bấm Assign sau khi engine báo đang chờ.
  const userClicksAssign = (page: PartnerPage) => (): Partial<FlowContext> => ({
    setWaiting: (waiting) => {
      if (!waiting) return;
      setTimeout(() => {
        page.root.querySelector<HTMLElement>('#assign')?.click();
      }, 1000);
    },
  });

  it('toast báo cần duyệt mới xuất hiện sau Assign -> pending-approval và dừng run', async () => {
    const run = await runFlow(
      {
        mode: 'new',
        onAssign: toast(
          'Yêu cầu của bạn cần được phê duyệt bởi quản trị viên khác'
        ),
      },
      {
        mode: 'assist',
        queries: [NEXT_ASSET_ID],
        overrides: (page) => userClicksAssign(page)(),
      }
    );
    expect(run.error).toBeUndefined();
    expect(run.targets[0].outcome).toBe('pending-approval');
    expect(run.skipped).toEqual([7]);
    expect(run.steps).not.toContain(7);
    expect(run.page.counters.writes).toBe(1);
    expect(engineAssignClicks(run.pressed)).toEqual([]);
  });

  it('cụm báo duyệt đã có sẵn trong văn bản trợ giúp của wizard thì KHÔNG tính là pending; không đọc lại được thì unverified (không bao giờ done)', async () => {
    const run = await runFlow(
      {
        mode: 'new',
        wizardHelpText: 'Đối tác khác cần được phê duyệt trước khi bạn thêm',
        onAssign: toast(''),
      },
      {
        mode: 'assist',
        queries: [NEXT_ASSET_ID],
        overrides: (page) => userClicksAssign(page)(),
      }
    );
    expect(run.targets[0].outcome).toBe('unverified');
    expect(run.steps).toContain(7);
    expect(engineAssignClicks(run.pressed)).toEqual([]);
  });

  it('đọc lại thấy TKQC trong danh sách đã chỉ định của đúng partner -> done', async () => {
    const run = await runFlow(
      {
        mode: 'new',
        onAssign: (page) => {
          page.root.querySelector('[role="dialog"]')?.remove();
          page.root.insertAdjacentHTML(
            'beforeend',
            detailsPanel(
              assetRow('New Account', PERMISSIONS_TEXT),
              BM_ID,
              false
            )
          );
        },
      },
      {
        mode: 'assist',
        queries: [NEXT_ASSET_ID],
        overrides: (page) => userClicksAssign(page)(),
      }
    );
    expect(run.error).toBeUndefined();
    expect(run.targets[0].outcome).toBe('done');
    expect(run.page.counters.writes).toBe(1);
    expect(engineAssignClicks(run.pressed)).toEqual([]);
  });

  it('chỉ cho user bấm khi đã tick đủ quyền: engine chờ qua setWaiting', async () => {
    const waits: boolean[] = [];
    const run = await runFlow(
      { mode: 'new', onAssign: toast('') },
      {
        mode: 'assist',
        queries: [NEXT_ASSET_ID],
        overrides: (page) => ({
          setWaiting: (waiting: boolean) => {
            waits.push(waiting);
            if (waiting) {
              const checked = Array.from(
                page.root.querySelectorAll<HTMLInputElement>('[role="switch"]')
              )
                .filter((input) => input.checked)
                .map((input) => input.getAttribute('aria-label'));
              expect(checked).toEqual(['Xem hiệu quả']);
              setTimeout(() => {
                page.root.querySelector<HTMLElement>('#assign')?.click();
              }, 500);
            }
          },
        }),
      }
    );
    expect(waits).toEqual([true, false]);
    expect(run.page.counters.writes).toBe(1);
  });
});

describe('Full: engine tự bấm Assign đúng một lần mỗi mẻ', () => {
  const closeDialog = (page: PartnerPage): void => {
    page.root.querySelector('[role="dialog"]')?.remove();
  };
  // markWriteStarted ghi lại để kiểm "gọi trước cú bấm".
  const withWriteSpy = (
    page: PartnerPage,
    marks: number[]
  ): Partial<FlowContext> => ({
    markWriteStarted: () => {
      marks.push(page.counters.writes);
    },
  });

  it('bấm Assign một lần sau markWriteStarted, hộp thoại đóng, đọc lại thấy -> done', async () => {
    const marks: number[] = [];
    const run = await runFlow(
      {
        mode: 'new',
        onAssign: (page) => {
          closeDialog(page);
          page.root.insertAdjacentHTML(
            'beforeend',
            detailsPanel(
              assetRow('New Account', PERMISSIONS_TEXT),
              BM_ID,
              false
            )
          );
        },
      },
      {
        mode: 'full',
        queries: [NEXT_ASSET_ID],
        overrides: (page) => withWriteSpy(page, marks),
      }
    );
    expect(run.error).toBeUndefined();
    expect(run.targets[0].outcome).toBe('done');
    expect(engineAssignClicks(run.pressed)).toHaveLength(1);
    expect(run.page.counters.writes).toBe(1);
    // markWriteStarted chạy khi chưa có lần ghi nào (tức trước cú bấm).
    expect(marks).toEqual([0]);
  });

  it('toast báo cần duyệt sau Assign -> pending-approval và dừng run, không bấm lại', async () => {
    const run = await runFlow(
      {
        mode: 'new',
        onAssign: (page) => {
          closeDialog(page);
          page.root.insertAdjacentHTML(
            'beforeend',
            '<div role="status">Yêu cầu của bạn cần được phê duyệt bởi quản trị viên khác</div>'
          );
        },
      },
      { mode: 'full', queries: [NEXT_ASSET_ID] }
    );
    expect(run.error).toBeUndefined();
    expect(run.targets[0].outcome).toBe('pending-approval');
    expect(engineAssignClicks(run.pressed)).toHaveLength(1);
    expect(run.steps).not.toContain(7);
  });

  it('đã bấm mà không đọc lại được -> unverified, không bao giờ done', async () => {
    const run = await runFlow(
      { mode: 'new', onAssign: closeDialog },
      { mode: 'full', queries: [NEXT_ASSET_ID] }
    );
    expect(run.targets[0].outcome).toBe('unverified');
    expect(engineAssignClicks(run.pressed)).toHaveLength(1);
  });

  it('hộp thoại không đóng sau khi bấm: dừng bằng ERR_STEP_TIMEOUT, không bấm thêm, không huỷ wizard', async () => {
    const run = await runFlow(
      { mode: 'new', onAssign: () => undefined },
      { mode: 'full', queries: [NEXT_ASSET_ID] }
    );
    expect(run.error?.code).toBe('ERR_STEP_TIMEOUT');
    expect(engineAssignClicks(run.pressed)).toHaveLength(1);
    expect(run.page.counters.cancelled).toBe(0);
  });

  it('lỗi trước khi bấm Assign: huỷ wizard đã cấu hình sẵn và không ghi gì', async () => {
    const run = await runFlow(
      { mode: 'new' },
      {
        mode: 'full',
        queries: [NEXT_ASSET_ID],
        overrides: () => ({
          pause: async () => {
            const creative = Array.from(
              document.querySelectorAll<HTMLInputElement>('[role="switch"]')
            ).find(
              (input) =>
                input.getAttribute('aria-label') ===
                'Quản lý mẫu mô phỏng trong Creative Hub'
            );
            if (creative) creative.checked = true;
          },
        }),
      }
    );
    expect(run.error?.code).toBe('ERR_PERMISSION_MISMATCH');
    expect(run.page.counters.writes).toBe(0);
    expect(run.page.counters.cancelled).toBe(1);
    expect(engineAssignClicks(run.pressed)).toEqual([]);
  });
});

describe('Chặn khi có hộp chọn TKQC (checkbox picker) mở', () => {
  // Meta tự mở hộp thoại ngay khi ô tìm TKQC của partner bị xoá (trước khi engine bấm Assign).
  const pickerDialog = (withCheckbox: boolean): string =>
    `<div role="dialog">${withCheckbox ? '<label><input type="checkbox">Acc</label>' : ''}<button id="rogue">${ASSIGN_LABEL}</button></div>`;

  it('hộp có checkbox đang mở: ERR_UNEXPECTED_DIALOG, không bấm nút trùng nhãn Assign', async () => {
    const run = await runFlow(
      {
        mode: 'open',
        onAssetSearchCleared: (page) =>
          page.root.insertAdjacentHTML('beforeend', pickerDialog(true)),
      },
      { mode: 'assist', queries: [NEXT_ASSET_ID], skipStepOne: true }
    );
    expect(run.error).toMatchObject({
      code: 'ERR_UNEXPECTED_DIALOG',
      detail: 'partner.assign',
    });
    expect(run.pressed.filter((entry) => entry.includes(ASSIGN_LABEL))).toEqual(
      []
    );
    expect(run.page.counters).toMatchObject({ assetOpens: 0, writes: 0 });
  });

  it('nút Assign định vị được nằm trong hộp thoại (không phải nút của trang): chặn', async () => {
    const run = await runFlow(
      {
        mode: 'open',
        hideDetailsAssign: true,
        onAssetSearchCleared: (page) =>
          page.root.insertAdjacentHTML('beforeend', pickerDialog(false)),
      },
      { mode: 'assist', queries: [NEXT_ASSET_ID], skipStepOne: true }
    );
    expect(run.error).toMatchObject({
      code: 'ERR_UNEXPECTED_DIALOG',
      detail: 'partner.assign',
    });
    expect(run.pressed.filter((entry) => entry.includes(ASSIGN_LABEL))).toEqual(
      []
    );
  });

  it('đối chứng: không có hộp thoại nào thì engine mở wizard bằng nút Assign của trang', async () => {
    const run = await runFlow(
      { mode: 'open' },
      { mode: 'dry', queries: [NEXT_ASSET_ID], skipStepOne: true }
    );
    expect(run.error).toBeUndefined();
    expect(run.page.counters.assetOpens).toBe(1);
    expect(run.page.counters.writes).toBe(0);
  });
});

describe('Bước 1: đúng trang, không có hộp thoại lạ', () => {
  it('không ở trang settings -> ERR_WRONG_SURFACE (không điều hướng bằng href)', async () => {
    window.history.pushState({}, '', '/somewhere');
    document.body.innerHTML = '<a href="/latest/settings/partners">Đối tác</a>';
    const { ctx } = makeFlowContext({ mode: 'dry' });
    await expect(drive(partnerAssignFlow(ctx))).rejects.toMatchObject({
      code: 'ERR_WRONG_SURFACE',
    });
  });

  it('có hộp thoại đang mở -> ERR_UNEXPECTED_DIALOG', async () => {
    window.history.pushState({}, '', '/latest/settings');
    document.body.innerHTML = '<div role="dialog">Hộp thoại lạ</div>';
    const { ctx } = makeFlowContext({ mode: 'dry' });
    await expect(drive(partnerAssignFlow(ctx))).rejects.toMatchObject({
      code: 'ERR_UNEXPECTED_DIALOG',
    });
  });
});

describe('Chia mẻ', () => {
  it('12 TKQC -> hai mẻ (10 + 2), nghỉ kiểu "batch" giữa các mẻ', async () => {
    const batches: [number, number, number[]][] = [];
    const pauses: string[] = [];
    const { ctx } = makeFlowContext({
      mode: 'dry',
      config: { queries: Array.from({ length: 12 }, (_, i) => `acc${i}`) },
      // Mọi TKQC "đã đủ quyền" -> bước 4 trả mảng rỗng, flow sang mẻ sau.
      step: (async (index: number) => (index === 4 ? [] : undefined)) as never,
      overrides: {
        beginBatch: (index, total, targets) => {
          batches.push([index, total, targets]);
        },
        pause: async (kind) => {
          pauses.push(kind);
        },
      },
    });
    await drive(partnerAssignFlow(ctx));
    expect(batches).toEqual([
      [1, 2, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]],
      [2, 2, [10, 11]],
    ]);
    expect(pauses.filter((kind) => kind === 'batch')).toHaveLength(1);
  });
});

describe('hàm thuần của flow', () => {
  it('verifyTokens lấy ID số dài và tên (bỏ phần "ID: ...") từ hàng đã chọn', () => {
    expect(verifyTokens('Shop Lan ID: 1432650704915908')).toEqual([
      '1432650704915908',
      'shop lan',
    ]);
    expect(verifyTokens('Shop Lan')).toEqual(['shop lan']);
  });

  it('approvalAppeared chỉ tính cụm MỚI so với baseline (EN và VI)', () => {
    const phrases = labelsOf('signal.approval', 'vi');
    expect(
      approvalAppeared(phrases, 'wizard', 'wizard cần được phê duyệt')
    ).toBe(true);
    expect(
      approvalAppeared(
        phrases,
        'wizard cần được phê duyệt',
        'wizard cần được phê duyệt'
      )
    ).toBe(false);
    expect(
      approvalAppeared(
        labelsOf('signal.approval', 'en'),
        'help',
        'help someone needs approval from you'
      )
    ).toBe(true);
    expect(approvalAppeared(phrases, 'a', 'đã chỉ định thành công')).toBe(
      false
    );
  });
});
