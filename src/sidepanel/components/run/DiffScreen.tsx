import { JSX } from 'react';
import type { Lang, MessageKey } from '@/shared/i18n';
import type { DiffOp, DiffRow } from '@/shared/run';

import { translate } from '@/shared/i18n';

import Icon from '../Icon';
import { taskLabel } from './format';

type DiffScreenProps = {
  lang: Lang;
  rows: DiffRow[];
  partnerBmId: string;
  budgetLeft: number;
  // Full bị khoá: lớp xác nhận 2 luôn disabled (FR-05).
  fullLocked: boolean;
  onBack: () => void;
};

const OP_VIEW: Record<
  DiffOp,
  { mark: string; labelKey: MessageKey; markBox: string; text: string }
> = {
  add: {
    mark: '+',
    labelKey: 'diff.op.add',
    markBox:
      'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
    text: 'text-green-700 dark:text-green-300',
  },
  change: {
    mark: '~',
    labelKey: 'diff.op.change',
    markBox:
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
    text: 'text-yellow-800 dark:text-yellow-300',
  },
  skip: {
    mark: '=',
    labelKey: 'diff.op.skip',
    markBox: 'bg-base-200 text-base-content/70',
    text: 'text-base-content/70',
  },
  // Engine thật chưa đọc được partner hiện có (FR-08): trung tính, không giả định.
  unknown: {
    mark: '?',
    labelKey: 'diff.op.unknown',
    markBox: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    text: 'text-blue-700 dark:text-blue-300',
  },
};

const CHIP = 'rounded px-1.5 py-0.5 text-xs font-medium';
const CHIP_ADD =
  'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300';
const CHIP_KEEP = 'bg-base-200 text-base-content/70';

export default function DiffScreen({
  lang,
  rows,
  partnerBmId,
  budgetLeft,
  fullLocked,
  onBack,
}: DiffScreenProps): JSX.Element {
  const count = (op: DiffOp): number =>
    rows.filter((row) => row.op === op).length;
  const writing = rows.length - count('skip');
  const unknown = count('unknown');
  const summary: { key: MessageKey; value: string; text: string }[] = [
    {
      key: 'diff.sum.add',
      value: `+${count('add')}`,
      text: 'text-green-700 dark:text-green-300',
    },
    {
      key: 'diff.sum.change',
      value: `~${count('change')}`,
      text: 'text-yellow-800 dark:text-yellow-300',
    },
    {
      key: 'diff.sum.remove',
      value: '−0',
      text: 'text-red-700 dark:text-red-300',
    },
    {
      key: 'diff.sum.skip',
      value: `=${count('skip')}`,
      text: 'text-base-content/70',
    },
  ];
  // Tổng "chưa đọc" đếm riêng, chỉ hiện khi có (không trộn vào "thêm"/"bỏ qua").
  if (unknown > 0) {
    summary.push({
      key: 'diff.sum.unknown',
      value: `?${unknown}`,
      text: 'text-blue-700 dark:text-blue-300',
    });
  }
  const hasManage = rows.some((row) => row.adding.includes('MANAGE'));

  return (
    <>
      <div className='flex flex-col gap-1.5'>
        <button
          type='button'
          onClick={onBack}
          className='inline-flex h-9 items-center gap-0.5 self-start text-[13px] font-medium text-blue-600 dark:text-blue-400'
        >
          <Icon name='chevronLeft' />
          {translate(lang, 'diff.back')}
        </button>
        <h1 className='m-0 text-lg font-medium'>
          {translate(lang, 'diff.title')}
        </h1>
        <p className='text-base-content/70 m-0 text-[13px]'>
          {translate(lang, 'diff.sub')}
        </p>
      </div>

      <div
        className={`grid gap-1.5 ${summary.length > 4 ? 'grid-cols-5' : 'grid-cols-4'}`}
      >
        {summary.map((item) => (
          <div
            key={item.key}
            className='border-base-content/12 flex flex-col items-center rounded-md border bg-base-100 py-1.5'
          >
            <span className={`text-base font-semibold ${item.text}`}>
              {item.value}
            </span>
            <span className='text-base-content/70 text-xs'>
              {translate(lang, item.key)}
            </span>
          </div>
        ))}
      </div>

      <section
        aria-label={translate(lang, 'diff.table')}
        className='border-base-content/12 overflow-hidden rounded-md border bg-base-100'
      >
        <div className='border-base-content/8 flex items-center justify-between gap-2 border-b px-3 py-2'>
          <span className='text-base-content/70 text-xs'>
            {translate(lang, 'diff.partnerBm')}
          </span>
          <span className='text-right text-[13px] font-semibold'>
            {partnerBmId}
          </span>
        </div>
        <div className='text-base-content/70 flex justify-between bg-base-200 px-3 py-1.5 text-xs'>
          <span>{translate(lang, 'diff.colAsset')}</span>
          <span>{translate(lang, 'diff.colOp')}</span>
        </div>
        <ul className='m-0 flex list-none flex-col p-0'>
          {rows.map((row) => {
            const view = OP_VIEW[row.op];
            return (
              <li
                key={row.account.id}
                className={`border-base-content/8 flex gap-2.5 border-b px-3 py-2.5 last:border-b-0 ${
                  row.op === 'skip' ? 'bg-base-200/50' : ''
                }`}
              >
                <span
                  aria-hidden='true'
                  className={`flex size-6 shrink-0 items-center justify-center rounded text-sm font-semibold ${view.markBox}`}
                >
                  {view.mark}
                </span>
                <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
                  <div className='flex items-start justify-between gap-2'>
                    <span className='flex min-w-0 flex-col'>
                      <span className='break-words text-[13px] font-semibold'>
                        {row.account.name}
                      </span>
                      <span className='text-base-content/70 break-all text-xs'>
                        {row.account.id}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-xs font-semibold ${view.text}`}
                    >
                      {translate(lang, view.labelKey)}
                    </span>
                  </div>
                  <div className='flex flex-wrap gap-1'>
                    {row.existing.map((task) => (
                      <span
                        key={`keep-${task}`}
                        className={`${CHIP} ${CHIP_KEEP}`}
                      >
                        {taskLabel(lang, task)}
                      </span>
                    ))}
                    {row.adding.map((task) => (
                      <span
                        key={`add-${task}`}
                        className={`${CHIP} ${CHIP_ADD}`}
                      >
                        + {taskLabel(lang, task)}
                      </span>
                    ))}
                  </div>
                  {row.op === 'change' && (
                    <span className='text-base-content/70 text-xs'>
                      {translate(lang, 'diff.noteChange', {
                        have: row.existing
                          .map((task) => taskLabel(lang, task))
                          .join(', '),
                        n: row.adding.length,
                      })}
                    </span>
                  )}
                  {row.op === 'skip' && (
                    <span className='text-base-content/70 text-xs'>
                      {translate(lang, 'diff.noteSkip')}
                    </span>
                  )}
                  {row.op === 'unknown' && (
                    <span className='text-base-content/70 text-xs'>
                      {translate(lang, 'diff.noteUnknown')}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {hasManage && (
        <div
          role='alert'
          className='flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 p-3 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200'
        >
          <Icon name='alert' size={16} className='mt-px' />
          <div className='flex flex-col gap-0.5'>
            <span className='text-[13px] font-semibold'>
              {translate(lang, 'pa.perm.warnTitle')}
            </span>
            <span className='text-xs'>
              {translate(lang, 'pa.perm.warnBody')}
            </span>
          </div>
        </div>
      )}

      {writing === 0 ? (
        <p className='border-base-content/12 text-base-content/70 m-0 rounded-md border bg-base-100 p-3 text-[13px]'>
          {translate(lang, 'diff.nothing')}
        </p>
      ) : (
        <div className='border-base-content/12 text-base-content/70 flex items-start gap-2 rounded-md border bg-base-100 p-3 text-xs'>
          <Icon name='shield' size={15} className='mt-px' />
          <span>
            {translate(lang, 'diff.budget', {
              n: writing,
              left: budgetLeft,
            })}
          </span>
        </div>
      )}

      <div className='flex flex-col gap-1.5'>
        {writing > 0 && (
          <>
            <button
              type='button'
              disabled={fullLocked}
              aria-describedby='diff-full-locked'
              className='disabled:bg-base-content/15 disabled:text-base-content/50 inline-flex h-10 items-center justify-center rounded-md bg-orange-600 px-3 text-[13px] font-semibold text-white disabled:cursor-not-allowed'
            >
              {translate(lang, 'diff.continue')}
            </button>
            {fullLocked && (
              <span
                id='diff-full-locked'
                className='text-base-content/70 flex items-center gap-1 text-xs'
              >
                <Icon name='lock' size={12} />
                {translate(lang, 'diff.fullLocked')}
              </span>
            )}
          </>
        )}
        <button
          type='button'
          onClick={onBack}
          className='border-base-content/20 inline-flex h-10 items-center justify-center rounded-md border bg-base-100 px-3 text-[13px] font-semibold'
        >
          {translate(lang, 'diff.back')}
        </button>
      </div>
    </>
  );
}
