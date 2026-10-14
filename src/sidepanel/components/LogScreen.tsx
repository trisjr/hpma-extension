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

import Icon from './Icon';
import { formatClockMs } from './run/format';

type LevelFilter = 'all' | LogLevel;

type LogScreenProps = {
  lang: Lang;
  run: RunState | undefined;
};

const LEVEL_BADGE: Record<LogLevel, string> = {
  ok: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  warn: 'bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

const ROW_BG: Record<LogLevel, string> = {
  ok: '',
  warn: '',
  error: 'bg-red-50/40 dark:bg-red-950/40',
};

const FILTER_DOT: Record<LevelFilter, string> = {
  all: 'bg-gray-400',
  ok: 'bg-green-500',
  warn: 'bg-yellow-500',
  error: 'bg-red-500',
};

const ICON_BUTTON =
  'border-base-content/20 flex size-9 items-center justify-center rounded-md border bg-base-100';

// Chip bước: `run` cho chính lần chạy, `s3 locate` cho bước 3 (SPEC: Log.dc.html).
function where(lang: Lang, entry: RunLogEntry): string {
  if (entry.step === 0) return translate(lang, 'log.run');
  const step = `s${entry.step}`;
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

function toText(lang: Lang, entries: readonly RunLogEntry[]): string {
  return entries
    .map(
      (entry) =>
        `${formatClockMs(entry.at)} ${entry.level} ${where(lang, entry)} ${message(lang, entry)}`
    )
    .join('\n');
}

export default function LogScreen({ lang, run }: LogScreenProps): JSX.Element {
  const [level, setLevel] = useState<LevelFilter>('all');
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const listRef = useRef<HTMLElement>(null);
  const entries = run ? runLog(run) : [];
  const counts = countByLevel(entries);
  const shown = filterByLevel(entries, level);
  const live = isRunActive(run);
  const total = shown.length;

  // Giữ dòng mới nhất trong tầm nhìn khi run đang chạy, trừ khi anh tạm dừng tự cuộn.
  useEffect(() => {
    const list = listRef.current;
    if (live && !paused && list) list.scrollTop = list.scrollHeight;
  }, [live, paused, total]);

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

  const copy = (): void => {
    navigator.clipboard
      .writeText(toText(lang, shown))
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

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

  const pauseLabel = translate(lang, paused ? 'log.resume' : 'log.pause');

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-2.5'>
      <div className='flex shrink-0 items-center justify-between gap-2'>
        <span className='inline-flex items-center gap-1.5 text-xs leading-4'>
          <span
            className={`size-2 rounded-full ${
              live
                ? 'bg-blue-500 ring-[3px] ring-blue-100 dark:ring-blue-900'
                : 'bg-gray-400'
            }`}
          />
          {live ? `${translate(lang, 'log.live')} · ` : null}
          <span className='font-mono'>{run.runId}</span>
        </span>
        <span className='flex gap-1'>
          {live ? (
            <button
              type='button'
              aria-label={pauseLabel}
              aria-pressed={paused}
              onClick={() => setPaused((value) => !value)}
              className={ICON_BUTTON}
            >
              <Icon name={paused ? 'play' : 'pause'} size={16} />
            </button>
          ) : null}
          <button
            type='button'
            aria-label={translate(lang, 'log.copy')}
            onClick={copy}
            className={ICON_BUTTON}
          >
            <Icon name='copy' size={16} />
          </button>
          <span aria-live='polite' className='sr-only'>
            {copied ? translate(lang, 'result.copied') : ''}
          </span>
        </span>
      </div>
      <div
        role='group'
        aria-label={translate(lang, 'log.filter')}
        className='flex shrink-0 gap-1 rounded-lg bg-base-200 p-[3px]'
      >
        {chips.map((chip) => (
          <button
            key={chip.id}
            type='button'
            aria-pressed={level === chip.id}
            onClick={() => setLevel(chip.id)}
            className={`flex h-9 flex-1 items-center justify-center gap-[5px] rounded-md border text-xs ${
              level === chip.id
                ? 'border-base-content/20 bg-base-100 font-semibold'
                : 'text-base-content/70 border-transparent font-medium'
            }`}
          >
            <span className={`size-1.5 rounded-full ${FILTER_DOT[chip.id]}`} />
            {chip.label}
            <span className='text-base-content/70 text-[11px] font-medium'>
              {chip.count}
            </span>
          </button>
        ))}
      </div>
      {entries.length >= LOG_LIMIT ? (
        <p className='text-base-content/70 m-0 shrink-0 text-xs'>
          {translate(lang, 'log.truncated', { n: LOG_LIMIT })}
        </p>
      ) : null}
      <section
        ref={listRef}
        aria-label={translate(lang, 'log.lines')}
        aria-live={live ? 'polite' : 'off'}
        className='border-base-content/15 min-h-0 overflow-y-auto rounded-md border bg-base-100'
      >
        {shown.length === 0 ? (
          <div className='text-base-content/70 px-3 py-4 text-center text-xs leading-4'>
            {translate(lang, 'log.emptyFilter')}
          </div>
        ) : (
          <ol className='m-0 list-none p-0'>
            {shown.map((entry, index) => (
              <li
                // Trùng `at` là bình thường (nhiều dòng cùng một snapshot): thêm chỉ số.
                // eslint-disable-next-line react/no-array-index-key -- log chỉ nối thêm, thứ tự cố định
                key={`${entry.at}-${index}`}
                className={`border-base-content/10 flex flex-col gap-[3px] border-t px-3 py-2 first:border-t-0 ${ROW_BG[entry.level]}`}
              >
                <span className='flex items-center gap-2'>
                  <span className='text-base-content/70 font-mono text-[11px] leading-4'>
                    {formatClockMs(entry.at)}
                  </span>
                  <span className='h-[18px] rounded bg-base-200 px-1.5 font-mono text-[11px] leading-[18px]'>
                    {where(lang, entry)}
                  </span>
                  <span
                    className={`ml-auto h-[18px] rounded px-1.5 text-[11px] font-semibold leading-[18px] ${LEVEL_BADGE[entry.level]}`}
                  >
                    {translate(lang, `log.level.${entry.level}`)}
                  </span>
                </span>
                <span className='break-words text-xs leading-[17px]'>
                  {message(lang, entry)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
