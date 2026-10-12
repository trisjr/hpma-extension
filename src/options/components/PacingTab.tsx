import { JSX, useEffect, useState } from 'react';
import type { Lang } from '@/shared/i18n';
import type { PacingForm } from '@/shared/pacingForm';
import type { PacingConfig } from '@/shared/settings';

import { usePacingConfig } from '@/shared/hooks/useSettings';
import { translate } from '@/shared/i18n';
import { fromForm, toForm, validateForm } from '@/shared/pacingForm';
import { defaultPacing } from '@/shared/settings';

import CurfewSection from './CurfewSection';
import DelayFields from './DelayFields';
import LimitTable from './LimitTable';

type PacingTabProps = { lang: Lang };

type SaveStatus = 'idle' | 'saved' | 'failed';

const SAVED_MS = 3000;

type EditorProps = {
  lang: Lang;
  config: PacingConfig;
  save: (next: PacingConfig) => Promise<void>;
};

function PacingEditor({ lang, config, save }: EditorProps): JSX.Element {
  const [form, setForm] = useState<PacingForm>(() => toForm(config));
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [confirmReset, setConfirmReset] = useState(false);

  const errors = validateForm(form);
  const invalid = Object.keys(errors).length > 0;
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(config));

  const update = (patch: Partial<PacingForm>): void => {
    setForm((current) => ({ ...current, ...patch }));
    setStatus('idle');
    setConfirmReset(false);
  };

  useEffect(() => {
    if (status !== 'saved') return undefined;
    const timer = window.setTimeout(() => setStatus('idle'), SAVED_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  // Rời trang khi còn thay đổi chưa lưu thì trình duyệt hỏi lại.
  useEffect(() => {
    if (!dirty) return undefined;
    // Chrome < 119 chỉ hỏi lại khi có returnValue (manifest cho phép Chrome 116).
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      // eslint-disable-next-line no-param-reassign
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const onSave = (): void => {
    if (invalid || !dirty) return;
    // Sau khi lưu, đưa form về dạng chuẩn (vd. `3,5` → `3.5`) để không còn "dirty".
    const next = fromForm(form);
    save(next).then(
      () => {
        setForm(toForm(next));
        setStatus('saved');
      },
      () => setStatus('failed')
    );
  };

  // Form chỉ về mặc định (chưa lưu); có thay đổi chưa lưu thì hỏi lại ngay tại chỗ.
  const onReset = (): void => {
    if (dirty) {
      setConfirmReset(true);
      return;
    }
    setForm(toForm(defaultPacing()));
  };

  const confirmedReset = (): void => {
    setForm(toForm(defaultPacing()));
    setConfirmReset(false);
    setStatus('idle');
  };

  const hint = ((): {
    key: Parameters<typeof translate>[1];
    error: boolean;
  } => {
    if (status === 'failed') return { key: 'opt.save.fail', error: true };
    if (invalid) return { key: 'opt.save.invalid', error: true };
    if (status === 'saved') return { key: 'opt.save.done', error: false };
    if (dirty) return { key: 'opt.save.dirty', error: false };
    return { key: 'opt.save.none', error: false };
  })();

  const BTN =
    'inline-flex h-10 items-center justify-center rounded-md px-4 text-[13px] font-semibold';

  return (
    <>
      <div className='flex flex-col gap-8 pb-6'>
        <DelayFields
          lang={lang}
          form={form}
          errors={errors}
          onChange={update}
        />
        <LimitTable lang={lang} form={form} errors={errors} onChange={update} />
        <CurfewSection
          lang={lang}
          curfew={form.curfew}
          onChange={(curfew) => update({ curfew })}
        />
      </div>
      <div className='border-base-content/12 sticky bottom-0 -mx-6 flex flex-wrap items-center gap-3 border-t bg-base-100 px-6 py-3'>
        {confirmReset ? (
          <div role='alert' className='flex flex-wrap items-center gap-2'>
            <span className='text-[13px]'>
              {translate(lang, 'opt.reset.confirm')}
            </span>
            <button
              type='button'
              onClick={confirmedReset}
              className={`${BTN} bg-red-700 text-white`}
            >
              {translate(lang, 'opt.reset.yes')}
            </button>
            <button
              type='button'
              onClick={() => setConfirmReset(false)}
              className={`${BTN} border-base-content/20 border bg-base-100`}
            >
              {translate(lang, 'opt.reset.no')}
            </button>
          </div>
        ) : (
          <button
            type='button'
            onClick={onReset}
            className={`${BTN} border-base-content/20 border bg-base-100`}
          >
            {translate(lang, 'opt.reset.btn')}
          </button>
        )}
        <span
          aria-live='polite'
          className={`ml-auto text-[13px] ${
            hint.error
              ? 'text-red-700 dark:text-red-300'
              : 'text-base-content/70'
          }`}
        >
          {translate(lang, hint.key)}
        </span>
        <button
          type='button'
          disabled={invalid || !dirty}
          onClick={onSave}
          className={`${BTN} disabled:bg-base-content/15 disabled:text-base-content/50 bg-blue-600 text-white disabled:cursor-not-allowed`}
        >
          {translate(lang, 'opt.save.btn')}
        </button>
      </div>
    </>
  );
}

export default function PacingTab({ lang }: PacingTabProps): JSX.Element {
  const { ready, value, save } = usePacingConfig();
  if (!ready) {
    return (
      <p role='status' className='text-base-content/70 m-0 text-[13px]'>
        {translate(lang, 'opt.loading')}
      </p>
    );
  }
  return <PacingEditor lang={lang} config={value} save={save} />;
}
