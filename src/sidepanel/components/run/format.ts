import type { Lang } from '@/shared/i18n';
import type { PartnerTask } from '@/shared/partnerAssign';

import { translate } from '@/shared/i18n';
import { PARTNER_TASKS } from '@/shared/partnerAssign';

const pad = (value: number): string => String(value).padStart(2, '0');

export function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

export function taskLabel(lang: Lang, task: PartnerTask): string {
  const item = PARTNER_TASKS.find((candidate) => candidate.task === task);
  return item ? translate(lang, item.labelKey) : task;
}

export function taskLabels(lang: Lang, tasks: PartnerTask[]): string {
  return tasks.map((task) => taskLabel(lang, task)).join(', ');
}
