// Chuyển từ tests/partner-permissions.html (harness chạy trong trình duyệt) sang jsdom.
import type { FlowContext } from '@/content/engine/runner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import partnerAssignFlow from '@/content/flows/partnerAssign';

import makeFlowContext from '../helpers/flowContext';
import { drive } from '../helpers/timers';

const stop = new Error('Reached write boundary');
const toggle = (id: string, label: string): string =>
  `<label><input id="${id}" type="checkbox" role="switch" aria-checked="false" aria-label="${label}">${label}</label>`;

type Tasks = ('ADVERTISE' | 'ANALYZE' | 'MANAGE')[];

// Chạy flow tới bước 5 (tick quyền) rồi dừng ở ranh giới bước ghi.
async function runPermissions(
  tasks: Tasks,
  setup: () => void = () => undefined
): Promise<{ error: unknown; checked: string; wrote: boolean }> {
  document.body.innerHTML = `<div role="dialog">
    <h4>Quyền truy cập một phần</h4>
    ${toggle('campaigns', 'Quản lý chiến dịch (quảng cáo)')}
    ${toggle('performance', 'Xem hiệu quả')}
    ${toggle('creative', 'Quản lý mẫu mô phỏng trong Creative Hub')}
    <h4>Quyền truy cập đầy đủ</h4>
    ${toggle('manage', 'Quản lý tài khoản quảng cáo')}
    <button id="assign">Chỉ định tài sản</button>
  </div>`;
  let wrote = false;
  const get = (id: string): HTMLInputElement =>
    document.getElementById(id) as HTMLInputElement;
  get('assign').onclick = () => {
    wrote = true;
  };
  document.querySelectorAll('input').forEach((input) => {
    input.addEventListener('change', () =>
      input.setAttribute('aria-checked', String(input.checked))
    );
  });
  // Quyền cao tự bật (và khoá) các quyền thấp, như UI thật của Meta.
  ['campaigns', 'manage'].forEach((id) => {
    get(id).addEventListener('change', (event) => {
      const implied =
        id === 'manage'
          ? ['campaigns', 'performance', 'creative']
          : ['performance', 'creative'];
      implied.forEach((key) => {
        const input = get(key);
        input.checked = (event.target as HTMLInputElement).checked;
        input.disabled = (event.target as HTMLInputElement).checked;
        input.setAttribute('aria-checked', String(input.checked));
      });
    });
  });
  setup();
  const { ctx } = makeFlowContext({
    mode: 'assist',
    config: { tasks, queries: ['Account'] },
    step: (async (
      index: number,
      body: (h: { acted: () => void }) => unknown
    ) => {
      if (index < 4) return undefined;
      if (index === 4) return [{ index: 0, tokens: ['account'] }];
      if (index > 5) throw stop;
      return body({ acted: () => undefined });
    }) as FlowContext['step'],
  });
  let error: unknown;
  try {
    await drive(partnerAssignFlow(ctx));
    error = new Error('Flow did not stop');
  } catch (caught) {
    error = caught;
  }
  const checked = Array.from(document.querySelectorAll('input'))
    .filter((input) => input.checked)
    .map((input) => input.id)
    .join(',');
  // Bất biến của harness gốc, áp cho mọi ca: không bao giờ bấm Assign.
  expect(wrote, 'Assign bị bấm').toBe(false);
  return { error, checked, wrote };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Quyền cấp trong wizard (partner-permissions.html)', () => {
  it('Heading is not a partial-access button', async () => {
    const result = await runPermissions(['ANALYZE']);
    expect(result.error).toBe(stop);
    expect(result.checked).toBe('performance');
    expect(result.wrote).toBe(false);
  });

  it('Campaigns includes disabled Performance and Creative Hub', async () => {
    const result = await runPermissions(['ADVERTISE', 'ANALYZE']);
    expect(result.error).toBe(stop);
    expect(result.checked).toBe('campaigns,performance,creative');
  });

  it('Full control includes all switches', async () => {
    const result = await runPermissions(['MANAGE']);
    expect(result.error).toBe(stop);
    expect(result.checked).toBe('campaigns,performance,creative,manage');
  });

  it('Unknown enabled permission still rejected', async () => {
    const result = await runPermissions(['ADVERTISE', 'ANALYZE'], () => {
      document
        .querySelector('[role="dialog"]')
        ?.insertAdjacentHTML(
          'beforeend',
          toggle('unknown', 'Unexpected permission')
        );
      (document.getElementById('unknown') as HTMLInputElement).checked = true;
    });
    expect(result.error).toMatchObject({ code: 'ERR_PERMISSION_MISMATCH' });
    expect(result.checked).toBe('campaigns,performance,creative,unknown');
    expect(result.wrote).toBe(false);
  });

  it('Extra Creative Hub permission rejected', async () => {
    const result = await runPermissions(['ANALYZE'], () => {
      (document.getElementById('creative') as HTMLInputElement).checked = true;
    });
    expect(result.error).toMatchObject({ code: 'ERR_PERMISSION_MISMATCH' });
    expect(result.checked).toBe('performance,creative');
  });

  it('Missing full-control switch prevents verification', async () => {
    const result = await runPermissions(['ANALYZE'], () => {
      document.getElementById('manage')?.remove();
    });
    expect(result.error).toMatchObject({ code: 'ERR_PERMISSION_MISMATCH' });
    expect(result.checked).toBe('performance');
  });

  it('Legacy partial selector still works', async () => {
    const result = await runPermissions(['ANALYZE'], () => {
      const heading = document.querySelector('h4') as HTMLElement;
      heading.outerHTML = toggle('partial', 'Quyền truy cập một phần');
      // The legacy selector enables the group; it is not itself a permission switch.
      document.getElementById('partial')?.setAttribute('role', 'radio');
    });
    expect(result.error).toBe(stop);
    expect(result.checked).toBe('partial,performance');
  });
});
