import { JSX, ReactNode, useState } from 'react';
import type { Lang, MessageKey } from '@/shared/i18n';
import type { RunState, RunTarget, TargetOutcome } from '@/shared/run';

import { isMessageKey, translate } from '@/shared/i18n';
import {
  APPROVE_STEP_TITLE_KEYS,
  isApproveRun,
  STEP_TITLE_KEYS,
} from '@/shared/run';

import Icon from '../Icon';
import CopyButton from './CopyButton';
import { formatClock } from './format';
import SimChip from './SimChip';

type ResultScreenProps = {
  lang: Lang;
  run: RunState;
  onDone: () => void;
  // Cấu hình lại cho các TKQC chưa xong (về wizard bước 2).
  onReconfigure: (accountIds: string[]) => void;
};

type Tone = {
  box: string;
  icon: 'check' | 'clock' | 'alert' | 'stop';
  iconBox: string;
};

const TONE: Record<'done' | 'pending-approval' | 'failed' | 'stopped', Tone> = {
  done: {
    box: 'border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950/40 dark:text-green-100',
    icon: 'check',
    iconBox: 'bg-green-600 text-white',
  },
  'pending-approval': {
    box: 'border-yellow-300 bg-yellow-50 text-yellow-950 dark:border-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-100',
    icon: 'clock',
    iconBox: 'bg-yellow-500 text-yellow-950',
  },
  failed: {
    box: 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100',
    icon: 'alert',
    iconBox: 'bg-red-600 text-white',
  },
  stopped: {
    box: 'border-base-content/20 bg-base-200 text-base-content',
    icon: 'stop',
    iconBox: 'bg-base-content/60 text-base-100',
  },
};

const DOT: Record<TargetOutcome, string> = {
  queued: 'bg-base-content/30',
  running: 'bg-blue-500',
  done: 'bg-green-500',
  'skipped-existing': 'bg-base-content/40',
  failed: 'bg-red-500',
  'pending-approval': 'bg-yellow-500',
  unverified: 'bg-amber-500',
};

function outcomeLabel(lang: Lang, run: RunState, target: RunTarget): string {
  if (target.outcome === 'done' && isApproveRun(run)) {
    return translate(
      lang,
      run.mode === 'dry' ? 'approve.result.o.doneDry' : 'approve.result.o.done'
    );
  }
  if (target.outcome === 'done' && run.mode === 'dry') {
    return translate(lang, 'result.o.doneDry');
  }
  return translate(lang, `result.o.${target.outcome}` as MessageKey);
}

const BTN_GHOST =
  'border-base-content/20 inline-flex h-10 items-center justify-center gap-1.5 rounded-md border bg-base-100 px-3 text-[13px] font-semibold';

export default function ResultScreen({
  lang,
  run,
  onDone,
  onReconfigure,
}: ResultScreenProps): JSX.Element {
  const [lastCheck, setLastCheck] = useState(() => Date.now());
  const status =
    run.status === 'pending-approval' ||
    run.status === 'failed' ||
    run.status === 'stopped'
      ? run.status
      : 'done';
  const tone = TONE[status];
  // Flow duyệt request: cùng 7 bước nhưng câu chữ riêng; không có readback/undo/cấu hình lại.
  const approve = isApproveRun(run);
  const stepKeys = approve ? APPROVE_STEP_TITLE_KEYS : STEP_TITLE_KEYS;
  const endedAt = run.endedAt ?? run.startedAt;
  const written = run.targets.filter(
    (item) => item.plan === 'run' && item.outcome === 'done'
  );
  // Engine đánh dấu "đã có" bằng outcome (plan vẫn là 'run'), simulator bằng plan.
  const skipped = run.targets.filter(
    (item) => item.plan === 'skip' || item.outcome === 'skipped-existing'
  );
  // 'unverified' có thể đã ghi nên không bao giờ đưa vào danh sách chạy lại.
  const unfinished = run.targets.filter(
    (item) =>
      item.plan === 'run' &&
      item.outcome !== 'done' &&
      item.outcome !== 'skipped-existing' &&
      item.outcome !== 'unverified'
  );
  const hasUnverified = run.targets.some(
    (item) => item.outcome === 'unverified'
  );
  const failedTarget = run.targets.find((item) => item.outcome === 'failed');
  // Kẹp vào 1..7 để tra tiêu đề bước không bao giờ ra ngoài mảng.
  const failedStep = Math.min(
    Math.max(run.error?.stepIndex ?? 1, 1),
    stepKeys.length
  );

  const titleFor = (): string => {
    if (status === 'pending-approval') {
      return translate(lang, 'result.title.pending');
    }
    if (status === 'stopped') {
      // Stopped kèm lỗi = run bị mất (vd. tab BM reload), không phải user dừng.
      return translate(
        lang,
        run.error ? 'result.title.interrupted' : 'result.title.stopped'
      );
    }
    if (status === 'failed') {
      return translate(lang, 'result.title.failed', {
        k: failedStep,
        name: translate(lang, stepKeys[failedStep - 1]),
      });
    }
    if (approve) {
      return translate(
        lang,
        run.mode === 'dry'
          ? 'approve.result.title.done.dry'
          : 'approve.result.title.done',
        { w: written.length }
      );
    }
    return translate(
      lang,
      run.mode === 'dry' ? 'result.title.done.dry' : 'result.title.done',
      { w: written.length, s: skipped.length }
    );
  };

  const subFor = (): string => {
    if (status === 'failed') {
      return translate(
        lang,
        approve ? 'approve.result.sub.failed' : 'result.sub.failed',
        {
          i: run.currentTarget + 1,
          n: run.targets.length,
          runId: run.runId,
          time: formatClock(endedAt),
        }
      );
    }
    return translate(lang, 'result.range', {
      runId: run.runId,
      from: formatClock(run.startedAt),
      to: formatClock(endedAt),
    });
  };

  const readbackTarget = written[0];
  const readback = readbackTarget
    ? translate(lang, 'result.readback.body', {
        time: formatClock(endedAt),
        id: readbackTarget.accountId,
        bm: run.partnerBmId,
        tasks: run.tasks.join(', '),
        k: run.tasks.length,
      })
    : '';

  // Mô tả lỗi: mã engine có `err.<code>` thì dùng; mã cũ của simulator thì rơi về
  // câu theo mode (cần target lỗi để điền tên).
  const hasEngineMessage =
    run.error !== undefined && isMessageKey(`err.${run.error.code}`);
  const errorBody = (code: string): string | undefined => {
    const errKey = `err.${code}`;
    if (isMessageKey(errKey)) return translate(lang, errKey);
    if (!failedTarget) return undefined;
    const bodyKey: MessageKey =
      run.mode === 'assist'
        ? 'result.failed.bodyAct'
        : 'result.failed.bodyLocate';
    return translate(lang, bodyKey, { name: failedTarget.name, k: failedStep });
  };

  const errorBlock = (): ReactNode => {
    if ((status !== 'failed' && status !== 'stopped') || !run.error) {
      return null;
    }
    const { code, detail } = run.error;
    const body = errorBody(code);
    // Văn bản để user gửi lại cho dev: không chứa nội dung trang.
    const copyText = [
      `runId: ${run.runId}`,
      `stepIndex: ${run.error.stepIndex}`,
      `code: ${code}`,
      `lang: ${lang}`,
      ...(detail ? [`detail: ${detail}`] : []),
    ].join('\n');
    return (
      <section className='border-base-content/12 flex flex-col gap-2 rounded-md border bg-base-100 p-3'>
        <h2 className='m-0 text-sm font-semibold'>
          {translate(lang, 'result.failed.reason')}
        </h2>
        {body && <p className='m-0 text-[13px]'>{body}</p>}
        <pre className='m-0 overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-base-200 p-2 text-xs'>
          {copyText}
        </pre>
        <div>
          <CopyButton
            lang={lang}
            text={copyText}
            label={translate(lang, 'result.failed.copyErr')}
          />
        </div>
      </section>
    );
  };

  return (
    <>
      <div
        role={status === 'failed' ? 'alert' : 'status'}
        className={`flex items-start gap-2.5 rounded-md border p-3 ${tone.box}`}
      >
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-full ${tone.iconBox}`}
        >
          <Icon name={tone.icon} size={16} />
        </span>
        <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
          <span className='text-xs font-semibold uppercase tracking-[0.05rem]'>
            {status}
          </span>
          <h1 className='m-0 break-words text-base font-semibold'>
            {titleFor()}
          </h1>
          <span className='break-words text-xs opacity-80'>{subFor()}</span>
        </div>
        {run.simulated !== false && <SimChip lang={lang} />}
      </div>

      {status === 'pending-approval' && (
        <section className='border-base-content/12 flex flex-col gap-2 rounded-md border bg-base-100 p-3'>
          <p className='m-0 text-[13px]'>
            {translate(lang, 'result.pending.body')}
          </p>
          <div className='flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-2 text-xs text-yellow-950 dark:border-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-100'>
            <Icon name='alert' size={14} className='mt-px' />
            <span>
              <b>{translate(lang, 'result.pending.noReplay')}</b>{' '}
              {translate(lang, 'result.pending.noReplayBody')}
            </span>
          </div>
        </section>
      )}

      {status === 'stopped' && !run.error && (
        <p className='border-base-content/12 text-base-content/70 m-0 rounded-md border bg-base-100 p-3 text-[13px]'>
          {translate(lang, 'result.stopped.body')}
        </p>
      )}

      {errorBlock()}

      {hasUnverified && (
        <div
          role='alert'
          className='flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100'
        >
          <Icon name='alert' size={14} className='mt-px shrink-0' />
          <span className='flex flex-col gap-0.5'>
            <b>{translate(lang, 'result.unverified.hint')}</b>
            {run.mode === 'assist' && (
              <span>{translate(lang, 'result.unverified.cancelNote')}</span>
            )}
          </span>
        </div>
      )}

      <section
        aria-label={translate(lang, 'result.targets')}
        className='border-base-content/12 overflow-hidden rounded-md border bg-base-100'
      >
        <ul className='m-0 flex list-none flex-col p-0'>
          {run.targets.map((item) => (
            <li
              key={item.accountId}
              className='border-base-content/8 flex items-center gap-2.5 border-b px-3 py-2.5 last:border-b-0'
            >
              <span
                aria-hidden='true'
                className={`size-2 shrink-0 rounded-full ${DOT[item.outcome]}`}
              />
              <span className='flex min-w-0 flex-1 flex-col'>
                <span className='truncate text-[13px] font-semibold'>
                  {item.name}
                </span>
                <span className='text-base-content/70 truncate text-xs'>
                  {item.accountId}
                </span>
              </span>
              <span className='text-base-content/70 flex shrink-0 flex-col items-end text-xs font-medium'>
                {outcomeLabel(lang, run, item)}
                {item.outcome === 'failed' && item.code && (
                  <code className='font-mono text-[11px] font-normal'>
                    {item.code}
                  </code>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {status === 'done' &&
        run.mode === 'assist' &&
        readbackTarget &&
        !approve && (
          <section
            aria-label={translate(lang, 'result.readback.title', {
              name: readbackTarget.name,
            })}
            className='border-base-content/12 flex flex-col gap-2 rounded-md border bg-base-100 p-3'
          >
            <div className='flex items-center justify-between gap-2'>
              <h2 className='m-0 text-[13px] font-semibold'>
                {translate(lang, 'result.readback.title', {
                  name: readbackTarget.name,
                })}
              </h2>
              <CopyButton
                lang={lang}
                text={readback}
                label={translate(lang, 'result.copy')}
              />
            </div>
            <pre className='m-0 overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-base-200 p-2 text-xs'>
              {readback}
            </pre>
          </section>
        )}

      {status === 'pending-approval' && (
        <div className='flex flex-col gap-1.5'>
          <button
            type='button'
            onClick={() => setLastCheck(Date.now())}
            className={BTN_GHOST}
          >
            <Icon name='clock' size={15} />
            {translate(lang, 'result.pending.recheck')}
          </button>
          <span className='text-base-content/70 text-xs'>
            {translate(lang, 'result.pending.recheckNote', {
              time: formatClock(lastCheck),
            })}
          </span>
          <CopyButton
            lang={lang}
            text={translate(lang, 'result.pending.reminder', {
              bm: run.partnerBmId,
              n: run.targets.filter((item) => item.plan === 'run').length,
            })}
            label={translate(lang, 'result.pending.copyReminder')}
          />
        </div>
      )}

      {status === 'failed' && (
        <>
          {/* Câu khuyên "kiểm tra quyền rồi chạy lại" chỉ cho mã cũ của simulator; mã engine đã có hướng xử lý riêng. */}
          {!hasEngineMessage && (
            <div className='border-base-content/12 text-base-content/70 flex items-start gap-2 rounded-md border bg-base-100 p-3 text-xs'>
              <Icon name='shield' size={15} className='mt-px' />
              <span>{translate(lang, 'result.failed.hint')}</span>
            </div>
          )}
          {unfinished.length > 0 && !approve && (
            <button
              type='button'
              onClick={() =>
                onReconfigure(unfinished.map((item) => item.accountId))
              }
              className={BTN_GHOST}
            >
              {translate(lang, 'result.failed.reconfig', {
                n: unfinished.length,
              })}
            </button>
          )}
        </>
      )}

      <button
        type='button'
        onClick={onDone}
        className='inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-3 text-[13px] font-semibold text-white'
      >
        {translate(lang, 'result.done.btn')}
      </button>

      {run.mode === 'assist' && written.length > 0 && !approve && (
        <section
          aria-label={translate(lang, 'result.undo.title')}
          className='border-base-content/12 flex flex-col gap-1.5 rounded-md border bg-base-100 p-3'
        >
          <span className='text-[13px] font-semibold'>
            {translate(lang, 'result.undo.title')}
          </span>
          <span className='text-base-content/70 text-xs'>
            {translate(lang, 'result.undo.body', { n: written.length })}
          </span>
          {/* Cần Full + FR-09 (Gỡ partner): nút chỉ hiện ở dạng khoá. */}
          <button
            type='button'
            disabled
            className={`${BTN_GHOST} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <Icon name='undo' size={15} />
            {translate(lang, 'result.undo.btn', { n: written.length })}
          </button>
        </section>
      )}
    </>
  );
}
