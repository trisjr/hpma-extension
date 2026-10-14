/**
 * partnerAssign.ts — flow "Gán partner vào TKQC" theo đường Partners (SPEC-ENG-001
 * §5; file 18 §3): Đối tác → Thêm → "Cấp cho đối tác quyền truy cập" → nhập BM ID →
 * Tiếp → chọn TKQC + quyền → (Assign: chỉ user bấm) → verify. Mỗi mẻ ≤ 10 TKQC.
 * Chỉ Dry-run/Assist: không có đường nào tự bấm Assign.
 */
import type { PartnerTask } from '@/shared/partnerAssign';
import type { FlowContext } from '../engine/runner';
import type { TaskUiKey } from './partnerTasks';

import { isOnSurface } from '@/shared/surfaces';

import EngineError from '../engine/errors';
import { labelsOf } from '../engine/labels';
import {
  activeDialog,
  findAssetCheckbox,
  isVisible,
  locate,
  resolveOnce,
  tryResolve,
} from '../engine/locator';
import {
  click,
  isChecked,
  isEnabled,
  sleep,
  typeText,
  visibleText,
  waitFor,
  waitGone,
} from '../engine/primitives';
import { chunkIndexes } from '../engine/runState';
import SELECTORS from '../engine/selectors';
import { matchKey, normalizeText } from '../engine/text';
import { uiTaskKeys } from './partnerTasks';

const ASSIST_WAIT_MS = 10 * 60 * 1000;
const AFTER_CLOSE_MS = 15_000;
const NOTICE_SETTLE_MS = 2500;
const SHORT_WAIT_MS = 5000;
const CHECKBOX_CSS = '[role="checkbox"], input[type="checkbox"]';

function mainRegion(): HTMLElement {
  return document.querySelector<HTMLElement>('[role="main"]') ?? document.body;
}

// Phần tử/điều kiện không bắt buộc: không thấy (hết hạn) thì trả undefined, lỗi khác vẫn ném.
async function orUndefined<T>(attempt: Promise<T>): Promise<T | undefined> {
  try {
    return await attempt;
  } catch (error) {
    if (
      error instanceof EngineError &&
      (error.code === 'ERR_LOCATE_TIMEOUT' || error.code === 'ERR_STEP_TIMEOUT')
    ) {
      return undefined;
    }
    throw error;
  }
}

// ---- Bước 1–3: tới wizard chọn tài sản --------------------------------------

async function openPartners(
  ctx: FlowContext,
  acted: () => void
): Promise<void> {
  // Không điều hướng bằng href (tải lại trang giết content script): chỉ bấm menu SPA.
  if (!isOnSurface('settings', window.location.pathname)) {
    throw new EngineError('ERR_WRONG_SURFACE');
  }
  if (activeDialog()) throw new EngineError('ERR_UNEXPECTED_DIALOG');
  if (!tryResolve(SELECTORS.navPartners, ctx.lang)) {
    const users = tryResolve(SELECTORS.navUsers, ctx.lang);
    if (users) {
      await click(users, ctx);
      await ctx.pause('micro');
    }
  }
  const link = await locate(SELECTORS.navPartners, ctx);
  acted();
  await click(link, ctx);
  await waitFor(
    () =>
      window.location.pathname.includes('partners') ||
      resolveOnce(SELECTORS.partnersAdd, ctx.lang).ok
        ? true
        : undefined,
    { signal: ctx.signal }
  );
}

async function openGiveAccess(
  ctx: FlowContext,
  acted: () => void
): Promise<void> {
  const add = await locate(SELECTORS.partnersAdd, ctx);
  acted();
  await click(add, ctx);
  await ctx.pause('micro');
  const give = await locate(SELECTORS.partnersGive, ctx);
  await click(give, ctx);
  await waitFor(() => (activeDialog() ? true : undefined), {
    signal: ctx.signal,
  }).catch((error) => {
    throw error instanceof EngineError
      ? new EngineError('ERR_STEP_TIMEOUT', 'wizard.open')
      : error;
  });
}

function partnerExists(lang: string): boolean {
  const text = normalizeText(visibleText(activeDialog()));
  return labelsOf('partner.exists', lang).some((label) =>
    text.includes(normalizeText(label))
  );
}

async function enterBmId(
  ctx: FlowContext,
  acted: () => void
): Promise<boolean> {
  const input = await locate(SELECTORS.bmIdInput, ctx);
  if (
    !(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)
  ) {
    throw new EngineError('ERR_LOCATE_TIMEOUT', SELECTORS.bmIdInput.key);
  }
  acted();
  await typeText(input, ctx.config.partnerBmId, ctx);
  await ctx.pause('micro');
  if (partnerExists(ctx.lang)) return true;
  await click(await locate(SELECTORS.next, ctx), ctx);
  // Wizard chọn tài sản xuất hiện khi có danh sách hộp kiểm; ID sai thì không bao giờ tới.
  return waitFor(
    () => {
      if (partnerExists(ctx.lang)) return true;
      return activeDialog()?.querySelector(CHECKBOX_CSS) ? false : undefined;
    },
    { signal: ctx.signal }
  ).catch((error) => {
    throw error instanceof EngineError
      ? new EngineError('ERR_STEP_TIMEOUT', 'wizard.assets')
      : error;
  });
}

// ---- Bước 4–5: chọn TKQC và quyền -------------------------------------------

function isAlreadyAssigned(rowText: string, lang: string): boolean {
  const text = normalizeText(rowText);
  return labelsOf('asset.alreadyAssigned', lang).some((label) =>
    text.includes(normalizeText(label))
  );
}

// Readback chỉ tính tài khoản trong danh sách đã gán của đúng partner, kể cả chi tiết mở sẵn.
function partnerDetails(bmId: string, lang: string): HTMLElement | undefined {
  if (activeDialog()) return undefined;
  const tab = tryResolve(SELECTORS.partnerAssignedAssets, lang);
  if (!tab) return undefined;
  let details = tab.parentElement;
  while (details && details !== document.body) {
    if (
      details.querySelector('[role="list"], ul') ||
      Array.from(
        details.querySelectorAll<HTMLElement>('button,[role="button"]')
      ).some((el) =>
        labelsOf('dialog.assign', lang)
          .map(normalizeText)
          .includes(normalizeText(el.textContent ?? ''))
      )
    )
      break;
    details = details.parentElement;
  }
  if (!details || details === document.body) return undefined;
  const identity = Array.from(details.querySelectorAll<HTMLElement>('a')).some(
    (link) => isVisible(link) && normalizeText(link.textContent ?? '') === bmId
  );
  return identity ? details : undefined;
}

function assignedRows(details: HTMLElement): HTMLElement[] {
  return Array.from(
    details.querySelectorAll<HTMLElement>('[role="listitem"], li')
  ).filter(
    (row) =>
      isVisible(row) && row.querySelector('a[href*="/settings/ad_accounts"]')
  );
}

export function readExistingAccount(
  bmId: string,
  query: string,
  tasks: PartnerTask[],
  lang: string
): 'missing' | 'sufficient' | 'needs-review' {
  const details = partnerDetails(bmId, lang);
  const tab = tryResolve(SELECTORS.partnerAssignedAssets, lang);
  if (!details || !tab || !isChecked(tab)) return 'needs-review';
  const wanted = matchKey(query.replace(/^act_/i, ''));
  const idQuery = /^\d{10,}$/.test(wanted);
  const rows = assignedRows(details).filter((row) =>
    idQuery
      ? Array.from(
          row.querySelectorAll<HTMLAnchorElement>(
            'a[href*="/settings/ad_accounts"]'
          )
        ).some(
          (a) =>
            new URL(a.href).searchParams.get('selected_asset_id') === wanted
        )
      : [row, ...row.querySelectorAll<HTMLElement>('*')].some(
          (el) => isVisible(el) && matchKey(el.textContent ?? '') === wanted
        )
  );
  if (rows.length === 0) return 'missing';
  if (rows.length !== 1) return 'needs-review';
  const keys = uiTaskKeys(tasks);
  const text = normalizeText(visibleText(rows[0]));
  const has = (key: TaskUiKey): boolean =>
    labelsOf(SELECTORS[key].label, lang).some((label) =>
      text.includes(normalizeText(label))
    );
  return keys &&
    keys.every(
      (key) =>
        has(key) ||
        has('taskManage') ||
        (key === 'taskPerformance' && has('taskCampaigns'))
    )
    ? 'sufficient'
    : 'needs-review';
}

async function openExistingPartner(ctx: FlowContext): Promise<boolean> {
  if (partnerDetails(ctx.config.partnerBmId, ctx.lang)) return true;
  const search = await locate(SELECTORS.partnersSearch, ctx);
  if (!(search instanceof HTMLInputElement)) {
    throw new EngineError('ERR_TYPE_MISMATCH', SELECTORS.partnersSearch.key);
  }
  await typeText(search, ctx.config.partnerBmId, ctx);
  // shortcut: chờ debounce 2.5s, thay bằng tín hiệu hoàn tất search khi Meta cung cấp.
  await sleep(NOTICE_SETTLE_MS, ctx.signal);
  // Blur có thể làm Meta render lại hàng: bỏ focus trước khi lấy phần tử để bấm.
  await ctx.gate();
  search.blur();
  await ctx.pause('micro');
  // Chỉ tính chỉ báo đang tải còn hiển thị, và hết hạn thì đọc luôn: trang "No results found"
  // có thể còn aria-busy/progressbar treo, không được biến "không có partner" thành timeout.
  await orUndefined(
    waitFor(
      () =>
        Array.from(
          mainRegion().querySelectorAll<HTMLElement>(
            '[aria-busy="true"], [role="progressbar"]'
          )
        ).some(isVisible)
          ? undefined
          : true,
      { signal: ctx.signal }
    )
  );
  const rows = Array.from(
    mainRegion().querySelectorAll<HTMLElement>(
      '[role="grid"] [role="row"], table tbody tr'
    )
  ).filter(
    (row) => isVisible(row) && row.querySelector('[role="gridcell"], td')
  );
  if (rows.length === 0) return false;
  if (rows.length !== 1)
    throw new EngineError('ERR_LOCATE_AMBIGUOUS', 'partner.row');
  const links = Array.from(rows[0].querySelectorAll<HTMLElement>('a')).filter(
    isVisible
  );
  if (links.length !== 1) {
    throw new EngineError('ERR_LOCATE_AMBIGUOUS', 'partner.details');
  }
  await click(links[0], ctx);
  await waitFor(() => partnerDetails(ctx.config.partnerBmId, ctx.lang), {
    signal: ctx.signal,
  });
  return true;
}

async function openExistingAssets(
  ctx: FlowContext,
  indexes: number[]
): Promise<void> {
  const tab = await locate(SELECTORS.partnerAssignedAssets, ctx);
  if (!isChecked(tab)) await click(tab, ctx);
  for (let i = 0; i < indexes.length; i += 1) {
    const index = indexes[i];
    const details = partnerDetails(ctx.config.partnerBmId, ctx.lang);
    const searches = Array.from(
      details?.querySelectorAll<HTMLInputElement>('input') ?? []
    ).filter((input) => isVisible(input) && input.placeholder);
    if (searches.length !== 1) {
      throw new EngineError('ERR_LOCATE_AMBIGUOUS', 'partner.assetsSearch');
    }
    // eslint-disable-next-line no-await-in-loop
    await typeText(
      searches[0],
      ctx.state().targets[index].accountId.replace(/^act_/i, ''),
      ctx
    );
    // eslint-disable-next-line no-await-in-loop
    await sleep(NOTICE_SETTLE_MS, ctx.signal);
    // eslint-disable-next-line no-await-in-loop
    await waitFor(
      () => {
        const current = partnerDetails(ctx.config.partnerBmId, ctx.lang);
        return current &&
          !current.querySelector('[aria-busy="true"], [role="progressbar"]')
          ? true
          : undefined;
      },
      { signal: ctx.signal }
    );
    const existing = readExistingAccount(
      ctx.config.partnerBmId,
      ctx.state().targets[index].accountId,
      ctx.config.tasks,
      ctx.lang
    );
    if (existing === 'sufficient') ctx.setTarget(index, 'skipped-existing');
    else if (existing !== 'missing') {
      ctx.setTarget(index, 'failed', 'ERR_EXISTING_PERMISSIONS');
      throw new EngineError('ERR_EXISTING_PERMISSIONS');
    }
  }
  const details = partnerDetails(ctx.config.partnerBmId, ctx.lang);
  const search = details?.querySelector<HTMLInputElement>('input[placeholder]');
  if (search) await typeText(search, '', ctx);
  if (
    indexes.every(
      (index) => ctx.state().targets[index].outcome === 'skipped-existing'
    )
  )
    return;
  // Hộp chọn TKQC đang mở thì nút "Assign" trên trang có thể trùng nhãn với nút xác nhận
  // trong hộp đó: dừng thay vì bấm nhầm nút ghi.
  if (activeDialog()?.querySelector(CHECKBOX_CSS))
    throw new EngineError('ERR_UNEXPECTED_DIALOG', SELECTORS.partnerAssign.key);
  const assignButton = await locate(SELECTORS.partnerAssign, ctx);
  // Kiểm trên chính phần tử sắp bấm: locate có thể đã poll tới nút trong dialog sau guard trên.
  if (assignButton.closest('[role="dialog"]'))
    throw new EngineError('ERR_UNEXPECTED_DIALOG', SELECTORS.partnerAssign.key);
  // `partner.assign` cho phép nhiều bản sao (duplicatesOk): chỉ bấm nút nằm trong chi tiết đã
  // xác minh đúng partner bằng BM ID, không phải nút của partner khác trong cùng vùng main.
  const assignScope = partnerDetails(ctx.config.partnerBmId, ctx.lang);
  if (!assignScope?.contains(assignButton))
    throw new EngineError('ERR_LOCATE_AMBIGUOUS', SELECTORS.partnerAssign.key);
  await click(assignButton, ctx);
  await waitFor(
    () => (activeDialog()?.querySelector(CHECKBOX_CSS) ? true : undefined),
    { signal: ctx.signal }
  );
}

// TKQC đã tick ở bước 4, kèm chuỗi nhận diện dùng để verify ở bước 7.
type SelectedAsset = { index: number; tokens: string[] };

// Chuỗi nhận diện lấy từ HÀNG đã chọn (không phải câu user dán, vốn có thể là chuỗi con
// ngắn như "Spa"): ID số dài và phần tên sau khi bỏ "ID: …".
export function verifyTokens(rowText: string): string[] {
  const id = rowText.match(/\d{10,}/)?.[0];
  const name = matchKey(rowText.replace(/\bid\s*:?\s*\d[\d\s]*/gi, ' '));
  return [id, name].filter((token): token is string => !!token);
}

async function selectAccounts(
  ctx: FlowContext,
  acted: () => void,
  indexes: number[]
): Promise<SelectedAsset[]> {
  const pending = indexes.filter(
    (index) => ctx.state().targets[index].outcome !== 'skipped-existing'
  );
  if (pending.length === 0) return [];
  const tab = await locate(SELECTORS.assetTypeAdAccounts, ctx);
  acted();
  if (!isChecked(tab)) await click(tab, ctx);
  const selected: SelectedAsset[] = [];
  for (let i = 0; i < pending.length; i += 1) {
    const index = pending[i];
    // eslint-disable-next-line no-await-in-loop
    await ctx.pause('micro');
    const { accountId: query } = ctx.state().targets[index];
    // eslint-disable-next-line no-await-in-loop
    const search = await locate(SELECTORS.assetSearch, ctx);
    if (!(search instanceof HTMLInputElement)) {
      throw new EngineError('ERR_TYPE_MISMATCH', SELECTORS.assetSearch.key);
    }
    // eslint-disable-next-line no-await-in-loop
    await typeText(search, query.replace(/^act_/i, ''), ctx);
    // shortcut: chờ debounce 2.5s, thay bằng tín hiệu hoàn tất search khi Meta cung cấp.
    // eslint-disable-next-line no-await-in-loop
    await sleep(NOTICE_SETTLE_MS, ctx.signal);
    // eslint-disable-next-line no-await-in-loop
    const match = (await orUndefined(
      waitFor(
        () => {
          const current = activeDialog();
          if (!current) throw new EngineError('ERR_LOCATE_TIMEOUT', 'dialog');
          if (
            current.querySelector('[aria-busy="true"], [role="progressbar"]')
          ) {
            return undefined;
          }
          const result = findAssetCheckbox(query, current, ctx.lang);
          return result.kind === 'none' ? undefined : result;
        },
        { signal: ctx.signal, timeoutMs: SHORT_WAIT_MS }
      )
    )) ?? { kind: 'none' as const };
    if (match.kind === 'none') {
      ctx.setTarget(index, 'failed', 'ERR_TARGET_NOT_FOUND');
    } else if (match.kind === 'ambiguous') {
      ctx.setTarget(index, 'failed', 'ERR_TARGET_AMBIGUOUS');
    } else if (
      !isEnabled(match.checkbox) ||
      isAlreadyAssigned(match.rowText, ctx.lang)
    ) {
      ctx.setTarget(index, 'failed', 'ERR_EXISTING_PERMISSIONS');
      throw new EngineError('ERR_EXISTING_PERMISSIONS');
    } else {
      if (!isChecked(match.checkbox)) {
        // eslint-disable-next-line no-await-in-loop
        await click(match.checkbox, ctx);
      }
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => (isChecked(match.checkbox) ? true : undefined), {
        signal: ctx.signal,
        timeoutMs: SHORT_WAIT_MS,
      }).catch((error) => {
        throw error instanceof EngineError
          ? new EngineError('ERR_LOCATE_TIMEOUT', 'asset.checkbox')
          : error;
      });
      ctx.setTarget(index, 'running');
      selected.push({ index, tokens: verifyTokens(match.rowText) });
    }
  }
  // Không chọn được TKQC nào và cũng không có TKQC "đã đủ quyền": bước 4 thất bại
  // (mã lỗi của target đầu tiên) thay vì báo ok rồi mới dừng.
  const anySkipped = indexes.some(
    (index) => ctx.state().targets[index].outcome === 'skipped-existing'
  );
  if (selected.length === 0 && !anySkipped) {
    const { code } = ctx.state().targets[indexes[0]];
    throw new EngineError(
      code === 'ERR_TARGET_AMBIGUOUS' ? code : 'ERR_TARGET_NOT_FOUND'
    );
  }
  return selected;
}

// Quyền cấp cao bao trọn quyền thấp (UI có thể tự bật chúng): chỉ quyền ngoài phần bao mới bị coi là dư.
type PermissionUiKey = TaskUiKey | 'taskCreative';
const IMPLIED_TASKS: Record<PermissionUiKey, PermissionUiKey[]> = {
  taskManage: [
    'taskManage',
    'taskCampaigns',
    'taskPerformance',
    'taskCreative',
  ],
  taskCampaigns: ['taskCampaigns', 'taskPerformance', 'taskCreative'],
  taskPerformance: ['taskPerformance'],
  taskCreative: ['taskCreative'],
};

// Đọc lại các công tắc quyền: quyền cần có phải bật, quyền ngoài phần bao phải tắt
// (wizard có thể bật sẵn). Sai là dừng, không để user bấm Assign với bộ quyền dư.
function assertExactPermissions(ctx: FlowContext, wanted: TaskUiKey[]): void {
  const allowed = wanted.flatMap((key) => IMPLIED_TASKS[key]);
  const allowedElements: HTMLElement[] = [];
  (Object.keys(IMPLIED_TASKS) as PermissionUiKey[]).forEach((key) => {
    const result = resolveOnce(SELECTORS[key], ctx.lang);
    // Không đọc được công tắc = không chứng minh được nó tắt (nhãn chưa kiểm chứng): dừng.
    const on = result.ok && isChecked(result.el);
    const mismatch =
      !result.ok ||
      (wanted.some((item) => item === key)
        ? !on
        : on && !allowed.includes(key));
    if (mismatch) {
      throw new EngineError('ERR_PERMISSION_MISMATCH', SELECTORS[key].key);
    }
    if (result.ok && allowed.includes(key)) allowedElements.push(result.el);
  });
  activeDialog()
    ?.querySelectorAll<HTMLElement>('[role="switch"]')
    .forEach((toggle) => {
      if (
        isVisible(toggle) &&
        isChecked(toggle) &&
        !allowedElements.some((el) => el === toggle || el.contains(toggle))
      ) {
        throw new EngineError(
          'ERR_PERMISSION_MISMATCH',
          'dialog.extraPermission'
        );
      }
    });
}

async function tickTasks(ctx: FlowContext, acted: () => void): Promise<void> {
  const keys = uiTaskKeys(ctx.config.tasks);
  if (!keys) throw new EngineError('ERR_INVALID_CONFIG', 'tasks');
  // UI cũ có lựa chọn partial; UI hiện tại chỉ có tiêu đề và các công tắc quyền.
  const partial = tryResolve(SELECTORS.accessPartial, ctx.lang);
  acted();
  if (partial && !isChecked(partial)) {
    await click(partial, ctx);
    await ctx.pause('micro');
  }
  for (let i = 0; i < keys.length; i += 1) {
    const spec = SELECTORS[keys[i]];
    // eslint-disable-next-line no-await-in-loop
    const toggle = await locate(spec, ctx);
    if (!isChecked(toggle)) {
      // eslint-disable-next-line no-await-in-loop
      await click(toggle, ctx);
    }
    // Tìm lại sau khi bấm: Comet có thể render lại phần tử.
    // eslint-disable-next-line no-await-in-loop
    await waitFor(
      () => {
        const result = resolveOnce(spec, ctx.lang);
        return result.ok && isChecked(result.el) ? true : undefined;
      },
      { signal: ctx.signal, timeoutMs: SHORT_WAIT_MS }
    ).catch((error) => {
      throw error instanceof EngineError
        ? new EngineError('ERR_LOCATE_TIMEOUT', `${spec.key}.checked`)
        : error;
    });
    // eslint-disable-next-line no-await-in-loop
    await ctx.pause('micro');
  }
  assertExactPermissions(ctx, keys);
}

// ---- Bước 6: ghi (chỉ Assist; Dry chỉ định vị rồi huỷ wizard) ----------------

// Dọn dẹp tốt nhất có thể: thất bại thì để nguyên hộp thoại (file 19 §7).
async function cancelWizard(ctx: FlowContext): Promise<void> {
  try {
    const button =
      tryResolve(SELECTORS.cancel, ctx.lang) ??
      tryResolve(SELECTORS.close, ctx.lang);
    if (!button) return;
    await click(button, ctx);
    await waitGone(() => activeDialog() !== null, {
      signal: ctx.signal,
      timeoutMs: 8000,
    });
  } catch (error) {
    if (!(error instanceof EngineError)) throw error;
  }
}

// Theo dõi văn bản hộp thoại cuối cùng và mọi toast từng hiện (toast tự tắt sau vài giây)
// để nhận ra yêu cầu duyệt sau khi user bấm Assign.
function trackNotices(): { read: () => string; stop: () => void } {
  let last = '';
  const toasts = new Set<string>();
  const capture = (): void => {
    const dialog = activeDialog();
    if (dialog) last = normalizeText(dialog.textContent ?? '');
    document
      .querySelectorAll<HTMLElement>('[role="alert"],[role="status"]')
      .forEach((el) => {
        if (isVisible(el)) toasts.add(normalizeText(el.textContent ?? ''));
      });
  };
  const observer = new MutationObserver(capture);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  capture();
  return {
    read: () => [last, ...toasts].join(' '),
    stop: () => observer.disconnect(),
  };
}

// Cụm báo cần duyệt chỉ tính khi MỚI xuất hiện so với lúc bắt đầu chờ (văn bản trợ giúp
// có sẵn của wizard nhắc tới việc duyệt không được làm run nào cũng thành pending).
export function approvalAppeared(
  phrases: string[],
  baseline: string,
  notice: string
): boolean {
  return phrases
    .map(normalizeText)
    .some((phrase) => notice.includes(phrase) && !baseline.includes(phrase));
}

async function waitDialogClosedOrDone(ctx: FlowContext): Promise<void> {
  const local = new AbortController();
  const onAbort = (): void => local.abort();
  ctx.signal.addEventListener('abort', onAbort, { once: true });
  try {
    await Promise.race([
      waitGone(() => activeDialog() !== null, {
        signal: local.signal,
        timeoutMs: ASSIST_WAIT_MS,
      }),
      ctx.waitForAssistDone(),
    ]);
  } finally {
    local.abort();
    ctx.signal.removeEventListener('abort', onAbort);
  }
  if (activeDialog()) {
    // User báo xong nhưng hộp thoại còn: chờ ngắn rồi đọc lại dù sao (verify mới là bằng chứng).
    await orUndefined(
      waitGone(() => activeDialog() !== null, {
        signal: ctx.signal,
        timeoutMs: AFTER_CLOSE_MS,
      })
    );
  }
}

// ---- Bước 7: verify readback -------------------------------------------------

function findPartnerRow(bmId: string): HTMLElement | undefined {
  const rows = Array.from(
    mainRegion().querySelectorAll<HTMLElement>(
      'a, [role="row"], [role="link"], [role="button"], [role="listitem"], tr'
    )
  ).filter(
    (el) =>
      isVisible(el) &&
      (normalizeText(el.textContent ?? '') === bmId ||
        ((el.getAttribute('href') ?? '').includes('selected_partner_id=') &&
          new URL(
            el.getAttribute('href') ?? '',
            window.location.href
          ).searchParams.get('selected_partner_id') === bmId))
  );
  const innermost = rows.filter(
    (el) => !rows.some((other) => other !== el && el.contains(other))
  );
  return innermost.length === 1 ? innermost[0] : undefined;
}

export function isAssignedAccount(
  bmId: string,
  tokens: string[],
  lang: string
): boolean {
  const details = partnerDetails(bmId, lang);
  const tab = tryResolve(SELECTORS.partnerAssignedAssets, lang);
  if (!details || !tab || !isChecked(tab)) return false;
  const rows = assignedRows(details);
  const matches = rows.filter((row) =>
    [row, ...row.querySelectorAll<HTMLElement>('*')].some(
      (el) => isVisible(el) && tokens.includes(matchKey(el.textContent ?? ''))
    )
  );
  return matches.length === 1;
}

async function verifyTargets(
  ctx: FlowContext,
  acted: () => void,
  selected: SelectedAsset[]
): Promise<void> {
  acted();
  const confirmed = (asset: SelectedAsset): boolean =>
    isAssignedAccount(ctx.config.partnerBmId, asset.tokens, ctx.lang);
  const row = selected.every(confirmed)
    ? undefined
    : await orUndefined(
        waitFor(() => findPartnerRow(ctx.config.partnerBmId), {
          signal: ctx.signal,
          timeoutMs: 10_000,
        })
      );
  if (row) {
    await click(row, ctx);
    await ctx.pause('micro');
  }
  const assignedTab = tryResolve(SELECTORS.partnerAssignedAssets, ctx.lang);
  if (assignedTab && !isChecked(assignedTab)) await click(assignedTab, ctx);
  await orUndefined(
    waitFor(() => (selected.every(confirmed) ? true : undefined), {
      signal: ctx.signal,
      timeoutMs: 8000,
    })
  );
  selected.forEach((asset) => {
    // Không xác nhận được = chưa xác minh (có thể đã ghi): không bao giờ coi là thất bại để chạy lại.
    ctx.setTarget(asset.index, confirmed(asset) ? 'done' : 'unverified');
  });
}

// ---- Một mẻ ------------------------------------------------------------------

type BatchResult = 'continue' | 'stop';

async function runBatchSteps(
  ctx: FlowContext,
  indexes: number[]
): Promise<BatchResult> {
  await ctx.pause('step');
  await ctx.step(1, (h) => openPartners(ctx, h.acted));
  await ctx.pause('step');
  const existing = await ctx.step(2, async (h) => {
    h.acted();
    if (await openExistingPartner(ctx)) return true;
    // Không để bộ lọc BM ID che partner mới sau khi user ghi và engine đọc lại.
    const search = await locate(SELECTORS.partnersSearch, ctx);
    if (search instanceof HTMLInputElement) await typeText(search, '', ctx);
    await openGiveAccess(ctx, h.acted);
    return false;
  });
  await ctx.pause('step');
  await ctx.step(3, async (h) => {
    if (!existing && !(await enterBmId(ctx, h.acted))) return;
    h.acted();
    if (!existing) {
      await cancelWizard(ctx);
      if (activeDialog()) throw new EngineError('ERR_UNEXPECTED_DIALOG');
      if (!(await openExistingPartner(ctx))) {
        throw new EngineError('ERR_LOCATE_TIMEOUT', 'partner.existing');
      }
    }
    await openExistingAssets(ctx, indexes);
  });
  await ctx.pause('step');
  const selected = await ctx.step(4, (h) =>
    selectAccounts(ctx, h.acted, indexes)
  );
  if (selected.length === 0) {
    // Mọi TKQC trong mẻ đã đủ quyền: không còn gì để ghi, đóng wizard và sang mẻ sau.
    await cancelWizard(ctx);
    [5, 6, 7].forEach((index) =>
      ctx.skipStep(index, { locate: 'skip', act: 'skip', verify: 'skip' })
    );
    return 'continue';
  }
  await ctx.pause('step');
  await ctx.step(5, (h) => tickTasks(ctx, h.acted));
  await ctx.pause('write');

  if (ctx.mode === 'dry') {
    // Dry-run không bao giờ thực thi bước ghi (FR-03): chỉ xác nhận nút có mặt rồi huỷ.
    await ctx.step(6, async () => {
      await locate(SELECTORS.assign, ctx);
    });
    ctx.skipStep(6, { locate: 'done', act: 'skip', verify: 'skip' });
    await cancelWizard(ctx);
    selected.forEach(({ index }) => ctx.setTarget(index, 'done'));
    ctx.skipStep(7, { locate: 'skip', act: 'skip', verify: 'skip' });
    return 'continue';
  }

  // Assist: engine không chạm nút Assign; chờ user bấm và hộp thoại đóng.
  const tracker = trackNotices();
  const baseline = tracker.read();
  try {
    await ctx.step(6, async (h) => {
      await locate(SELECTORS.assign, ctx);
      h.acted();
      ctx.setWaiting(true);
      try {
        await waitDialogClosedOrDone(ctx);
      } finally {
        ctx.setWaiting(false);
      }
      // Toast báo cần duyệt có thể tới ngay sau khi hộp thoại đóng.
      await sleep(NOTICE_SETTLE_MS, ctx.signal);
    });
  } finally {
    tracker.stop();
  }
  if (
    approvalAppeared(
      labelsOf('signal.approval', ctx.lang),
      baseline,
      tracker.read()
    )
  ) {
    // Cần admin thứ hai duyệt: không replay, dừng toàn run (FR-04).
    selected.forEach(({ index }) => ctx.setTarget(index, 'pending-approval'));
    ctx.skipStep(7, { locate: 'skip', act: 'skip', verify: 'skip' });
    return 'stop';
  }
  await ctx.pause('step');
  await ctx.step(7, (h) => verifyTargets(ctx, h.acted, selected));
  return 'continue';
}

// Dry-run lỗi giữa chừng không được để lại wizard đã cấu hình sẵn (một cú bấm là ghi thật):
// thử huỷ tốt nhất có thể rồi ném lại lỗi gốc. Assist thì user đang điều khiển wizard.
async function runBatch(
  ctx: FlowContext,
  indexes: number[]
): Promise<BatchResult> {
  try {
    return await runBatchSteps(ctx, indexes);
  } catch (error) {
    if (ctx.mode === 'dry' && activeDialog()) {
      await cancelWizard(ctx).catch(() => undefined);
    }
    throw error;
  }
}

export default async function partnerAssignFlow(
  ctx: FlowContext
): Promise<void> {
  const batches = chunkIndexes(ctx.config.queries.length, ctx.batchSize);
  for (let index = 0; index < batches.length; index += 1) {
    if (index > 0) {
      // eslint-disable-next-line no-await-in-loop
      await ctx.pause('batch');
    }
    ctx.beginBatch(index + 1, batches.length, batches[index]);
    // eslint-disable-next-line no-await-in-loop
    const result = await runBatch(ctx, batches[index]);
    if (result === 'stop') return;
  }
}
