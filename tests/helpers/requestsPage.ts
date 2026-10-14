/**
 * Trang Settings › Requests giả (dựng theo ảnh chụp 14/10/2026, locale en) cho test flow duyệt.
 * Bộ đếm cho phép khẳng định "engine không bao giờ bấm Approve/Decline" (SPEC-ENG-002):
 * `approves`/`declines` chỉ tăng khi có ai bấm nút; test phân biệt user với engine bằng
 * pointerdown (engine luôn phát pointerdown trước click, `.click()` của "user" thì không).
 */
export const PARTNER_NAME = 'Tris BM';
export const PARTNER_ID = '4680448748947419';

export type RequestSeed = {
  requester: string;
  bm: string;
  account: string;
  bmId?: string;
};

export type RequestsPage = {
  root: HTMLElement;
  counters: { opens: number; approves: number; declines: number };
};

export const SEED: RequestSeed = {
  requester: 'Duc TNM',
  bm: PARTNER_NAME,
  account: 'AA',
  bmId: PARTNER_ID,
};

const row = (seed: RequestSeed, i: number): string =>
  `<div role="row" data-i="${i}"><span>${seed.requester} requests to give ${seed.bm} access to the ${seed.account} ad account.</span><span>Received on October 14, 2026</span><button>Respond</button></div>`;

const detail = (seed: RequestSeed, approveDisabled: boolean): string =>
  `<div id="detail"><p>${seed.requester} requested to give ${seed.bm} access to the ${seed.account} ad account. Please review this request and approve it only if it's legitimate.</p><div><span>${seed.bm}</span><span>Business Manager ID: ${seed.bmId ?? PARTNER_ID}</span></div><button id="approve"${approveDisabled ? ' aria-disabled="true"' : ''}>Approve</button><button id="decline">Decline</button></div>`;

export type PageOptions = {
  // Hàng thêm vào danh sách (vd. request loại khác, hàng không parse được).
  rows?: string[];
  // Nút Approve mờ lúc mới mở (`aria-disabled`): vẫn phát `click` nhưng trang bỏ qua, như Comet.
  approveDisabled?: boolean;
  // Approve kéo theo bước xác nhận: request chỉ rời danh sách sau chừng này ms.
  approveDelayMs?: number;
  // Sau Approve trang chuyển sang tab khác và danh sách trống, nhưng request CHƯA rời Needs review.
  approveSwitchesTab?: boolean;
};

export function mountRequestsPage(
  seeds: RequestSeed[],
  options: PageOptions = {}
): RequestsPage {
  window.history.pushState(
    {},
    '',
    '/latest/settings/requests?business_id=104536928206688'
  );
  document.body.innerHTML =
    '<main role="main" id="fixture"><div role="tablist"><div role="tab" aria-selected="true"><span>Needs review</span><span>Needs review</span><span>Needs review</span></div><div role="tab" aria-selected="false"><span>Completed</span><span>Completed</span><span>Completed</span></div></div><div id="list"></div><section id="pane"></section></main>';
  const root = document.querySelector<HTMLElement>('#fixture') as HTMLElement;
  const page: RequestsPage = {
    root,
    counters: { opens: 0, approves: 0, declines: 0 },
  };
  const list = root.querySelector<HTMLElement>('#list') as HTMLElement;
  const pane = root.querySelector<HTMLElement>('#pane') as HTMLElement;
  const remaining = [...seeds];

  function render(): void {
    list.innerHTML =
      remaining.map(row).join('') + (options.rows ?? []).join('');
    list.querySelectorAll<HTMLElement>('[role="row"] button').forEach((btn) => {
      const index = Number(
        btn.closest<HTMLElement>('[role="row"]')?.dataset.i ?? -1
      );
      btn.addEventListener('click', () => {
        const seed = remaining[index];
        if (!seed) return;
        page.counters.opens += 1;
        pane.innerHTML = detail(seed, options.approveDisabled === true);
        const approve = pane.querySelector('#approve') as HTMLElement;
        const finish =
          (counter: 'approves' | 'declines', delay = 0) =>
          () => {
            // Nút mờ: trang bỏ qua cú bấm.
            if (
              counter === 'approves' &&
              approve.getAttribute('aria-disabled') === 'true'
            ) {
              return;
            }
            page.counters[counter] += 1;
            const remove = (): void => {
              if (counter === 'approves' && options.approveSwitchesTab) {
                root
                  .querySelector('[role="tab"]')
                  ?.setAttribute('aria-selected', 'false');
                list.innerHTML = '';
                pane.innerHTML = '';
                return;
              }
              remaining.splice(index, 1);
              pane.innerHTML = '';
              render();
            };
            if (delay > 0) setTimeout(remove, delay);
            else remove();
          };
        approve.onclick = finish('approves', options.approveDelayMs);
        (pane.querySelector('#decline') as HTMLElement).onclick =
          finish('declines');
      });
    });
  }
  render();
  return page;
}
