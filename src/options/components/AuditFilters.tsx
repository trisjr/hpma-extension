import { JSX } from 'react';
import type { AuditFilter } from '@/shared/audit';
import type { Lang, MessageKey } from '@/shared/i18n';

import { AUDIT_FLOWS, AUDIT_RESULTS } from '@/shared/audit';
import { translate } from '@/shared/i18n';

type AuditFiltersProps = {
  lang: Lang;
  filter: AuditFilter;
  onChange: (next: AuditFilter) => void;
};

const FIELD =
  'border-base-content/20 h-10 w-full rounded-md border bg-base-100 px-2.5 text-[15px]';

export default function AuditFilters({
  lang,
  filter,
  onChange,
}: AuditFiltersProps): JSX.Element {
  const label = (key: MessageKey): JSX.Element => (
    <span className='text-[13px] font-medium'>{translate(lang, key)}</span>
  );

  return (
    <section
      aria-label={translate(lang, 'opt.audit.filters')}
      className='border-base-content/12 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3 rounded-md border bg-base-100 p-4'
    >
      <label htmlFor='audit-from' className='flex flex-col gap-1'>
        {label('opt.audit.from')}
        <input
          id='audit-from'
          type='date'
          value={filter.from}
          onChange={(event) =>
            onChange({ ...filter, from: event.target.value })
          }
          className={FIELD}
        />
      </label>
      <label htmlFor='audit-to' className='flex flex-col gap-1'>
        {label('opt.audit.to')}
        <input
          id='audit-to'
          type='date'
          value={filter.to}
          onChange={(event) => onChange({ ...filter, to: event.target.value })}
          className={FIELD}
        />
      </label>
      <label htmlFor='audit-flow' className='flex flex-col gap-1'>
        {label('opt.audit.flow')}
        <select
          id='audit-flow'
          value={filter.flow}
          onChange={(event) => {
            const flow = AUDIT_FLOWS.find(
              (item) => item === event.target.value
            );
            onChange({ ...filter, flow: flow ?? 'all' });
          }}
          className={FIELD}
        >
          <option value='all'>{translate(lang, 'opt.flow.all')}</option>
          {AUDIT_FLOWS.map((flow) => (
            <option key={flow} value={flow}>
              {translate(lang, `opt.flow.${flow}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor='audit-result' className='flex flex-col gap-1'>
        {label('opt.audit.result')}
        <select
          id='audit-result'
          value={filter.result}
          onChange={(event) => {
            const result = AUDIT_RESULTS.find(
              (item) => item === event.target.value
            );
            onChange({ ...filter, result: result ?? 'all' });
          }}
          className={FIELD}
        >
          <option value='all'>{translate(lang, 'opt.result.all')}</option>
          {AUDIT_RESULTS.map((result) => (
            <option key={result} value={result}>
              {translate(lang, `opt.result.${result}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor='audit-search' className='flex flex-col gap-1'>
        {label('opt.audit.search')}
        <input
          id='audit-search'
          type='search'
          value={filter.query}
          placeholder={translate(lang, 'opt.audit.searchHint')}
          onChange={(event) =>
            onChange({ ...filter, query: event.target.value })
          }
          className={FIELD}
        />
      </label>
    </section>
  );
}
