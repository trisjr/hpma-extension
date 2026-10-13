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
  // true: danh sách từ API phiên BM, có nhập tay dự phòng.
  engineMode: boolean;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
};

type AccountListProps = Omit<StepAccountsProps, 'engineMode'>;

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

function AccountList({
  lang,
  source,
  selectedIds,
  onChange,
}: AccountListProps): JSX.Element {
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
    if (!selectedIds.includes(id) && selectedIds.length >= MAX_QUERIES) return;
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
      [...selectedIds, ...pickable.map((a) => a.id)]
        .filter((id, index, all) => all.indexOf(id) === index)
        .slice(0, MAX_QUERIES)
    );
  };

  const renderList = (): JSX.Element | null => {
    if (source.status === 'loading' && source.accounts.length === 0) {
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
      if (source.status === 'error') return null;
      return (
        <p className='text-base-content/70 m-0 py-3 text-center text-[13px]'>
          {translate(
            lang,
            source.hasMore ? 'pa.acc.emptyPage' : 'pa.acc.empty'
          )}
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
                disabled={
                  blocked ||
                  source.status === 'loading' ||
                  (!selectedIds.includes(account.id) &&
                    selectedIds.length >= MAX_QUERIES)
                }
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
      {!source.isSample && (
        <div className='flex items-center justify-between gap-2'>
          <span className='text-base-content/70 text-xs'>
            {source.businessId
              ? translate(lang, 'pa.acc.source', { id: source.businessId })
              : translate(lang, 'pa.acc.session')}
          </span>
          <button
            type='button'
            className='btn btn-outline btn-sm shrink-0'
            disabled={source.status === 'loading'}
            onClick={source.refresh}
          >
            {translate(lang, 'pa.acc.refresh')}
          </button>
        </div>
      )}
      {source.error && (
        <p role='alert' className='m-0 text-[13px] text-error'>
          {translate(lang, `pa.acc.error.${source.error}`)}
        </p>
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
          {translate(
            lang,
            source.isSample ? 'pa.acc.selected' : 'pa.acc.loaded',
            {
              n: selectedIds.length,
              total: source.total,
            }
          )}
        </span>
        <button
          type='button'
          disabled={pickable.length === 0 || source.status === 'loading'}
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
      {source.status !== 'loading' &&
        selectedIds.some(
          (id) => !source.accounts.some((account) => account.id === id)
        ) && (
          <button
            type='button'
            className='btn btn-outline btn-sm'
            onClick={() =>
              onChange(
                selectedIds.filter((id) =>
                  source.accounts.some((account) => account.id === id)
                )
              )
            }
          >
            {translate(lang, 'pa.acc.clearUnlisted')}
          </button>
        )}
      {selectedIds.length >= MAX_QUERIES && (
        <p role='status' className='text-base-content/70 m-0 text-xs'>
          {translate(lang, 'pa.acc.limit', { n: MAX_QUERIES })}
        </p>
      )}
      {source.hasMore && (
        <button
          type='button'
          className='btn btn-outline btn-sm h-9'
          onClick={source.loadMore}
          disabled={source.status === 'loading'}
        >
          {translate(
            lang,
            source.status === 'loading' ? 'pa.acc.loading' : 'pa.acc.loadMore'
          )}
        </button>
      )}
    </section>
  );
}

// Nhập tay vẫn dùng cùng bộ phân tích và engine so khớp ID.
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
          className='textarea min-h-32 w-full resize-none bg-base-100 text-sm'
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
  const [manual, setManual] = useState(false);
  return (
    <div className='flex flex-col gap-3'>
      {engineMode && (
        <button
          type='button'
          className='self-end text-[13px] font-medium text-primary'
          onClick={() => setManual(!manual)}
        >
          {translate(lang, manual ? 'pa.acc.useList' : 'pa.acc.useManual')}
        </button>
      )}
      {engineMode && manual ? (
        <PasteAccounts
          lang={lang}
          selectedIds={selectedIds}
          onChange={onChange}
        />
      ) : (
        <AccountList
          lang={lang}
          source={source}
          selectedIds={selectedIds}
          onChange={onChange}
        />
      )}
    </div>
  );
}
