/**
 * partnerAssign.ts — mô hình cấu hình + validate cho flow "Gán partner vào TKQC"
 * (SPEC-UI-002). Thuần dữ liệu, không phụ thuộc React.
 */
import type { MessageKey } from '@/shared/i18n';

export type WizardStep = 1 | 2 | 3 | 4;

export const WIZARD_STEPS: readonly WizardStep[] = [1, 2, 3, 4];

// Chỉ 3 task có nhãn UI trong BM; DRAFT/AA_ANALYZE không chủ động gán
// (docs/050-Research/14 §2.1).
export type PartnerTask = 'ADVERTISE' | 'ANALYZE' | 'MANAGE';

export const PARTNER_TASKS: readonly {
  task: PartnerTask;
  labelKey: MessageKey;
  descKey: MessageKey;
  high: boolean;
}[] = [
  {
    task: 'ADVERTISE',
    labelKey: 'pa.perm.ADVERTISE',
    descKey: 'pa.perm.ADVERTISE.desc',
    high: false,
  },
  {
    task: 'ANALYZE',
    labelKey: 'pa.perm.ANALYZE',
    descKey: 'pa.perm.ANALYZE.desc',
    high: false,
  },
  {
    task: 'MANAGE',
    labelKey: 'pa.perm.MANAGE',
    descKey: 'pa.perm.MANAGE.desc',
    high: true,
  },
];

export type AdAccountStatus = 'active' | 'restricted';

export type AdAccount = { id: string; name: string; status: AdAccountStatus };

export type PartnerAssignConfig = {
  partnerBmId: string;
  accountIds: string[];
  tasks: PartnerTask[];
};

// Quyền tối thiểu theo FR-04: ADVERTISE + ANALYZE, MANAGE không tick sẵn.
export const DEFAULT_CONFIG: PartnerAssignConfig = {
  partnerBmId: '',
  accountIds: [],
  tasks: ['ADVERTISE', 'ANALYZE'],
};

// Lô lớn hơn ngưỡng này xác nhận theo từng mẻ (FR-05).
export const BATCH_SIZE = 10;

// Bỏ ký tự vô hình (zero-width, NBSP, ...) và khoảng trắng khi dán.
export function sanitizeBmId(raw: string): string {
  return raw.replace(/[\p{Cf}\p{Zs}]/gu, '').trim();
}

export type BmIdIssue = 'empty' | 'digits' | 'length';

export function validateBmId(bmId: string): BmIdIssue | undefined {
  if (bmId.length === 0) return 'empty';
  if (!/^\d+$/.test(bmId)) return 'digits';
  if (bmId.length < 15 || bmId.length > 17) return 'length';
  return undefined;
}

export function isStepValid(
  step: WizardStep,
  config: PartnerAssignConfig
): boolean {
  if (step === 1) return validateBmId(config.partnerBmId) === undefined;
  if (step === 2) return config.accountIds.length > 0;
  if (step === 3) return config.tasks.length > 0;
  return true;
}

export function firstInvalidStep(config: PartnerAssignConfig): WizardStep {
  return (
    WIZARD_STEPS.find((step) => !isStepValid(step, config)) ??
    WIZARD_STEPS[WIZARD_STEPS.length - 1]
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

export type PartnerAssignDraft = {
  config: PartnerAssignConfig;
  step: WizardStep;
};

// Bản nháp đọc từ storage không đáng tin: kiểm từng trường, hỏng thì bỏ.
export function parseDraft(value: unknown): PartnerAssignDraft | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { config, step } = value as Record<string, unknown>;
  if (typeof config !== 'object' || config === null) return undefined;
  const { partnerBmId, accountIds, tasks } = config as Record<string, unknown>;
  if (typeof partnerBmId !== 'string') return undefined;
  if (!isStringArray(accountIds) || !isStringArray(tasks)) return undefined;
  const parsed: PartnerAssignConfig = {
    partnerBmId: sanitizeBmId(partnerBmId),
    accountIds,
    // Chỉ giữ task hợp lệ, theo thứ tự cố định.
    tasks: PARTNER_TASKS.map((item) => item.task).filter((task) =>
      tasks.includes(task)
    ),
  };
  const stored = WIZARD_STEPS.find((candidate) => candidate === step) ?? 1;
  // Không nhảy qua bước đầu tiên còn thiếu dữ liệu.
  return {
    config: parsed,
    step: Math.min(stored, firstInvalidStep(parsed)) as WizardStep,
  };
}
