import { JSX } from 'react';
import type { Lang } from '@/shared/i18n';
import type { Preview } from '@/shared/pacingForm';

import { translate } from '@/shared/i18n';

type PacingPreviewProps = { lang: Lang; preview: Preview | undefined };

// Dãy bước minh hoạ: R = đọc, W = ghi. Chiều rộng ∝ khoảng cách trung bình.
const SEQUENCE = ['R', 'R', 'R', 'W', 'R', 'W'] as const;
const WIDTH = 480;
const GAP = 4;

function format(lang: Lang, value: number): string {
  return value.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', {
    maximumFractionDigits: 1,
  });
}

// Phần chữ là nguồn sự thật; SVG chỉ minh hoạ nên `aria-hidden`.
export default function PacingPreview({
  lang,
  preview,
}: PacingPreviewProps): JSX.Element {
  if (!preview) {
    return (
      <p className='text-base-content/70 m-0 text-[13px]'>
        {translate(lang, 'opt.preview.blocked')}
      </p>
    );
  }
  const gaps = SEQUENCE.map((kind) =>
    kind === 'R'
      ? (preview.readLo + preview.readHi) / 2
      : (preview.writeLo + preview.writeHi) / 2
  );
  const scale =
    (WIDTH - GAP * (SEQUENCE.length - 1)) / gaps.reduce((a, b) => a + b, 0);
  const bars = SEQUENCE.map((kind, index) => ({
    kind,
    index,
    x: gaps.slice(0, index).reduce((a, b) => a + b * scale + GAP, 0),
    width: gaps[index] * scale,
  }));

  return (
    <div className='flex flex-col gap-2'>
      <span className='text-sm font-medium'>
        {translate(lang, 'opt.preview.title')}
      </span>
      <svg
        viewBox={`0 0 ${WIDTH} 18`}
        className='h-[18px] w-full max-w-[480px]'
        aria-hidden='true'
      >
        {bars.map((bar) => (
          <rect
            key={bar.index}
            x={bar.x}
            y={0}
            width={bar.width}
            height={18}
            rx={3}
            className={bar.kind === 'R' ? 'fill-blue-500' : 'fill-orange-500'}
          />
        ))}
      </svg>
      <p className='text-base-content/70 m-0 text-[13px]'>
        {translate(lang, 'opt.preview.read', {
          lo: format(lang, preview.readLo),
          hi: format(lang, preview.readHi),
        })}{' '}
        {translate(lang, 'opt.preview.write', {
          lo: format(lang, preview.writeLo),
          hi: format(lang, preview.writeHi),
        })}
      </p>
    </div>
  );
}
