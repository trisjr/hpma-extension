import { JSX, useState } from 'react';
import type { AdAccountsState } from '@/shared/hooks/useAdAccounts';
import type { Lang, MessageKey } from '@/shared/i18n';
import type { AdAccount } from '@/shared/partnerAssign';

import { translate } from '@/shared/i18n';
import { BATCH_SIZE } from '@/shared/partnerAssign';
import {
  MAX_QUERIES,
  MAX_QUERY_LENGTH,
  parseQueries,
} from '@/shared/runConfig';

import Icon from '../Icon';

type StepAccountsProps = {
  lang: Lang;
  source: AdAccountsState;
  // true: engine thật, nhập TKQC bằng dán tên/ID; false: danh sách mẫu của simulator.
  engineMode: boolean;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
};

type SampleAccountsProps = Omit<StepAccountsProps, 'engineMode'>;

type PasteAccountsProps = Pick<
  StepAccountsProps,
  'lang' | 'selectedIds' | 'onChange'
>;

const STATUS_VIEW: Record<
  AdAccount['status'],
  { labelKey: MessageKey; dot: string }
> = {
  active: { labelKey: 'pa.acc.active', dot: 'bg-green-500' },
  restricted: { labelKey: 'pa.acc.restricted', dot: 'bg-red-500' },
};

// So khớp không phân biệt hoa thường và dấu.
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .toLowerCase();
}

function SampleAccounts({
  lang,
  source,
  selectedIds,
  onChange,
}: SampleAccountsProps): JSX.Element {
  const [query, setQuery] = useState('');
  const needle = normalize(query.trim());
  const visible = source.accounts.filter(
    (account) =>
      needle === '' ||
      normalize(account.name).includes(needle) ||
      normalize(account.id).includes(needle)
  );
  // Chọn tất cả chỉ chạm tới TKQC chọn được và đang khớp bộ lọc.
  const pickable = visible.filter((account) => account.status === 'active');
  const allPicked =
    pickable.length > 0 &&
    pickable.every((account) => selectedIds.includes(account.id));

  const toggleOne = (id: string): void => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((item) => item !== id)
        : [...selectedIds, id]
    );
  };

  const toggleAll = (): void => {
    const ids = new Set(pickable.map((account) => account.id));
    if (allPicked) {
      onChange(selectedIds.filter((id) => !ids.has(id)));
      return;
    }
    onChange(
      [...selectedIds, ...pickable.map((a) => a.id)].filter(
        (id, index, all) => all.indexOf(id) === index
      )
    );
  };

  const renderList = (): JSX.Element => {
    if (source.status === 'loading') {
      return (
        <p
          aria-busy='true'
          className='text-base-content/70 m-0 py-3 text-center text-[13px]'
        >
          {translate(lang, 'pa.acc.loading')}
        </p>
      );
    }
    if (source.accounts.length === 0) {
      return (
        <p className='text-base-content/70 m-0 py-3 text-center text-[13px]'>
          {translate(lang, 'pa.acc.empty')}
        </p>
      );
    }
    if (visible.length === 0) {
      return (
        <p className='text-base-content/70 m-0 py-3 text-center text-[13px]'>
          {translate(lang, 'pa.acc.noMatch', { q: query.trim() })}
        </p>
      );
    }
    return (
      <div className='border-base-content/12 flex flex-col overflow-hidden rounded-md border'>
        {visible.map((account) => {
          const blocked = account.status === 'restricted';
          const view = STATUS_VIEW[account.status];
          return (
            <label
              key={account.id}
              htmlFor={`acc-${account.id}`}
              className={`border-base-content/8 flex min-h-11 items-center gap-2.5 border-b px-3 py-2 last:border-b-0 ${
                blocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              }`}
            >
              <input
                id={`acc-${account.id}`}
                type='checkbox'
                className='checkbox checkbox-sm shrink-0'
                checked={!blocked && selectedIds.includes(account.id)}
                disabled={blocked}
                onChange={() => toggleOne(account.id)}
              />
              <span className='flex min-w-0 flex-1 flex-col'>
                <span className='truncate text-[13px] font-semibold'>
                  {account.name}
                </span>
                <span className='text-base-content/70 truncate text-xs'>
                  {account.id}
                </span>
              </span>
              <span className='text-base-content/70 flex shrink-0 items-center gap-1 text-xs'>
                <span
                  aria-hidden='true'
                  className={`size-1.5 rounded-full ${view.dot}`}
                />
                {translate(lang, view.labelKey)}
              </span>
            </label>
          );
        })}
      </div>
    );
  };

  return (
    <section className='border-base-content/12 flex flex-col gap-3 rounded-md border bg-base-100 p-3'>
      <div className='flex flex-col gap-0.5'>
        <h2
          tabIndex={-1}
          data-step-heading
          className='m-0 text-sm font-semibold outline-none'
        >
          {translate(lang, 'pa.acc.title')}
        </h2>
        <p className='text-base-content/70 m-0 text-[13px]'>
          {translate(lang, 'pa.acc.desc')}
        </p>
      </div>
      {source.isSample && (
        <div
          role='note'
          className='flex items-start gap-2 rounded-md border border-amber-200 bg-yellow-50 p-2 text-xs text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'
        >
          <Icon name='alert' size={14} className='mt-px' />
          <span>{translate(lang, 'pa.acc.sample')}</span>
        </div>
      )}
      <div className='flex flex-col gap-1.5'>
        <label htmlFor='acc-search' className='sr-only'>
          {translate(lang, 'pa.acc.searchLabel')}
        </label>
        <div className='relative'>
          <Icon
            name='search'
            size={15}
            className='text-base-content/50 pointer-events-none absolute left-3 top-1/2 -translate-y-1/2'
          />
          <input
            id='acc-search'
            type='search'
            value={query}
            placeholder={translate(lang, 'pa.acc.searchPlaceholder')}
            onChange={(event) => setQuery(event.target.value)}
            className='input h-10 w-full bg-base-100 pl-9 text-sm'
          />
        </div>
      </div>
      <div className='flex items-center justify-between gap-2'>
        <span className='text-base-content/70 text-xs'>
          {translate(lang, 'pa.acc.selected', {
            n: selectedIds.length,
            total: source.total,
          })}
        </span>
        <button
          type='button'
          disabled={pickable.length === 0}
          onClick={toggleAll}
          className='h-9 text-[13px] font-medium text-blue-600 disabled:opacity-50 dark:text-blue-400'
        >
          {translate(lang, allPicked ? 'pa.acc.clearAll' : 'pa.acc.selectAll')}
        </button>
      </div>
      {selectedIds.length > BATCH_SIZE && (
        <p className='text-base-content/70 m-0 text-xs'>
          {translate(lang, 'pa.acc.batch')}
        </p>
      )}
      {renderList()}
      {source.hasMore && (
        <button type='button' className='btn btn-outline btn-sm h-9'>
          {translate(lang, 'pa.acc.more', {
            n: source.total - source.accounts.length,
          })}
        </button>
      )}
    </section>
  );
}

// Engine thật: không có danh sách TKQC để chọn, user dán tên/ID và engine khớp
// trong hộp thoại của BM khi chạy.
function PasteAccounts({
  lang,
  selectedIds,
  onChange,
}: PasteAccountsProps): JSX.Element {
  // Giữ nguyên văn bản gõ dở (kể cả dòng trống/trùng); chỉ danh sách đã làm sạch lên draft.
  const [raw, setRaw] = useState(() => selectedIds.join('\n'));
  const parsed = parseQueries(raw);
  const warnings: string[] = [];
  if (parsed.duplicates > 0) {
    warnings.push(
      translate(lang, 'pa.acc.paste.dup', { n: parsed.duplicates })
    );
  }
  if (parsed.tooLong > 0) {
    warnings.push(
      translate(lang, 'pa.acc.paste.long', {
        n: parsed.tooLong,
        max: MAX_QUERY_LENGTH,
      })
    );
  }
  if (parsed.overLimit > 0) {
    warnings.push(
      translate(lang, 'pa.acc.paste.over', {
        n: parsed.overLimit,
        max: MAX_QUERIES,
      })
    );
  }

  const handleChange = (next: string): void => {
    setRaw(next);
    onChange(parseQueries(next).queries);
  };

  return (
    <section className='border-base-content/12 flex flex-col gap-3 rounded-md border bg-base-100 p-3'>
      <div className='flex flex-col gap-0.5'>
        <h2
          tabIndex={-1}
          data-step-heading
          className='m-0 text-sm font-semibold outline-none'
        >
          {translate(lang, 'pa.acc.title')}
        </h2>
        <p className='text-base-content/70 m-0 text-[13px]'>
          {translate(lang, 'pa.acc.paste.desc')}
        </p>
      </div>
      <label htmlFor='acc-paste' className='flex flex-col gap-1.5'>
        <span className='text-[13px] font-medium'>
          {translate(lang, 'pa.acc.paste.label')}
        </span>
        <textarea
          id='acc-paste'
          value={raw}
          rows={8}
          spellCheck={false}
          placeholder={translate(lang, 'pa.acc.paste.placeholder')}
          onChange={(event) => handleChange(event.target.value)}
          className='textarea min-h-32 w-full bg-base-100 text-sm'
        />
      </label>
      <span aria-live='polite' className='text-base-content/70 text-xs'>
        {translate(lang, 'pa.acc.paste.count', { n: parsed.queries.length })}
      </span>
      {warnings.length > 0 && (
        <ul
          role='note'
          className='m-0 flex list-none flex-col gap-1 rounded-md border border-amber-200 bg-yellow-50 p-2 text-xs text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'
        >
          {warnings.map((text) => (
            <li key={text} className='flex items-start gap-2'>
              <Icon name='alert' size={14} className='mt-px shrink-0' />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      )}
      {parsed.queries.length > BATCH_SIZE && (
        <p className='text-base-content/70 m-0 text-xs'>
          {translate(lang, 'pa.acc.batch')}
        </p>
      )}
    </section>
  );
}

export default function StepAccounts({
  lang,
  source,
  engineMode,
  selectedIds,
  onChange,
}: StepAccountsProps): JSX.Element {
  if (engineMode) {
    return (
      <PasteAccounts
        lang={lang}
        selectedIds={selectedIds}
        onChange={onChange}
      />
    );
  }
  return (
    <SampleAccounts
      lang={lang}
      source={source}
      selectedIds={selectedIds}
      onChange={onChange}
    />
  );
}
