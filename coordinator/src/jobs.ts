/**
 * jobs.ts — dựng và kiểm tra job do ops tạo (SPEC-AUTO-001 §4.1, §7). Thuần dữ liệu, không import Firebase:
 * `createdAt` do người gọi truyền vào (ServerValue.TIMESTAMP khi ghi thật) để test không cần SDK.
 *
 * Database Rules không kiểm shape của `config`, nên CLI kiểm bằng đúng parser mà engine dùng (D3):
 * config sai bị chặn ngay tại đây thay vì để máy claim rồi báo ERR_JOB_INVALID.
 */
import type { RunConfig } from '@/shared/runConfig';

import { validatePartnerName } from '@/shared/approve';
import { parseRunConfig } from '@/shared/runConfig';
import { isBusinessId } from '@/shared/surfaces';

export type NewJob = {
  flow: 'partner-assign' | 'requests.scan';
  // Pha 1–2: chỉ 'dry' (D8); Rules cũng từ chối mode khác.
  mode: 'dry';
  businessId: string;
  config: RunConfig | { partnerName: string };
  createdAt: unknown;
  createdBy: string;
  cancelRequested: false;
  state: { status: 'pending' };
};

export function requireBusinessId(value: string | undefined): string {
  if (!isBusinessId(value))
    throw new Error('businessId phải là số (1–30 chữ số)');
  return value;
}

// File job.json của `ops assign` chứa đúng shape RunConfig: { partnerBmId, queries, tasks }.
export function parseAssignConfig(raw: unknown): RunConfig {
  const config = parseRunConfig(raw);
  if (!config)
    throw new Error(
      'config assign sai: cần { partnerBmId (15–17 số), queries (≤200 mục), tasks (ADVERTISE | ANALYZE | MANAGE) }'
    );
  return config;
}

export function parseScanPartner(name: string | undefined): string {
  if (name === undefined) throw new Error('thiếu --partner "<tên BM đối tác>"');
  const issue = validatePartnerName(name);
  if (issue) throw new Error(`tên BM đối tác không hợp lệ (${issue})`);
  return name.trim();
}

type BuildArgs = {
  businessId: string;
  uid: string;
  createdAt: unknown;
};

export function buildAssignJob(config: RunConfig, args: BuildArgs): NewJob {
  return {
    flow: 'partner-assign',
    mode: 'dry',
    businessId: args.businessId,
    config,
    createdAt: args.createdAt,
    createdBy: args.uid,
    cancelRequested: false,
    state: { status: 'pending' },
  };
}

export function buildScanJob(partnerName: string, args: BuildArgs): NewJob {
  return {
    flow: 'requests.scan',
    mode: 'dry',
    businessId: args.businessId,
    config: { partnerName },
    createdAt: args.createdAt,
    createdBy: args.uid,
    cancelRequested: false,
    state: { status: 'pending' },
  };
}
