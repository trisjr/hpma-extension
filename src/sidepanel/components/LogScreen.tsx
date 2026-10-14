import { JSX, useEffect, useRef, useState } from 'react';
import type { Lang } from '@/shared/i18n';
import type { LogLevel, RunLogEntry, RunState } from '@/shared/run';

import { translate } from '@/shared/i18n';
import {
  countByLevel,
  filterByLevel,
  isRunActive,
  LOG_LEVELS,
  LOG_LIMIT,
  runLog,
} from '@/shared/run';

import { formatClock } from './run/format';

type LevelFilter = 'all' | LogLevel;

type LogScreenProps = {
  lang: Lang;
  run: RunState | undefined;
};

const LEVEL_TEXT: Record<LogLevel, string> = {
  ok: 'text-green-700 dark:text-green-300',
  warn: 'text-yellow-800 dark:text-yellow-300',
  error: 'text-red-700 dark:text-red-300',
};

const ROW_BG: Record<LogLevel, string> = {
  ok: '',
  warn: '',
  error: 'bg-red-50 dark:bg-red-950/40',
};

function where(lang: Lang, entry: RunLogEntry): string {
  if (entry.step === 0) return translate(lang, 'log.run');
  const step = translate(lang, 'log.step', { n: entry.step });
  return entry.phase
    ? `${step} ${translate(lang, `log.phase.${entry.phase}`)}`
    : step;
}

function message(lang: Lang, entry: RunLogEntry): string {
  const parts = [translate(lang, `log.code.${entry.code}`)];
  if (entry.key) {
    const tier = entry.tier
      ? ` · ${translate(lang, 'log.tier', { n: entry.tier })}`
      : '';
    parts.push(`${entry.key}${tier}`);
  }
  if (entry.detail) parts.push(entry.detail);
  return parts.join(' · ');
}

export default function LogScreen({ lang, run }: LogScreenProps): JSX.Element {
  const [level, setLevel] = useState<LevelFilter>('all');
  const endRef = useRef<HTMLDivElement>(null);
  const entries = run ? runLog(run) : [];
  const counts = countByLevel(entries);
  const shown = filterByLevel(entries, level);
  const live = isRunActive(run);
  const total = shown.length;

  // Giữ dòng mới nhất trong tầm nhìn khi run đang chạy.
  useEffect(() => {
    if (live) endRef.current?.scrollIntoView({ block: 'end' });
  }, [live, total]);

  if (!run) {
    return (
      <>
        <h1 className='m-0 text-lg font-medium'>
          {translate(lang, 'log.empty.title')}
        </h1>
        <p className='text-base-content/70 m-0 text-[13px]'>
          {translate(lang, 'log.empty.body')}
        </p>
      </>
    );
  }

  const chips: { id: LevelFilter; label: string; count: number }[] = [
    {
      id: 'all',
      label: translate(lang, 'log.filter.all'),
      count: entries.length,
    },
    ...LOG_LEVELS.map((id) => ({
      id,
      label: translate(lang, `log.level.${id}`),
      count: counts[id],
    })),
  ];

  return (
    <>
      <div className='flex items-center gap-2'>
        <h1 className='m-0 text-lg font-medium'>
          {translate(lang, 'log.title')}
        </h1>
        <span className='text-base-content/70 font-mono text-xs'>
          {run.runId}
        </span>
        {live ? (
          <span className='ml-auto inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-300'>
            <span className='size-1.5 rounded-full bg-green-500 motion-safe:animate-pulse' />
            {translate(lang, 'log.live')}
          </span>
        ) : null}
      </div>
      <div
        role='group'
        aria-label={translate(lang, 'log.filter')}
        className='flex flex-wrap gap-1.5'
      >
        {chips.map((chip) => (
          <button
            key={chip.id}
            type='button'
            aria-pressed={level === chip.id}
            onClick={() => setLevel(chip.id)}
            className={`h-8 rounded-full border px-3 text-xs ${
              level === chip.id
                ? 'border-blue-300 bg-blue-50 font-semibold text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300'
                : 'border-base-content/20 bg-base-100'
            }`}
          >
            {chip.label} {chip.count}
          </button>
        ))}
      </div>
      {entries.length >= LOG_LIMIT ? (
        <p className='text-base-content/70 m-0 text-xs'>
          {translate(lang, 'log.truncated', { n: LOG_LIMIT })}
        </p>
      ) : null}
      {shown.length === 0 ? (
        <p className='text-base-content/70 m-0 text-[13px]'>
          {translate(lang, 'log.emptyFilter')}
        </p>
      ) : (
        <ol
          aria-live={live ? 'polite' : 'off'}
          className='border-base-content/15 m-0 flex list-none flex-col overflow-hidden rounded-md border bg-base-100 p-0'
        >
          {shown.map((entry, index) => (
            <li
              // Trùng `at` là bình thường (nhiều dòng cùng một snapshot): thêm chỉ số.
              // eslint-disable-next-line react/no-array-index-key -- log chỉ nối thêm, thứ tự cố định
              key={`${entry.at}-${index}`}
              className={`border-base-content/10 grid grid-cols-[56px_1fr] gap-x-2 gap-y-0.5 border-b px-3 py-1.5 text-xs last:border-b-0 ${ROW_BG[entry.level]}`}
            >
              <span className='text-base-content/70 font-mono'>
                {formatClock(entry.at)}
              </span>
              <span>
                <span className={`font-semibold ${LEVEL_TEXT[entry.level]}`}>
                  {translate(lang, `log.level.${entry.level}`)}
                </span>
                <span className='text-base-content/70'>
                  {' '}
                  · {where(lang, entry)}
                </span>
                <span className='block break-words'>
                  {message(lang, entry)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <div ref={endRef} />
    </>
  );
}
