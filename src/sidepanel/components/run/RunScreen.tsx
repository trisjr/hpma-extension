import { JSX, useEffect, useState } from 'react';
import type { Lang, MessageKey } from '@/shared/i18n';
import type { RunState, RunTarget } from '@/shared/run';

import { translate } from '@/shared/i18n';
import { isApproveRun, STEP_COUNT } from '@/shared/run';

import Icon from '../Icon';
import { MODE_STYLES } from '../riskStyles';
import { formatClock, formatElapsed, taskLabels } from './format';
import SimChip from './SimChip';
import StepList from './StepList';

type RunScreenProps = {
  lang: Lang;
  run: RunState;
  onStop: () => void;
  onConfirmAssign: () => void;
  onResync: () => void;
  onOpenDiff: () => void;
};

const STATUS_CHIP: Record<'running' | 'waiting-user' | 'paused', string> = {
  running: 'text-blue-600 dark:text-blue-400',
  'waiting-user': 'text-yellow-800 dark:text-yellow-300',
  paused: 'text-base-content/70',
};

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

export default function RunScreen({
  lang,
  run,
  onStop,
  onConfirmAssign,
  onResync,
  onOpenDiff,
}: RunScreenProps): JSX.Element {
  const now = useNow(true);
  const mode = run.mode === 'dry' ? 'dry' : 'assist';
  const modeStyle = MODE_STYLES[mode];
  const status =
    run.status === 'waiting-user' || run.status === 'paused'
      ? run.status
      : 'running';
  const target = run.targets[run.currentTarget];
  const waiting = run.status === 'waiting-user';
  const paused = run.status === 'paused';
  // Tab BM bị ẩn: engine tự chạy tiếp khi tab hiện lại, panel không có gì để bấm.
  const hidden = paused && run.pauseReason === 'hidden';
  // Run cũ không có trường này vẫn là simulator.
  const simulated = run.simulated !== false;
  const done = run.targets.filter((item) =>
    ['done', 'skipped-existing', 'pending-approval'].includes(item.outcome)
  );
  const tasks = taskLabels(lang, run.tasks);
  // Flow duyệt request dùng cùng bộ 7 bước nhưng câu chữ riêng (Approve thay cho Assign).
  const approve = isApproveRun(run);
  const willDoLine = (item: RunTarget): string => {
    if (approve) {
      return translate(lang, 'approve.willDo.line', { name: item.name });
    }
    if (item.plan === 'skip') {
      return `${item.name} · ${translate(lang, 'diff.noteSkip')}`;
    }
    return translate(lang, 'run.willDo.line', {
      bm: run.partnerBmId.slice(-6),
      name: item.name,
      tasks,
    });
  };

  return (
    <>
      <div
        role='status'
        className={`flex items-start gap-2.5 rounded-md border p-3 ${modeStyle.selected}`}
      >
        <Icon name={modeStyle.icon} size={18} className='mt-px' />
        <div className='flex flex-col gap-0.5'>
          <span className='text-[13px] font-semibold'>
            {translate(lang, `run.banner.${mode}.title` as MessageKey)}
          </span>
          <span className='text-xs'>
            {translate(lang, `run.banner.${mode}.desc` as MessageKey)}
          </span>
        </div>
      </div>

      <section className='border-base-content/12 flex flex-col gap-3 rounded-md border bg-base-100 p-3'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <h1 className='m-0 text-base font-semibold'>
            {translate(lang, approve ? 'approve.title' : 'pa.title')}
          </h1>
          <span className='flex items-center gap-2'>
            {run.batch.total > 1 && (
              <span className='text-base-content/70 text-xs font-medium'>
                {translate(lang, 'run.batch', {
                  i: run.batch.index,
                  n: run.batch.total,
                })}
              </span>
            )}
            {simulated && <SimChip lang={lang} />}
            <span
              className={`flex items-center gap-1 text-xs font-medium ${STATUS_CHIP[status]}`}
            >
              <span
                aria-hidden='true'
                className='size-1.5 rounded-full bg-current'
              />
              {translate(lang, `run.status.${status}` as MessageKey)}
            </span>
          </span>
        </div>
        <dl className='m-0 grid grid-cols-3 gap-2 text-xs'>
          <div>
            <dt className='text-base-content/70'>
              {translate(lang, 'run.runId')}
            </dt>
            <dd className='m-0 font-medium'>{run.runId}</dd>
          </div>
          <div>
            <dt className='text-base-content/70'>
              {translate(lang, 'run.started')}
            </dt>
            <dd className='m-0 font-medium'>{formatClock(run.startedAt)}</dd>
          </div>
          <div>
            <dt className='text-base-content/70'>
              {translate(lang, 'run.elapsed')}
            </dt>
            <dd className='m-0 font-medium'>
              {formatElapsed(now - run.startedAt)}
            </dd>
          </div>
        </dl>
        <div className='flex flex-col gap-1.5'>
          <div
            aria-live='polite'
            className='flex items-center justify-between gap-2 text-xs'
          >
            <span className='min-w-0 truncate font-medium'>
              {translate(lang, approve ? 'approve.progress' : 'run.progress', {
                i: run.currentTarget + 1,
                n: run.targets.length,
                name: target.name,
              })}
            </span>
            <span className='text-base-content/70 shrink-0'>
              {translate(lang, 'run.stepOf', {
                k: Math.min(run.stepIndex, STEP_COUNT),
              })}
            </span>
          </div>
          <div className='flex gap-1' aria-hidden='true'>
            {run.targets.map((item, index) => {
              let fill = 'bg-base-content/15';
              if (index < run.currentTarget || item.outcome === 'done') {
                fill = 'bg-green-500';
              } else if (index === run.currentTarget) {
                fill = 'bg-blue-500';
              }
              return (
                <span
                  key={item.accountId}
                  className={`h-1 flex-1 rounded-full ${fill}`}
                />
              );
            })}
          </div>
        </div>
      </section>

      {run.auditFailed && (
        <div
          role='alert'
          className='flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100'
        >
          <Icon name='alert' size={14} className='mt-px shrink-0' />
          <span>{translate(lang, 'run.auditFailed')}</span>
        </div>
      )}

      {hidden && (
        <section
          role='status'
          className='border-base-content/12 flex items-start gap-2.5 rounded-md border bg-base-100 p-3'
        >
          <Icon name='alert' size={18} className='mt-px text-yellow-700' />
          <div className='flex flex-col gap-0.5'>
            <span className='text-[13px] font-semibold'>
              {translate(lang, 'run.hidden.title')}
            </span>
            <span className='text-base-content/70 text-xs'>
              {translate(lang, 'run.hidden.body')}
            </span>
          </div>
        </section>
      )}

      {paused && !hidden && (
        <section
          role='status'
          className='border-base-content/12 flex flex-col gap-3 rounded-md border bg-base-100 p-3'
        >
          <div className='flex items-start gap-2.5'>
            <Icon name='alert' size={18} className='mt-px text-yellow-700' />
            <div className='flex flex-col gap-0.5'>
              <span className='text-[13px] font-semibold'>
                {translate(lang, 'run.paused.title')}
              </span>
              <span className='text-base-content/70 text-xs'>
                {translate(lang, 'run.paused.body')}
              </span>
            </div>
          </div>
          <button
            type='button'
            onClick={onResync}
            className='inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-3 text-[13px] font-semibold text-white'
          >
            {translate(lang, 'run.resync')}
          </button>
          <div className='text-base-content/70 flex flex-col gap-1 text-xs'>
            <span className='font-medium'>
              {translate(lang, 'run.paused.what')}
            </span>
            <ul className='m-0 flex list-disc flex-col gap-0.5 pl-4'>
              <li>{translate(lang, 'run.paused.what1')}</li>
              <li>
                {translate(lang, 'run.paused.what2', {
                  k: run.stepIndex,
                  mode: translate(lang, modeStyle.labelKey),
                })}
              </li>
              <li>{translate(lang, 'run.paused.what3')}</li>
            </ul>
          </div>
        </section>
      )}

      {waiting && (
        <section
          aria-labelledby='next-step-title'
          className='flex flex-col gap-2.5 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-yellow-950 dark:border-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-100'
        >
          <div className='text-xs font-semibold uppercase tracking-[0.05rem]'>
            {translate(lang, 'run.next.label')}
          </div>
          <h2 id='next-step-title' className='m-0 text-sm font-semibold'>
            {translate(lang, approve ? 'approve.next.title' : 'run.next.title')}
          </h2>
          <ol className='m-0 flex list-decimal flex-col gap-1 pl-4 text-[13px]'>
            <li>
              {translate(lang, approve ? 'approve.next.1' : 'run.next.1')}
            </li>
            <li>
              {approve
                ? translate(lang, 'approve.next.2', {
                    bm: run.partnerName ?? '',
                  })
                : translate(lang, 'run.next.2', {
                    bm: run.partnerBmId,
                    tasks,
                  })}
            </li>
            <li>
              {translate(lang, approve ? 'approve.next.3' : 'run.next.3')}
            </li>
          </ol>
          <div
            role='status'
            className='flex items-center gap-1.5 text-xs font-medium'
          >
            <Icon name='clock' size={14} />
            <span>
              {translate(
                lang,
                approve ? 'approve.next.waiting' : 'run.next.waiting'
              )}
            </span>
          </div>
          {/* Simulator không có sự kiện "hộp thoại đóng" nên user giả lập; engine thì chỉ giục verify. */}
          <button
            type='button'
            onClick={onConfirmAssign}
            className='inline-flex h-10 items-center justify-center rounded-md border border-yellow-400 bg-base-100 px-3 text-[13px] font-semibold text-base-content'
          >
            {translate(
              lang,
              // Flow duyệt không có simulator nên luôn là nút của engine.
              // eslint-disable-next-line no-nested-ternary
              approve
                ? 'approve.next.engineDone'
                : simulated
                  ? 'run.next.simulate'
                  : 'run.next.engineDone'
            )}
          </button>
        </section>
      )}

      <StepList lang={lang} steps={run.steps} />

      {run.mode === 'dry' && (
        <section className='border-base-content/12 flex flex-col gap-2 rounded-md border bg-base-100 p-3'>
          <div className='flex items-center justify-between gap-2'>
            <h2 className='m-0 text-[13px] font-semibold'>
              {translate(lang, 'run.willDo.title')}
            </h2>
            {/* Màn Diff đầy đủ chỉ có cho flow Gán partner. */}
            {!approve && (
              <button
                type='button'
                onClick={onOpenDiff}
                className='h-9 text-[13px] font-medium text-blue-600 dark:text-blue-400'
              >
                {translate(lang, 'run.willDo.full')}
              </button>
            )}
          </div>
          {done.length === 0 ? (
            <span className='text-base-content/70 text-xs'>…</span>
          ) : (
            <ul className='m-0 flex list-none flex-col gap-1 p-0'>
              {done.map((item) => (
                <li
                  key={item.accountId}
                  className='flex items-start gap-2 text-xs'
                >
                  <span
                    aria-hidden='true'
                    className='flex size-5 shrink-0 items-center justify-center rounded bg-base-200 font-semibold'
                  >
                    {item.plan === 'skip' ? '=' : '+'}
                  </span>
                  <span className='break-words'>{willDoLine(item)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <button
        type='button'
        onClick={onStop}
        className='border-base-content/20 inline-flex h-10 items-center justify-center gap-1.5 rounded-md border bg-base-100 text-[13px] font-semibold'
      >
        <Icon name='stop' size={15} />
        {translate(lang, 'run.stop')}
      </button>
    </>
  );
}
