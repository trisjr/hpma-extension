/**
 * partnerApprove.ts — flow "Confirm request cấp quyền TKQC" (SPEC-ENG-002): admin thứ 2 xử lý, ở
 * Settings › Requests › Needs review, các request cấp quyền TKQC cho BM đối tác sau khi flow
 * Gán partner trả `pending-approval`. User chọn một quyết định (Approve hoặc Decline) cho cả lượt;
 * mỗi request đã quét là một mẻ 1 target, đi bộ 7 bước.
 * Dry-run: chỉ định vị nút của quyết định đã chọn. Assist: user tự bấm, engine chờ rồi verify.
 * Full: engine tự bấm đúng nút đã chọn (không bao giờ nút còn lại), rồi verify.
 */
import type {
  ApproveAction,
  ApproveConfig,
  ApproveRequest,
} from '@/shared/approve';
import type { LocatorSpec } from '../engine/locator';
import type { FlowContext } from '../engine/runner';
import type { ListedRequest } from './requestList';

import { isOnSurface } from '@/shared/surfaces';

import EngineError from '../engine/errors';
import { labelsOf } from '../engine/labels';
import { activeDialog, isVisible, locate, tryResolve } from '../engine/locator';
import {
  click,
  isChecked,
  isEnabled,
  sleep,
  waitFor,
} from '../engine/primitives';
import SELECTORS from '../engine/selectors';
import { normalizeText } from '../engine/text';
import {
  detailMatches,
  detailPane,
  mainRegion,
  matchesPartner,
  readDetail,
  readListedRequests,
  requestKey,
  respondButtonOf,
} from './requestList';

type Ctx = FlowContext<ApproveConfig>;

const ASSIST_WAIT_MS = 10 * 60 * 1000;
const SETTLE_MS = 2500;
const FIND_WAIT_MS = 8000;
const VERIFY_WAIT_MS = 10_000;
// Danh sách có thể chớp trống khi dựng lại: bằng chứng "đã rời" phải còn đúng sau chừng này.
const STABLE_MS = 1500;

// Điều kiện không bắt buộc: hết hạn thì trả undefined, lỗi khác vẫn ném.
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

// Các hàng đang hiện khớp đúng tên BM và đúng request (người yêu cầu + TKQC), theo thứ tự trang.
function matchingRows(
  partnerName: string,
  request: ApproveRequest
): ListedRequest[] {
  return readListedRequests().filter(
    (listed) =>
      matchesPartner(listed, partnerName) &&
      requestKey(listed) === requestKey(request)
  );
}

// Danh sách Needs review đã dựng xong và đọc được: thấy tab Needs review, tab không báo "không
// được chọn" (trang có thể tự chuyển sang tab khác), và không có chỉ báo đang tải. Chỉ khi đó
// "không còn thấy hàng" mới có nghĩa là request đã rời danh sách, chứ không phải danh sách trống
// vì đang dựng lại.
// Locator trả về span chứa nhãn; trạng thái chọn nằm ở phần tử role=tab bao ngoài.
function needsReviewTab(ctx: Ctx): HTMLElement | undefined {
  const label = tryResolve(SELECTORS.requestsNeedsReview, ctx.lang);
  return label?.closest<HTMLElement>('[role="tab"]') ?? label;
}

function listReadable(ctx: Ctx): boolean {
  const tab = needsReviewTab(ctx);
  if (!tab || tab.getAttribute('aria-selected') === 'false') return false;
  return !Array.from(
    mainRegion().querySelectorAll<HTMLElement>(
      '[aria-busy="true"], [role="progressbar"]'
    )
  ).some(isVisible);
}

// Bằng chứng "đã rời Needs review": đọc được danh sách VÀ số hàng khớp giảm so với trước khi duyệt.
function leftNeedsReview(
  ctx: Ctx,
  request: ApproveRequest,
  before: number
): boolean {
  return (
    listReadable(ctx) &&
    matchingRows(ctx.config.partnerName, request).length < before
  );
}

// Assist: request đã duyệt biến khỏi danh sách nên luôn lấy hàng đầu; Dry không đổi gì nên lấy
// hàng thứ `nth` để mỗi request trùng hệt nhau trong danh sách quét được đọc đủ một lần.
function pickRow(
  ctx: Ctx,
  request: ApproveRequest,
  nth: number
): ListedRequest | undefined {
  const rows = matchingRows(ctx.config.partnerName, request);
  return rows[ctx.mode === 'dry' ? nth : 0];
}

function notFound(ctx: Ctx, index: number): never {
  ctx.setTarget(index, 'failed', 'ERR_TARGET_NOT_FOUND');
  throw new EngineError('ERR_TARGET_NOT_FOUND');
}

// ---- Bước 1: tới tab Needs review -------------------------------------------

async function selectNeedsReview(ctx: Ctx): Promise<void> {
  const tab = needsReviewTab(ctx);
  if (tab) {
    if (!isChecked(tab)) await click(tab, ctx);
    return;
  }
  // Không thấy tab: chấp nhận khi danh sách đã hiện (trang mặc định mở Needs review),
  // còn lại thì báo đúng lý do không định vị được.
  if (readListedRequests().length === 0) {
    await locate(SELECTORS.requestsNeedsReview, ctx);
  }
}

async function openNeedsReview(ctx: Ctx, acted: () => void): Promise<void> {
  // Không điều hướng bằng href (tải lại trang giết content script): panel đã đưa tab tới đây.
  if (!isOnSurface('requests', window.location.pathname)) {
    throw new EngineError('ERR_WRONG_SURFACE');
  }
  if (activeDialog()) throw new EngineError('ERR_UNEXPECTED_DIALOG');
  acted();
  await selectNeedsReview(ctx);
}

// ---- Bước 2–4: tìm, mở và đối chiếu request ---------------------------------

async function findRequest(
  ctx: Ctx,
  index: number,
  nth: number,
  acted: () => void
): Promise<void> {
  const request = ctx.config.requests[index];
  const row = await orUndefined(
    waitFor(() => pickRow(ctx, request, nth), {
      signal: ctx.signal,
      timeoutMs: FIND_WAIT_MS,
    })
  );
  if (!row) notFound(ctx, index);
  acted();
  ctx.setTarget(index, 'running');
}

async function openDetail(
  ctx: Ctx,
  index: number,
  nth: number,
  acted: () => void
): Promise<void> {
  const request = ctx.config.requests[index];
  const row = pickRow(ctx, request, nth);
  if (!row) notFound(ctx, index);
  // Bấm nút Respond của đúng hàng (nếu có), không thì bấm chính câu mô tả; không bao giờ điều hướng.
  const target = respondButtonOf(row, readListedRequests(), ctx.lang) ?? row.el;
  acted();
  await click(target, ctx);
  await waitFor(
    () =>
      detailMatches(
        readDetail(),
        ctx.config.partnerName,
        request,
        ctx.config.partnerBmId
      )
        ? true
        : undefined,
    { signal: ctx.signal }
  ).catch((error) => {
    throw error instanceof EngineError
      ? new EngineError('ERR_LOCATE_TIMEOUT', 'request.detail')
      : error;
  });
}

// Đối chiếu khung chi tiết với request đã quét; BM ID vừa hiện cho user, vừa là điều kiện bắt buộc khi
// config có `partnerBmId` (tên BM có thể trùng).
function verifyDetail(ctx: Ctx, index: number, acted: () => void): void {
  const request = ctx.config.requests[index];
  const detail = readDetail();
  if (
    !detailMatches(
      detail,
      ctx.config.partnerName,
      request,
      ctx.config.partnerBmId
    )
  ) {
    notFound(ctx, index);
  }
  acted();
  // BM ID vào dòng định danh (phụ), không vào `name`: audit ở mức `basic` ghi `name`.
  const partner = [detail.bmName, detail.bmId].filter(Boolean).join(' · ');
  ctx.setTargetId(index, `${request.requester} → ${partner} · #${index + 1}`);
}

// ---- Bước 5: nút của quyết định đã chọn -------------------------------------

const specOf = (action: ApproveAction): LocatorSpec =>
  action === 'decline' ? SELECTORS.requestDecline : SELECTORS.requestApprove;

// Chỉ định vị để biết nút có mặt; không bấm, và không cố bật nó khi nó đang mờ (user tự xử lý).
// Chỉ nút khớp quyết định đã chọn được định vị: nút còn lại không bao giờ được tìm hay bấm.
async function locateAction(ctx: Ctx, acted: () => void): Promise<HTMLElement> {
  const spec = specOf(ctx.config.action);
  const button = await locate(spec, ctx);
  if (button.closest('[role="dialog"]')) {
    throw new EngineError('ERR_UNEXPECTED_DIALOG', spec.key);
  }
  acted();
  return button;
}

// ---- Bước 6: chờ user quyết định (Assist) hoặc engine bấm (Full) ------------

type Decision = {
  decided: Promise<void>;
  // Nút user đã bấm đầu tiên (Approve hoặc Decline); undefined nếu chưa bấm gì.
  clicked: () => ApproveAction | undefined;
  stop: () => void;
};

// Chỉ nghe sự kiện click ở pha capture để biết user bấm Approve hay Decline; không chặn gì,
// không đổi gì trên trang. Chỉ tính cú bấm nằm trong khung chi tiết của request đang mở,
// và chốt quyết định đầu tiên: các cú bấm sau (vd. Decline ở request khác) không đè lên nó.
function observeDecision(lang: string): Decision {
  const approve = labelsOf('request.approve', lang).map(normalizeText);
  const decline = labelsOf('request.decline', lang).map(normalizeText);
  let clicked: ApproveAction | undefined;
  let notify: () => void = () => undefined;
  const decided = new Promise<void>((resolve) => {
    notify = resolve;
  });
  const onClick = (event: Event): void => {
    if (clicked) return;
    const { target } = event;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>('button, [role="button"]');
    // Nút đang mờ (`aria-disabled`) vẫn phát `click` nhưng trang bỏ qua: không tính là quyết định.
    if (!button || !isEnabled(button)) return;
    if (!detailPane(lang)?.contains(button)) return;
    const label = normalizeText(button.textContent ?? '');
    if (approve.includes(label)) clicked = 'approve';
    else if (decline.includes(label)) clicked = 'decline';
    else return;
    notify();
  };
  document.addEventListener('click', onClick, true);
  return {
    decided,
    clicked: () => clicked,
    stop: () => document.removeEventListener('click', onClick, true),
  };
}

// Chờ user bấm Approve/Decline (hoặc báo xong). Sau cú bấm đúng quyết định đã chọn, nếu Meta đòi
// bước xác nhận hay đăng nhập lại thì user cần thời gian: chờ tiếp tới khi request rời danh sách
// (`gone`), user báo xong, hoặc hết hạn chờ Assist; không để cửa sổ verify ngắn cắt ngang rồi dừng
// cả run. Cú bấm nút ngược quyết định thì không chờ thêm: run dừng với `ERR_WRONG_ACTION`.
async function waitForDecision(
  ctx: Ctx,
  decision: Decision,
  gone: () => boolean
): Promise<void> {
  const local = new AbortController();
  const onAbort = (): void => local.abort();
  ctx.signal.addEventListener('abort', onAbort, { once: true });
  let userDone = false;
  const userSaidDone = ctx.waitForAssistDone().then(() => {
    userDone = true;
  });
  const timeout = sleep(ASSIST_WAIT_MS, local.signal).then(() => {
    throw new EngineError('ERR_STEP_TIMEOUT', 'assist.wait');
  });
  try {
    await Promise.race([decision.decided, userSaidDone, timeout]);
    if (decision.clicked() === ctx.config.action && !userDone) {
      await Promise.race([
        waitFor(() => (gone() ? true : undefined), {
          signal: local.signal,
          timeoutMs: ASSIST_WAIT_MS,
        }),
        userSaidDone,
        timeout,
      ]);
    }
  } finally {
    local.abort();
    ctx.signal.removeEventListener('abort', onAbort);
  }
}

// ---- Bước 7: verify ---------------------------------------------------------

// `done` cần cả hai bằng chứng: đã có cú bấm ĐÚNG quyết định đã chọn (user bấm ở Assist, engine
// bấm ở Full) VÀ request đã rời Needs review. Chỉ một trong hai thì không chứng minh được gì (có
// thể đã ghi): `unverified`, không bao giờ retry. Cú bấm là nút ngược quyết định đã chọn là một lần
// ghi thật nhưng sai ý user: `failed` `ERR_WRONG_ACTION` (vẫn tính ngân sách và audit).
async function verifyOutcome(
  ctx: Ctx,
  index: number,
  before: number,
  clicked: ApproveAction | undefined,
  acted: () => void
): Promise<boolean> {
  acted();
  const request = ctx.config.requests[index];
  await orUndefined(selectNeedsReview(ctx));
  const isGone = (): boolean => leftNeedsReview(ctx, request, before);
  let left = await orUndefined(
    waitFor(() => (isGone() ? true : undefined), {
      signal: ctx.signal,
      timeoutMs: VERIFY_WAIT_MS,
    })
  );
  if (left) {
    // Một lần thấy "đã rời" có thể chỉ là danh sách đang dựng lại: phải còn đúng sau một nhịp.
    await sleep(STABLE_MS, ctx.signal);
    left = isGone();
  }
  if (clicked !== undefined && clicked !== ctx.config.action) {
    ctx.setTarget(index, 'failed', 'ERR_WRONG_ACTION');
    return false;
  }
  if (clicked && left) {
    ctx.setTarget(index, 'done');
    return true;
  }
  if (clicked || left) {
    ctx.setTarget(index, 'unverified');
    return false;
  }
  ctx.setTarget(index, 'failed', 'ERR_NOT_APPROVED');
  return false;
}

// ---- Bước 6 (Full): engine tự bấm -------------------------------------------

// Hộp thoại xác nhận sau cú bấm Approve/Decline: chỉ chấp nhận khi trong hộp thoại có đúng một nút mang
// nhãn của quyết định đã chọn và không có nút của quyết định ngược lại (Cancel/đóng thì không tính).
// Mọi hộp thoại khác (đăng nhập lại, cảnh báo...) vẫn dừng run bằng `ERR_UNEXPECTED_DIALOG`.
async function confirmInDialog(
  ctx: Ctx,
  index: number,
  key: string
): Promise<void> {
  const dialog = activeDialog();
  if (!dialog) return;
  const labelSet = (action: ApproveAction): string[] =>
    labelsOf(`request.${action}`, ctx.lang).map(normalizeText);
  const chosen = labelSet(ctx.config.action);
  const opposite = labelSet(
    ctx.config.action === 'approve' ? 'decline' : 'approve'
  );
  const buttons = Array.from(
    dialog.querySelectorAll<HTMLElement>('button, [role="button"]')
  ).filter(isVisible);
  const textOf = (button: HTMLElement): string =>
    normalizeText(button.textContent ?? '');
  const matches = buttons.filter((button) => chosen.includes(textOf(button)));
  if (
    matches.length !== 1 ||
    buttons.some((button) => opposite.includes(textOf(button)))
  ) {
    throw new EngineError('ERR_UNEXPECTED_DIALOG', key);
  }
  // Câu hỏi của hộp phải đúng hộp xác nhận của quyết định (đã quan sát trên DOM thật, tiếng Anh); với
  // Approve còn phải nêu đúng BM đối tác. UI ngôn ngữ khác: không khớp thì dừng (fail closed).
  const text = normalizeText(dialog.textContent ?? '');
  const asked =
    ctx.config.action === 'decline'
      ? text.includes(normalizeText('Go ahead and decline this request?'))
      : text.includes(normalizeText('Are you sure you want to give')) &&
        text.includes(normalizeText(ctx.config.partnerName));
  if (!asked) throw new EngineError('ERR_UNEXPECTED_DIALOG', key);
  const [button] = matches;
  await click(button, ctx, () => {
    if (
      activeDialog() !== dialog ||
      !dialog.contains(button) ||
      !detailMatches(
        readDetail(),
        ctx.config.partnerName,
        ctx.config.requests[index],
        ctx.config.partnerBmId
      )
    ) {
      throw new EngineError('ERR_UNEXPECTED_DIALOG', key);
    }
  });
}

// Chỉ bấm đúng nút của quyết định đã chọn, không bao giờ nút còn lại. Định vị lại và đối chiếu
// lại khung chi tiết ngay trước khi bấm (trang có thể đã đổi từ bước 4). Sau cú bấm, nếu hộp thoại
// xác nhận của Meta hiện ra (`confirmInDialog`) thì bấm đúng nút cùng quyết định; hộp thoại nào khác
// mà request chưa rời danh sách thì dừng: engine không bấm xuyên qua hộp thoại nó không nhận ra.
// Target còn `running` sẽ thành `unverified` (đã tính là một lần ghi).
class Superseded extends Error {}

async function clickAction(
  ctx: Ctx,
  index: number,
  before: number,
  decision: Decision
): Promise<void> {
  const request = ctx.config.requests[index];
  const spec = specOf(ctx.config.action);
  // User đã tự bấm (trong lúc tạm dừng hoặc giữa lúc nhấn và nhả): engine không bấm thêm cú nào,
  // verify sẽ dùng đúng cú bấm đó (có thể là `ERR_WRONG_ACTION`).
  const superseded = (): boolean => decision.clicked() !== undefined;
  if (superseded()) return;
  // Nút phải nằm trong khung chi tiết của đúng request này, và khung đó phải còn khớp: kiểm lại
  // ngay trước khi nhấn và trước khi nhả (giữa hai lần kiểm có chờ gate/nút mờ/khoảng nghỉ).
  const verifyTarget = (button: HTMLElement): void => {
    if (superseded()) throw new Superseded();
    if (
      !detailMatches(
        readDetail(),
        ctx.config.partnerName,
        request,
        ctx.config.partnerBmId
      ) ||
      !detailPane(ctx.lang)?.contains(button)
    ) {
      notFound(ctx, index);
    }
  };
  try {
    const button = await locate(spec, ctx);
    if (button.closest('[role="dialog"]') || activeDialog()) {
      throw new EngineError('ERR_UNEXPECTED_DIALOG', spec.key);
    }
    verifyTarget(button);
    await click(button, ctx, (phase) => {
      verifyTarget(button);
      // Chỉ tính một lần ghi khi sắp phát cú bấm thật, không phải lúc mới định vị.
      if (phase === 'release') ctx.markWriteStarted();
    });
  } catch (error) {
    if (error instanceof Superseded) return;
    throw error;
  }
  // Trang cần vài giây để cập nhật danh sách sau khi bấm.
  await sleep(SETTLE_MS, ctx.signal);
  if (activeDialog() && !leftNeedsReview(ctx, request, before)) {
    // Meta hỏi xác nhận cho cả Approve lẫn Decline: bấm đúng nút cùng quyết định trong hộp thoại đó.
    await confirmInDialog(ctx, index, spec.key);
    // Meta xử lý duyệt/từ chối mất vài giây (hộp thoại còn quay, danh sách chưa cập nhật): chờ tới khi
    // hộp thoại đóng hoặc request rời danh sách, chỉ dừng khi hết hạn mà cả hai vẫn chưa xảy ra.
    await orUndefined(
      waitFor(
        () =>
          !activeDialog() || leftNeedsReview(ctx, request, before)
            ? true
            : undefined,
        { signal: ctx.signal, timeoutMs: VERIFY_WAIT_MS }
      )
    );
    if (activeDialog() && !leftNeedsReview(ctx, request, before)) {
      throw new EngineError('ERR_UNEXPECTED_DIALOG', spec.key);
    }
  }
}

// ---- Một request ------------------------------------------------------------

type BatchResult = 'continue' | 'stop';

async function runRequest(
  ctx: Ctx,
  index: number,
  nth: number
): Promise<BatchResult> {
  const request = ctx.config.requests[index];
  await ctx.pause('step');
  await ctx.step(1, (h) => openNeedsReview(ctx, h.acted));
  await ctx.pause('step');
  await ctx.step(2, (h) => findRequest(ctx, index, nth, h.acted));
  await ctx.pause('step');
  await ctx.step(3, (h) => openDetail(ctx, index, nth, h.acted));
  await ctx.pause('step');
  await ctx.step(4, async (h) => verifyDetail(ctx, index, h.acted));
  await ctx.pause('step');
  await ctx.step(5, (h) => locateAction(ctx, h.acted));
  const before = matchingRows(ctx.config.partnerName, request).length;
  // Cả hai mode đều nghe cú bấm thực sự xảy ra (của user ở Assist, của engine hoặc user ở Full),
  // bắt đầu từ trước `pause('write')`: verify dựa trên nút đã bấm thật, không dựa trên quyết định
  // đã chọn, và cú bấm tay của user trong lúc tạm dừng không bị bỏ sót.
  const decision = observeDecision(ctx.lang);
  try {
    await ctx.pause('write');

    if (ctx.mode === 'dry') {
      // Dry-run không bao giờ thực thi bước ghi (FR-03): dừng ở việc nút đã chọn có mặt.
      ctx.skipStep(6, { locate: 'done', act: 'skip', verify: 'skip' });
      ctx.setTarget(index, 'done');
      ctx.skipStep(7, { locate: 'skip', act: 'skip', verify: 'skip' });
      return 'continue';
    }

    if (ctx.mode === 'full') {
      await ctx.step(6, async (h) => {
        h.acted();
        await clickAction(ctx, index, before, decision);
      });
    } else {
      // Assist: engine không chạm Approve/Decline; chờ user bấm một trong hai rồi verify.
      await ctx.step(6, async (h) => {
        h.acted();
        ctx.setWaiting(true);
        try {
          await waitForDecision(ctx, decision, () =>
            leftNeedsReview(ctx, request, before)
          );
        } finally {
          ctx.setWaiting(false);
        }
        // Trang cần vài giây để cập nhật danh sách sau khi duyệt.
        await sleep(SETTLE_MS, ctx.signal);
      });
    }
    await ctx.pause('step');
    const ok = await ctx.step(7, (h) =>
      verifyOutcome(ctx, index, before, decision.clicked(), h.acted)
    );
    return ok ? 'continue' : 'stop';
  } finally {
    decision.stop();
  }
}

export default async function partnerApproveFlow(ctx: Ctx): Promise<void> {
  const { requests } = ctx.config;
  const seen = new Map<string, number>();
  for (let index = 0; index < requests.length; index += 1) {
    const key = requestKey(requests[index]);
    const nth = seen.get(key) ?? 0;
    seen.set(key, nth + 1);
    if (index > 0) {
      // eslint-disable-next-line no-await-in-loop
      await ctx.pause('batch');
    }
    ctx.beginBatch(index + 1, requests.length, [index]);
    // eslint-disable-next-line no-await-in-loop
    const result = await runRequest(ctx, index, nth);
    if (result === 'stop') return;
  }
}
