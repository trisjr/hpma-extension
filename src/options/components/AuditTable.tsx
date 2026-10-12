import { JSX } from 'react';
import type { AuditMode, AuditResult, AuditRow } from '@/shared/audit';
import type { Lang, MessageKey } from '@/shared/i18n';

import { translate } from '@/shared/i18n';
import Icon, { IconName } from '@/sidepanel/components/Icon';
import CopyButton from '@/sidepanel/components/run/CopyButton';

type AuditTableProps = { lang: Lang; rows: AuditRow[] };

// Chữ và màu cho Mode; màu không phải kênh duy nhất (SPEC-UI-004 §4.2).
const MODE_VIEW: Record<AuditMode, { key: MessageKey; text: string }> = {
  full: { key: 'mode.full', text: 'text-orange-700 dark:text-orange-300' },
  assist: { key: 'mode.assist', text: 'text-yellow-800 dark:text-yellow-300' },
  dry: { key: 'mode.dry', text: 'text-green-700 dark:text-green-300' },
  read: { key: 'opt.mode.read', text: 'text-base-content/70' },
};

const RESULT_VIEW: Record<
  AuditResult,
  { key: MessageKey; icon: IconName; text: string }
> = {
  done: {
    key: 'opt.result.done',
    icon: 'check',
    text: 'text-green-700 dark:text-green-300',
  },
  pending: {
    key: 'opt.result.pending',
    icon: 'clock',
    text: 'text-yellow-800 dark:text-yellow-300',
  },
  failed: {
    key: 'opt.result.failed',
    icon: 'alert',
    text: 'text-red-700 dark:text-red-300',
  },
  skip: {
    key: 'opt.result.skip',
    icon: 'close',
    text: 'text-base-content/70',
  },
  dry: { key: 'opt.result.dry', icon: 'eye', text: 'text-base-content/70' },
};

const TH = 'h-11 px-3 text-left text-[13px] font-semibold';
const TD = 'px-3 py-2 align-middle';

const pad = (value: number): string => String(value).padStart(2, '0');

function formatTime(ms: number): string {
  const date = new Date(ms);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AuditTable({
  lang,
  rows,
}: AuditTableProps): JSX.Element {
  return (
    <div className='border-base-content/12 overflow-x-auto rounded-md border bg-base-100'>
      <table
        aria-label={translate(lang, 'opt.audit.table')}
        className='w-full min-w-[860px] border-collapse text-sm'
      >
        <thead className='bg-base-200'>
          <tr>
            <th scope='col' className={TH}>
              {translate(lang, 'opt.col.time')}
            </th>
            <th scope='col' className={TH}>
              {translate(lang, 'opt.col.flow')}
            </th>
            <th scope='col' className={TH}>
              {translate(lang, 'opt.col.bm')}
            </th>
            <th scope='col' className={TH}>
              {translate(lang, 'opt.col.target')}
            </th>
            <th scope='col' className={TH}>
              {translate(lang, 'opt.col.mode')}
            </th>
            <th scope='col' className={TH}>
              {translate(lang, 'opt.col.result')}
            </th>
            <th scope='col' className={TH}>
              {translate(lang, 'opt.col.run')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const mode = MODE_VIEW[row.mode];
            const result = RESULT_VIEW[row.result];
            return (
              <tr
                key={`${row.runId}-${row.time}-${row.target}`}
                className='border-base-content/12 border-t'
              >
                <td className={`${TD} whitespace-nowrap`}>
                  <time dateTime={new Date(row.time).toISOString()}>
                    {formatTime(row.time)}
                  </time>
                </td>
                <td className={TD}>
                  {translate(lang, `opt.flow.${row.flow}` as MessageKey)}
                </td>
                <td className={TD}>{row.bm}</td>
                <td className={`${TD} break-words`}>{row.target}</td>
                <td className={`${TD} font-semibold ${mode.text}`}>
                  {translate(lang, mode.key)}
                </td>
                <td className={TD}>
                  <span
                    className={`inline-flex items-center gap-1 font-medium ${result.text}`}
                  >
                    <Icon name={result.icon} size={14} />
                    {translate(lang, result.key)}
                  </span>
                </td>
                <td className={TD}>
                  <CopyButton lang={lang} text={row.runId} label={row.runId} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
