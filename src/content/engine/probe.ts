/**
 * probe.ts — probe P0 (FR-02): đo hit-rate từng khoá SelectorRegistry trên DOM sống.
 * CHỈ ĐỌC: không click, không gõ, không chờ phần tử. Chỉ đo key thuộc màn đang thấy
 * (page / menu / từng bước của dialog / detail); key của màn khác ghi `measured: false`
 * thay vì tính là trượt.
 */
import type { ProbeCommand } from '@/shared/messaging';
import type {
  ProbeCore,
  ProbeKeyResult,
  ProbeReply,
  ProbeStage,
  ProbeTier,
} from '@/shared/probe';
import type { LocatorSpec } from './locator';

import {
  PROBE_SAMPLE_GAP_MS,
  PROBE_SAMPLES,
  rateOf,
  stageOfKey,
} from '@/shared/probe';
import { isOnSurface } from '@/shared/surfaces';

import { isRunBusy } from './controller';
import { activeDialog, isVisible, tierHits } from './locator';
import { sleep } from './primitives';
import SELECTORS from './selectors';

type Tally = {
  hits: number;
  samples: number;
  wins: [number, number, number, number];
};

const TIERS: readonly ProbeTier[] = [1, 2, 3, 4];

let probing = false;

class UnknownScreenError extends Error {
  constructor() {
    super('unknown screen');
    this.name = 'UnknownScreenError';
  }
}

function pageLang(): string {
  const raw = document.documentElement.lang ?? '';
  return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(raw) ? raw : '';
}

// Mỏ neo chỉ tính khớp nhãn (tầng 1, 3): các tầng đường lui theo cấu trúc quá rộng, vd. ô nhập
// duy nhất của bước nhập BM cũng thoả đường lui của `dialog.assetSearch`. Chỉ dùng key RIÊNG của
// từng bước làm neo: nút Chỉ định/Huỷ có mặt từ bước chọn tài sản nên không phải neo của bước quyền.
const anchored = (specs: readonly LocatorSpec[], lang: string): boolean =>
  specs.some((spec) => {
    const hits = tierHits(spec, lang);
    return hits !== undefined && (hits.counts[0] > 0 || hits.counts[2] > 0);
  });

// Nhận diện màn bằng "mỏ neo": vài key đặc trưng của từng bước. Quyền (access) xét trước
// vì khi đã chọn tài sản, bước chọn tài sản và bước chọn quyền cùng hiện trong một hộp thoại.
// Hộp thoại không khớp mỏ neo nào (nhãn có thể đã đổi) trả undefined: panel cho chọn tay.
export function detectStage(lang = pageLang()): ProbeStage | undefined {
  if (activeDialog()) {
    if (
      anchored(
        [
          SELECTORS.accessPartial,
          SELECTORS.taskCampaigns,
          SELECTORS.taskPerformance,
          SELECTORS.taskCreative,
          SELECTORS.taskManage,
        ],
        lang
      )
    ) {
      return 'dialog-access';
    }
    if (
      anchored([SELECTORS.assetSearch, SELECTORS.assetTypeAdAccounts], lang)
    ) {
      return 'dialog-assets';
    }
    return anchored([SELECTORS.bmIdInput], lang) ? 'dialog-bm' : undefined;
  }
  // Trang Requests có bộ key riêng; không lẫn vào các màn của flow Gán partner. Nút Approve có
  // mặt nghĩa là khung chi tiết đang mở.
  if (isOnSurface('requests', window.location.pathname)) {
    return anchored([SELECTORS.requestApprove], lang)
      ? 'request-detail'
      : 'requests';
  }
  const menu = document.querySelector<HTMLElement>('[role="menu"]');
  if (menu && isVisible(menu)) return 'menu';
  // Nhãn trang chi tiết đổi thì rơi về `page` (fail-closed: gate vẫn đóng, không báo đạt sai).
  return anchored(
    [SELECTORS.partnerAssign, SELECTORS.partnerAssignedAssets],
    lang
  )
    ? 'detail'
    : 'page';
}

// Tầng mà spec có khai báo dữ liệu để thử (tầng 2 cần `attrs`, tầng 4 cần `structure`).
function applicableTiers(spec: LocatorSpec): ProbeTier[] {
  return TIERS.filter((tier) => {
    if (tier === 1 || tier === 3) return spec.label !== undefined;
    if (tier === 2) return (spec.attrs?.length ?? 0) > 0;
    return spec.structure !== undefined;
  });
}

function resultOf(
  spec: LocatorSpec,
  stage: ProbeStage,
  tally: Tally | undefined
): ProbeKeyResult {
  const base = {
    key: spec.key,
    stage: stageOfKey(spec.key),
    scope: spec.scope,
  };
  if (!tally || stageOfKey(spec.key) !== stage || tally.samples === 0) {
    return { ...base, measured: false, hits: 0, samples: 0, missTiers: [] };
  }
  const top = Math.max(...tally.wins);
  const winTier = top > 0 ? TIERS[tally.wins.indexOf(top)] : undefined;
  return {
    ...base,
    measured: true,
    hits: tally.hits,
    samples: tally.samples,
    winTier,
    missTiers:
      winTier === undefined
        ? []
        : applicableTiers(spec).filter((tier) => tier < winTier),
  };
}

export async function runProbe(
  lang: string,
  signal: AbortSignal,
  samples = PROBE_SAMPLES,
  gapMs = PROBE_SAMPLE_GAP_MS,
  // Màn do user chọn tay; bỏ trống thì tự nhận diện (và phải nhận ra được).
  chosen: ProbeStage | undefined = undefined
): Promise<ProbeCore> {
  const stage = chosen ?? detectStage(lang);
  if (stage === undefined) throw new UnknownScreenError();
  const specs: LocatorSpec[] = Object.values(SELECTORS);
  const tallies = new Map<string, Tally>();
  for (let i = 0; i < samples; i += 1) {
    // Màn có thể đổi giữa các mẫu (user bấm): dừng, báo cáo theo màn lúc bắt đầu sẽ sai.
    // Màn chọn tay thì tôn trọng lựa chọn, không tự nhận diện lại.
    if (chosen === undefined && detectStage(lang) !== stage) break;
    specs
      .filter((spec) => stageOfKey(spec.key) === stage)
      .forEach((spec) => {
        const tally = tallies.get(spec.key) ?? {
          hits: 0,
          samples: 0,
          wins: [0, 0, 0, 0] as Tally['wins'],
        };
        const found = tierHits(spec, lang);
        // Vùng tìm chưa có trên trang: không tính là mẫu.
        if (found) {
          tally.samples += 1;
          if (found.win !== undefined) {
            tally.hits += 1;
            tally.wins[found.win - 1] += 1;
          }
        }
        tallies.set(spec.key, tally);
      });
    if (i + 1 < samples) {
      // eslint-disable-next-line no-await-in-loop -- các mẫu phải cách nhau theo thời gian
      await sleep(gapMs, signal);
    }
  }
  const keys = specs.map((spec) =>
    resultOf(spec, stage, tallies.get(spec.key))
  );
  return {
    version: 1,
    at: Date.now(),
    lang,
    // Chỉ pathname: query của BM chứa business_id; đoạn số dài trong path cũng là ID.
    pathname: window.location.pathname.replace(/\d{5,}/g, ':id'),
    stage,
    // Màn chọn tay không được nhận diện xác nhận: đánh dấu để báo cáo không bị tin như tự động.
    manual: chosen !== undefined ? true : undefined,
    samples,
    rate: rateOf(keys),
    keys,
  };
}

export default async function handleProbe(
  command: ProbeCommand
): Promise<ProbeReply> {
  if (probing || isRunBusy()) return { ok: false, code: 'ERR_BUSY' };
  probing = true;
  try {
    const report = await runProbe(
      pageLang(),
      new AbortController().signal,
      PROBE_SAMPLES,
      PROBE_SAMPLE_GAP_MS,
      command.stage
    );
    return { ok: true, report };
  } catch (error) {
    if (error instanceof UnknownScreenError) {
      return { ok: false, code: 'ERR_UNKNOWN_SCREEN' };
    }
    return { ok: false, code: 'ERR_INTERNAL' };
  } finally {
    probing = false;
  }
}
