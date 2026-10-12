import { JSX, useMemo, useState } from 'react';
import type { AuditFilter } from '@/shared/audit';
import type { Lang } from '@/shared/i18n';

import {
  EMPTY_FILTER,
  filterAudit,
  isFilterActive,
  PAGE_SIZE,
  pageCount,
  paginate,
  toCsv,
  toJsonl,
} from '@/shared/audit';
import useAuditLog from '@/shared/hooks/useAuditLog';
import { useDevtestSettings } from '@/shared/hooks/useSettings';
import { translate } from '@/shared/i18n';
import Icon from '@/sidepanel/components/Icon';

import AuditFilters from './AuditFilters';
import AuditPager from './AuditPager';
import AuditTable from './AuditTable';
import downloadText from './download';

type AuditTabProps = { lang: Lang };

const pad = (value: number): string => String(value).padStart(2, '0');

function stamp(now: Date): string {
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

const EXPORT_BTN =
  'border-base-content/20 inline-flex h-10 items-center gap-1.5 rounded-md border bg-base-100 px-3 text-[13px] font-semibold disabled:opacity-40';

export default function AuditTab({ lang }: AuditTabProps): JSX.Element {
  const { ready, rows, isSample } = useAuditLog();
  const { value: devtest } = useDevtestSettings();
  const [filter, setFilter] = useState<AuditFilter>(EMPTY_FILTER);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => filterAudit(rows, filter), [rows, filter]);
  const pages = pageCount(filtered.length);
  const current = Math.min(page, pages);
  const visible = paginate(filtered, current);
  const start = (current - 1) * PAGE_SIZE;

  const onFilter = (next: AuditFilter): void => {
    setFilter(next);
    setPage(1);
  };

  // Xuất toàn bộ dòng khớp bộ lọc, không chỉ trang đang xem (SPEC-UI-004 §4.3).
  const exportAs = (kind: 'csv' | 'jsonl'): void => {
    const name = `hpma-audit-${stamp(new Date())}`;
    if (kind === 'csv') {
      downloadText(
        `${name}.csv`,
        toCsv(filtered, isSample),
        'text/csv;charset=utf-8'
      );
    } else {
      downloadText(
        `${name}.jsonl`,
        toJsonl(filtered, isSample),
        'application/x-ndjson'
      );
    }
  };

  if (!ready) {
    return (
      <p role='status' className='text-base-content/70 m-0 text-[13px]'>
        {translate(lang, 'opt.audit.loading')}
      </p>
    );
  }

  const emptyKey =
    rows.length === 0 || !isFilterActive(filter)
      ? 'opt.audit.none'
      : 'opt.audit.empty';

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='flex min-w-0 flex-[1_1_320px] flex-col gap-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <h2 className='m-0 text-lg font-medium'>
              {translate(lang, 'opt.audit.title')}
            </h2>
            {isSample && (
              <span
                role='note'
                className='text-base-content/70 inline-flex h-[22px] items-center rounded-md bg-base-200 px-2 text-xs font-medium'
              >
                {translate(lang, 'opt.audit.sample')}
              </span>
            )}
          </div>
          <p className='text-base-content/70 m-0 text-[13px]'>
            {translate(lang, 'opt.audit.sub')}
            {isSample && ` ${translate(lang, 'opt.audit.sampleNote')}`}
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <button
            type='button'
            disabled={filtered.length === 0}
            onClick={() => exportAs('csv')}
            className={EXPORT_BTN}
          >
            <Icon name='arrowUp' size={14} />
            {translate(lang, 'opt.audit.csv')}
          </button>
          <button
            type='button'
            disabled={filtered.length === 0}
            onClick={() => exportAs('jsonl')}
            className={EXPORT_BTN}
          >
            <Icon name='arrowUp' size={14} />
            {translate(lang, 'opt.audit.jsonl')}
          </button>
        </div>
      </div>

      {devtest.logDetail === 'verbose' && (
        <div
          role='note'
          className='flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 p-3 text-[13px] text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200'
        >
          <Icon name='alert' size={16} className='mt-px' />
          {translate(lang, 'opt.audit.verbose')}
        </div>
      )}

      <AuditFilters lang={lang} filter={filter} onChange={onFilter} />

      {filtered.length === 0 ? (
        <p className='border-base-content/12 text-base-content/70 m-0 rounded-md border bg-base-100 p-4 text-sm'>
          {translate(lang, emptyKey)}
        </p>
      ) : (
        <>
          <AuditTable lang={lang} rows={visible} />
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <span aria-live='polite' className='text-base-content/70 text-sm'>
              {translate(lang, 'opt.audit.count', {
                from: start + 1,
                to: start + visible.length,
                total: filtered.length,
              })}
            </span>
            <AuditPager
              lang={lang}
              page={current}
              pages={pages}
              onChange={setPage}
            />
          </div>
        </>
      )}
    </div>
  );
}
