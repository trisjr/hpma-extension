import { JSX, useState } from 'react';
import type { Lang, MessageKey } from '@/shared/i18n';

import { translate } from '@/shared/i18n';

type RateLimitSectionProps = {
  lang: Lang;
  busy: boolean;
  onUnlock: () => Promise<boolean>;
};

type Phase = 'idle' | 'confirm' | 'done' | 'failed';

const BUTTON =
  'border-base-content/20 h-10 rounded-md border bg-base-100 px-4 text-sm font-medium disabled:opacity-50';

// Gỡ khoá rate-limit do engine/dispatcher tự đặt. Hai bước (bấm → xác nhận) vì khoá này bảo vệ BM khỏi bị
// Meta siết thêm: chỉ gỡ sau khi đã tự kiểm tra BM trên tab thật.
export default function RateLimitSection({
  lang,
  busy,
  onUnlock,
}: RateLimitSectionProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle');
  const t = (key: MessageKey): string => translate(lang, key);

  const confirm = (): void => {
    onUnlock()
      .then((ok) => setPhase(ok ? 'done' : 'failed'))
      .catch(() => setPhase('failed'));
  };

  return (
    <section className='border-base-content/12 flex max-w-sm flex-col gap-3 rounded-md border bg-base-100 px-4 py-3.5'>
      <h3 className='m-0 text-[15px] font-medium'>
        {t('opt.remote.unlock.title')}
      </h3>
      <p className='text-base-content/70 m-0 text-[13px]'>
        {t('opt.remote.unlock.sub')}
      </p>
      <div className='flex flex-wrap items-center gap-3'>
        {phase === 'confirm' ? (
          <>
            <button
              type='button'
              className={BUTTON}
              disabled={busy}
              onClick={confirm}
            >
              {t('opt.remote.unlock.confirm')}
            </button>
            <button
              type='button'
              className={BUTTON}
              onClick={() => setPhase('idle')}
            >
              {t('opt.remote.unlock.cancel')}
            </button>
          </>
        ) : (
          <button
            type='button'
            className={BUTTON}
            disabled={busy}
            onClick={() => setPhase('confirm')}
          >
            {t('opt.remote.unlock.button')}
          </button>
        )}
        {phase === 'done' && (
          <span role='status' className='text-[13px]'>
            {t('opt.remote.unlock.done')}
          </span>
        )}
        {phase === 'failed' && (
          <span role='alert' className='text-[13px] text-red-700'>
            {t('opt.remote.unlock.failed')}
          </span>
        )}
      </div>
    </section>
  );
}
