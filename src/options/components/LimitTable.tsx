/* eslint-disable jsx-a11y/control-has-associated-label -- ô <td> chứa NumberField; ô nhập bên trong đã có aria-label nêu loại BM */
import { JSX } from 'react';
import type { Lang, MessageKey } from '@/shared/i18n';
import type { FormErrors, PacingForm } from '@/shared/pacingForm';
import type { BmKind } from '@/shared/settings';

import { translate } from '@/shared/i18n';
import { BM_KINDS } from '@/shared/settings';

import fieldErrorText from './fieldError';
import NumberField from './NumberField';

type LimitTableProps = {
  lang: Lang;
  form: PacingForm;
  errors: FormErrors;
  onChange: (patch: Partial<PacingForm>) => void;
};

const KIND_KEYS: Record<BmKind, { name: MessageKey; detect: MessageKey }> = {
  new: { name: 'opt.kind.new', detect: 'opt.kind.newDetect' },
  standard: { name: 'opt.kind.standard', detect: 'opt.kind.standardDetect' },
  verified: { name: 'opt.kind.verified', detect: 'opt.kind.verifiedDetect' },
};

const TH = 'h-11 px-4 text-left text-[13px] font-semibold';

export default function LimitTable({
  lang,
  form,
  errors,
  onChange,
}: LimitTableProps): JSX.Element {
  return (
    <section className='flex flex-col gap-3'>
      <div className='flex flex-col gap-1'>
        <h2 className='m-0 text-lg font-medium'>
          {translate(lang, 'opt.limits.title')}
        </h2>
        <p className='text-base-content/70 m-0 text-[13px]'>
          {translate(lang, 'opt.limits.sub')}
        </p>
      </div>
      <div className='border-base-content/12 overflow-x-auto rounded-md border bg-base-100'>
        <table
          aria-label={translate(lang, 'opt.limits.table')}
          className='w-full min-w-[600px] border-collapse text-sm'
        >
          <thead className='bg-base-200'>
            <tr>
              <th scope='col' className={TH}>
                {translate(lang, 'opt.limits.colKind')}
              </th>
              <th scope='col' className={TH}>
                {translate(lang, 'opt.limits.colDetect')}
              </th>
              <th scope='col' className={TH}>
                {translate(lang, 'opt.limits.colWrites')}
              </th>
              <th scope='col' className={TH}>
                {translate(lang, 'opt.limits.colBatch')}
              </th>
            </tr>
          </thead>
          <tbody>
            {BM_KINDS.map((kind) => {
              const name = translate(lang, KIND_KEYS[kind].name);
              const writesError = errors[`writes:${kind}`];
              const batchError = errors[`batch:${kind}`];
              return (
                <tr key={kind} className='border-base-content/12 border-t'>
                  <th scope='row' className='h-14 px-4 text-left font-medium'>
                    {name}
                  </th>
                  <td className='text-base-content/70 px-4'>
                    {translate(lang, KIND_KEYS[kind].detect)}
                  </td>
                  <td className='px-4 py-2 align-top'>
                    <div className='w-32'>
                      <NumberField
                        id={`limit-writes-${kind}`}
                        label=''
                        ariaLabel={translate(lang, 'opt.limits.writesAria', {
                          kind: name,
                        })}
                        value={form.writes[kind]}
                        unit=''
                        invalid={writesError !== undefined}
                        integer
                        message={
                          writesError
                            ? fieldErrorText(lang, writesError, 'opt.err.range')
                            : ''
                        }
                        onChange={(value) =>
                          onChange({
                            writes: { ...form.writes, [kind]: value },
                          })
                        }
                      />
                    </div>
                  </td>
                  <td className='px-4 py-2 align-top'>
                    <div className='w-32'>
                      <NumberField
                        id={`limit-batch-${kind}`}
                        label=''
                        ariaLabel={translate(lang, 'opt.limits.batchAria', {
                          kind: name,
                        })}
                        value={form.batch[kind]}
                        unit=''
                        invalid={batchError !== undefined}
                        integer
                        message={
                          batchError
                            ? fieldErrorText(lang, batchError, 'opt.err.range')
                            : ''
                        }
                        onChange={(value) =>
                          onChange({ batch: { ...form.batch, [kind]: value } })
                        }
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className='text-base-content/70 m-0 text-xs'>
        {translate(lang, 'opt.limits.note')}
      </p>
    </section>
  );
}
