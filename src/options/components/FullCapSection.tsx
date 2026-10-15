import { JSX, useEffect, useState } from 'react';
import type { Lang, MessageKey } from '@/shared/i18n';

import { useRemoteSettings } from '@/shared/hooks/useSettings';
import { translate } from '@/shared/i18n';
import {
  FULL_JOBS_MAX,
  FULL_JOBS_MIN,
  parseFullCapInput,
} from '@/shared/settings';

import NumberField from './NumberField';

type FullCapSectionProps = { lang: Lang };

type SaveState = 'idle' | 'saved' | 'failed';

const SAVE_KEYS: Record<Exclude<SaveState, 'idle'>, MessageKey> = {
  saved: 'opt.remote.cap.saved',
  failed: 'opt.remote.cap.saveFail',
};

// Trần job full mỗi 24 giờ của máy này: để trống = không giới hạn (mặc định).
export default function FullCapSection({
  lang,
}: FullCapSectionProps): JSX.Element {
  const { ready, value, save } = useRemoteSettings();
  const [text, setText] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const t = (key: MessageKey, params?: Record<string, string>): string =>
    translate(lang, key, params);

  // Điền giá trị đã lưu một lần khi storage đọc xong.
  useEffect(() => {
    if (ready) setText(value.fullJobsPerDay?.toString() ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ nạp lần đầu, không ghi đè ô đang gõ
  }, [ready]);

  const parsed = parseFullCapInput(text);
  const dirty = parsed.ok && parsed.value !== value.fullJobsPerDay;

  const onSave = (): void => {
    if (!parsed.ok) return;
    save({ fullJobsPerDay: parsed.value })
      .then(() => setSaveState('saved'))
      .catch(() => setSaveState('failed'));
  };

  return (
    <section className='border-base-content/12 flex max-w-sm flex-col gap-3 rounded-md border bg-base-100 px-4 py-3.5'>
      <h3 className='m-0 text-[15px] font-medium'>
        {t('opt.remote.cap.title')}
      </h3>
      <NumberField
        id='remote-full-cap'
        label={t('opt.remote.cap.label')}
        ariaLabel={t('opt.remote.cap.label')}
        value={text}
        unit={t('opt.remote.cap.unit')}
        message={
          parsed.ok
            ? t('opt.remote.cap.hint')
            : t('opt.err.range', {
                min: String(FULL_JOBS_MIN),
                max: String(FULL_JOBS_MAX),
              })
        }
        invalid={!parsed.ok}
        warn={false}
        integer
        onChange={(next) => {
          setText(next);
          setSaveState('idle');
        }}
      />
      <div className='flex items-center gap-3'>
        <button
          type='button'
          className='border-base-content/20 h-10 rounded-md border bg-base-100 px-4 text-sm font-medium disabled:opacity-50'
          disabled={!ready || !dirty}
          onClick={onSave}
        >
          {t('opt.remote.cap.save')}
        </button>
        {saveState !== 'idle' && (
          <span role='status' className='text-[13px]'>
            {t(SAVE_KEYS[saveState])}
          </span>
        )}
      </div>
    </section>
  );
}
