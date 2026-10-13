// Chuyển từ tests/partner-existing.html (harness chạy trong trình duyệt) sang jsdom.
import type { PartnerTask } from '@/shared/partnerAssign';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import partnerAssignFlow, {
  readExistingAccount,
} from '@/content/flows/partnerAssign';

import { BM_ID } from '../helpers/fixtures';
import makeFlowContext from '../helpers/flowContext';
import {
  ASSET_ID,
  assetRow,
  detailsPanel,
  mountPartnerPage,
  NEXT_ASSET_ID,
  PERMISSIONS_TEXT,
} from '../helpers/partnerPage';
import { drive } from '../helpers/timers';

function readCheck(
  html: string,
  query: string,
  tasks: PartnerTask[]
): ReturnType<typeof readExistingAccount> {
  document.body.innerHTML = `<main role="main" id="fixture">${html}</main>`;
  return readExistingAccount(BM_ID, query, tasks, 'vi');
}

type PageMode = Parameters<typeof mountPartnerPage>[0]['mode'];

type FlowRun = {
  error: { code?: string } | undefined;
  outcomes: string;
  page: ReturnType<typeof mountPartnerPage>;
};

async function flowCheck(
  mode: PageMode,
  queries: string[],
  options: { wrongIdentity?: boolean; tasks?: PartnerTask[] } = {}
): Promise<FlowRun> {
  const page = mountPartnerPage({ mode, wrongIdentity: options.wrongIdentity });
  const { ctx, targets, controller } = makeFlowContext({
    mode: 'dry',
    config: { queries, tasks: options.tasks ?? ['ANALYZE'] },
    // Bước 1 (điều hướng SPA) nằm ngoài phạm vi trang giả; các bước còn lại chạy thật.
    step: (async (
      index: number,
      body: (h: { acted: () => void }) => unknown
    ) => (index === 1 ? undefined : body({ acted: () => undefined }))) as never,
  });
  // Partner sai danh tính: flow không bao giờ tự kết thúc, harness gốc cũng huỷ sau 8 giây.
  const timeout = options.wrongIdentity
    ? setTimeout(() => controller.abort(), 8000)
    : undefined;
  let error: FlowRun['error'];
  try {
    await drive(partnerAssignFlow(ctx));
  } catch (caught) {
    error = caught as FlowRun['error'];
  }
  clearTimeout(timeout);
  // Bất biến của harness gốc, áp cho mọi ca (không ca nào được bỏ qua):
  // không bao giờ bấm Assign cuối; partner đã có thì không thêm lại; Dry-run luôn đóng wizard.
  expect(page.counters.writes, 'Assign cuối bị bấm').toBe(0);
  if (mode === 'open' || mode === 'search') {
    expect(page.counters.adds, 'thử thêm lại partner đã có').toBe(0);
  }
  if (mode === 'fallback') {
    expect(page.counters.nextClicks).toBe(1);
    expect(page.counters.adds).toBe(1);
  }
  if (!options.wrongIdentity) {
    expect(
      document.querySelector('[role="dialog"]'),
      'Dry-run phải đóng wizard'
    ).toBeNull();
  }
  return {
    error,
    outcomes: targets.map((target) => target.outcome).join(','),
    page,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Đọc quyền hiện có (partner-existing.html)', () => {
  const panel = (rows: string, partnerId = BM_ID): string =>
    detailsPanel(rows, partnerId);

  it('act_ ID from asset link', () => {
    expect(
      readCheck(
        panel(assetRow('Existing Account', PERMISSIONS_TEXT)),
        `act_${ASSET_ID}`,
        ['ANALYZE']
      )
    ).toBe('sufficient');
  });

  it('Exact name', () => {
    expect(
      readCheck(
        panel(assetRow('Existing Account', PERMISSIONS_TEXT)),
        'Existing Account',
        ['ADVERTISE', 'ANALYZE']
      )
    ).toBe('sufficient');
  });

  it('Full control covers requested permissions', () => {
    expect(
      readCheck(
        panel(assetRow('Existing Account', 'Quản lý tài khoản quảng cáo')),
        ASSET_ID,
        ['ADVERTISE', 'ANALYZE']
      )
    ).toBe('sufficient');
  });

  it('Missing full control needs review', () => {
    expect(
      readCheck(
        panel(assetRow('Existing Account', PERMISSIONS_TEXT)),
        ASSET_ID,
        ['MANAGE']
      )
    ).toBe('needs-review');
  });

  it('Unreadable permissions need review', () => {
    expect(
      readCheck(
        panel(assetRow('Existing Account', 'Quyền truy cập một phần')),
        ASSET_ID,
        ['ANALYZE']
      )
    ).toBe('needs-review');
  });

  it('Wrong partner rejected even with correct ID elsewhere', () => {
    expect(
      readCheck(
        `<a>${BM_ID}</a>${panel(assetRow('Existing Account', PERMISSIONS_TEXT), '9999999999999999')}`,
        ASSET_ID,
        ['ANALYZE']
      )
    ).toBe('needs-review');
  });

  it('Duplicate names need review', () => {
    expect(
      readCheck(
        panel(
          assetRow('Same', PERMISSIONS_TEXT) +
            assetRow('Same', PERMISSIONS_TEXT, NEXT_ASSET_ID)
        ),
        'Same',
        ['ANALYZE']
      )
    ).toBe('needs-review');
  });

  it('Missing account', () => {
    expect(
      readCheck(
        panel(assetRow('Existing Account', PERMISSIONS_TEXT)),
        NEXT_ASSET_ID,
        ['ANALYZE']
      )
    ).toBe('missing');
  });
});

describe('Flow trên partner đã có (partner-existing.html)', () => {
  it('Open existing partner: all sufficient, no wizard', async () => {
    const { error, outcomes, page } = await flowCheck('open', [ASSET_ID]);
    expect(error).toBeUndefined();
    expect(outcomes).toBe('skipped-existing');
    expect(page.counters).toMatchObject({ assetOpens: 0, writes: 0, adds: 0 });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('Existing account without requested full control stops before wizard', async () => {
    const { error, outcomes, page } = await flowCheck('open', [ASSET_ID], {
      tasks: ['MANAGE'],
    });
    expect(error?.code).toBe('ERR_EXISTING_PERMISSIONS');
    expect(outcomes).toBe('failed');
    expect(page.counters).toMatchObject({ assetOpens: 0, writes: 0 });
  });

  it('Find existing partner by ID and verify details', async () => {
    const { error, outcomes, page } = await flowCheck('search', [ASSET_ID]);
    expect(error).toBeUndefined();
    expect(outcomes).toBe('skipped-existing');
    expect(page.counters).toMatchObject({ adds: 0, writes: 0 });
  });

  it('Duplicate notice after Next falls back', async () => {
    const { error, outcomes, page } = await flowCheck('fallback', [ASSET_ID]);
    expect(error).toBeUndefined();
    expect(outcomes).toBe('skipped-existing');
    expect(page.counters).toMatchObject({ nextClicks: 1, adds: 1, writes: 0 });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('Existing partner: only missing account enters Dry-run wizard', async () => {
    const { error, outcomes, page } = await flowCheck('open', [
      ASSET_ID,
      NEXT_ASSET_ID,
    ]);
    expect(error).toBeUndefined();
    expect(outcomes).toBe('skipped-existing,done');
    expect(page.counters.writes).toBe(0);
    expect(page.counters.cancelled).toBe(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('New partner keeps original Dry-run path', async () => {
    const { error, outcomes, page } = await flowCheck('new', [NEXT_ASSET_ID]);
    expect(error).toBeUndefined();
    expect(outcomes).toBe('done');
    expect(page.counters.writes).toBe(0);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('Wrong partner from search cannot grant access', async () => {
    const { error, page } = await flowCheck('search', [ASSET_ID], {
      wrongIdentity: true,
    });
    expect(error).toBeDefined();
    expect(page.counters).toMatchObject({ assetOpens: 0, writes: 0 });
  });
});
