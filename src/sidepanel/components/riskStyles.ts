import type { RiskTier } from '@/shared/flows';
import type { MessageKey } from '@/shared/i18n';
import type { IconName } from './Icon';

export type RunMode = 'dry' | 'assist' | 'full';

// Màu mang nghĩa rủi ro (DES-001): xanh lá = đọc, vàng = cần bạn, cam = ghi thật.
// DaisyUI không có semantic color cho cam, và `success`/`warning` không đủ
// contrast cho chữ trên nền nhạt → dùng palette Tailwind, gom một chỗ này.
export const RISK_STYLES: Record<
  RiskTier,
  {
    dot: string;
    chip: string;
    icon: IconName;
    titleKey: MessageKey;
    tierKey: MessageKey;
  }
> = {
  read: {
    dot: 'bg-green-500',
    chip: 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300',
    icon: 'eye',
    titleKey: 'risk.read',
    tierKey: 'tier.read',
  },
  write: {
    dot: 'bg-yellow-500',
    chip: 'border-amber-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
    icon: 'check',
    titleKey: 'risk.write',
    tierKey: 'tier.write',
  },
  sensitive: {
    dot: 'bg-orange-500',
    chip: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300',
    icon: 'shield',
    titleKey: 'risk.sensitive',
    tierKey: 'tier.sensitive',
  },
};

export const MODE_STYLES: Record<
  RunMode,
  { selected: string; icon: IconName; labelKey: MessageKey }
> = {
  dry: {
    selected:
      'border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300',
    icon: 'eye',
    labelKey: 'mode.dry',
  },
  assist: {
    selected:
      'border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
    icon: 'hand',
    labelKey: 'mode.assist',
  },
  full: {
    selected:
      'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300',
    icon: 'bolt',
    labelKey: 'mode.full',
  },
};

export const RUN_MODES: readonly RunMode[] = ['dry', 'assist', 'full'];
