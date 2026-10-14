import { JSX } from 'react';
import type { ProbeController } from '@/shared/hooks/useProbe';
import type { Lang } from '@/shared/i18n';
import type { ProbeKeyResult, ProbeReport } from '@/shared/probe';

import { translate } from '@/shared/i18n';
import { PROBE_PASS_RATE, PROBE_STAGES } from '@/shared/probe';

import CopyButton from './run/CopyButton';
import { formatClock } from './run/format';

type ProbeScreenProps = {
  lang: Lang;
  probe: ProbeController;
  // Tab BM chưa kết nối: chặn nút chạy.
  disabled: boolean;
};

const PCT = Math.round(PROBE_PASS_RATE * 100);

const GATE_TEXT = {
  pass: 'text-green-700 dark:text-green-300',
  below: 'text-yellow-800 dark:text-yellow-300',
  incomplete: 'text-base-content/70',
} as const;

function percent(rate: number): number {
  return Math.round(rate * 1000) / 10;
}

function KeyRow({
  lang,
  item,
}: {
  lang: Lang;
  item: ProbeKeyResult;
}): JSX.Element {
  if (!item.measured) {
    return (
      <li className='border-base-content/10 text-base-content/60 flex items-center justify-between gap-2 border-b px-3 py-1.5 text-xs last:border-b-0'>
        <span className='min-w-0 break-all font-mono'>{item.key}</span>
        <span className='shrink-0'>
          {translate(lang, 'probe.notMeasured', {
            stage: translate(lang, `probe.stage.${item.stage}`),
          })}
        </span>
      </li>
    );
  }
  const rate = item.samples > 0 ? item.hits / item.samples : 0;
  let flag: 'miss' | 'weak' | undefined;
  if (rate < 0.8) flag = 'miss';
  else if (rate < PROBE_PASS_RATE) flag = 'weak';
  const tone = {
    miss: 'text-red-700 dark:text-red-300',
    weak: 'text-yellow-800 dark:text-yellow-300',
    none: 'text-green-700 dark:text-green-300',
  }[flag ?? 'none'];
  return (
    <li
      className={`border-base-content/10 flex items-center justify-between gap-2 border-b px-3 py-1.5 text-xs last:border-b-0 ${
        flag === 'miss' ? 'bg-red-50 dark:bg-red-950/40' : ''
      }`}
    >
      <span className='min-w-0'>
        <span className='block break-all font-mono'>{item.key}</span>
        <span className='text-base-content/70'>
          {item.winTier
            ? translate(lang, 'probe.tierWin', { n: item.winTier })
            : '—'}
          {item.missTiers.length > 0
            ? ` · ${translate(lang, 'probe.miss', { tiers: item.missTiers.join(', ') })}`
            : ''}
        </span>
      </span>
      <span className={`shrink-0 text-right font-semibold ${tone}`}>
        {percent(rate)}%
        {flag ? (
          <span className='block text-[11px] font-normal'>
            {translate(lang, `probe.flag.${flag}`)}
          </span>
        ) : null}
      </span>
    </li>
  );
}

function Report({
  lang,
  report,
  probe,
}: {
  lang: Lang;
  report: ProbeReport;
  probe: ProbeController;
}): JSX.Element {
  const { gate } = probe;
  const measured = report.keys.filter((item) => item.measured);
  return (
    <>
      <p className='text-base-content/70 m-0 text-xs'>
        {translate(lang, 'probe.meta', {
          time: formatClock(report.at),
          lang: report.lang || '?',
          samples: report.samples,
          stage: translate(lang, `probe.stage.${report.stage}`),
        })}
      </p>
      <section className='border-base-content/15 rounded-md border bg-base-100 p-3'>
        <div className='text-base-content/70 text-xs'>
          {translate(lang, 'probe.rate')}
        </div>
        <div className='text-2xl font-bold'>
          {report.rate === undefined ? '—' : `${percent(report.rate)}%`}
        </div>
        <div className={`mt-1 text-xs ${GATE_TEXT[gate]}`}>
          {translate(lang, `probe.gate.${gate}`, { pct: PCT })}
        </div>
      </section>
      <section aria-label={translate(lang, 'probe.stageReports')}>
        <ul className='m-0 flex list-none flex-wrap gap-1.5 p-0'>
          {PROBE_STAGES.map((stage) => {
            const stageReport = probe.reports[stage];
            const rate = stageReport?.rate;
            return (
              <li
                key={stage}
                className='border-base-content/20 rounded-full border bg-base-100 px-2.5 py-1 text-xs'
              >
                {translate(lang, `probe.stage.${stage}`)}{' '}
                <span className='font-semibold'>
                  {rate === undefined
                    ? translate(lang, 'probe.stage.none')
                    : `${percent(rate)}%`}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <h2 className='text-base-content/70 m-0 text-xs font-medium'>
        {translate(lang, 'probe.keys')} · {measured.length}/{report.keys.length}
      </h2>
      <ul className='border-base-content/15 m-0 flex list-none flex-col overflow-hidden rounded-md border bg-base-100 p-0'>
        {report.keys.map((item) => (
          <KeyRow key={item.key} lang={lang} item={item} />
        ))}
      </ul>
    </>
  );
}

export default function ProbeScreen({
  lang,
  probe,
  disabled,
}: ProbeScreenProps): JSX.Element {
  const { status, report, errorKey } = probe;
  const running = status === 'running';
  let runLabel = translate(lang, 'probe.run');
  if (running) runLabel = translate(lang, 'probe.running');
  else if (status === 'error') runLabel = translate(lang, 'probe.retry');
  else if (report) runLabel = translate(lang, 'probe.rerun');

  return (
    <>
      <h1 className='m-0 text-lg font-medium'>
        {translate(lang, 'probe.title')}
      </h1>
      {errorKey ? (
        <div role='alert' className='alert alert-warning text-[13px]'>
          {translate(lang, errorKey as Parameters<typeof translate>[1])}
        </div>
      ) : null}
      {report ? (
        <Report lang={lang} report={report} probe={probe} />
      ) : (
        <p className='text-base-content/70 m-0 text-[13px]'>
          {translate(lang, 'probe.empty')}
        </p>
      )}
      <div className='flex flex-wrap gap-2'>
        <button
          type='button'
          disabled={running || disabled}
          onClick={probe.run}
          className='inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-3 text-[13px] font-semibold text-white disabled:opacity-50'
        >
          {runLabel}
        </button>
        {report ? (
          <CopyButton
            lang={lang}
            text={JSON.stringify(report, null, 2)}
            label={translate(lang, 'probe.copy')}
          />
        ) : null}
      </div>
    </>
  );
}
