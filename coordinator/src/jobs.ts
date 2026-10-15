/**
 * jobs.ts — dựng và kiểm tra job do ops tạo (SPEC-AUTO-001 §4.1, §7). Thuần dữ liệu, không import Firebase:
 * `createdAt` do người gọi truyền vào (ServerValue.TIMESTAMP khi ghi thật) để test không cần SDK.
 *
 * Database Rules không kiểm shape của `config`, nên CLI kiểm bằng đúng parser mà engine dùng (D3):
 * config sai bị chặn ngay tại đây thay vì để máy claim rồi báo ERR_JOB_INVALID.
 */
import type { ApproveConfig } from '@/shared/approve';
import type { ChainDecl } from '@/shared/remoteJob';
import type { RunConfig } from '@/shared/runConfig';

import { uiTaskKeys } from '@/content/flows/partnerTasks';
import {
  cleanPartnerName,
  MAX_APPROVE_REQUESTS,
  parseApproveConfig,
  validatePartnerName,
} from '@/shared/approve';
import { parseRunConfig } from '@/shared/runConfig';
import { isBusinessId } from '@/shared/surfaces';

export type NewJob = {
  flow: 'partner-assign' | 'requests.scan';
  // `full` chỉ có ở partner-assign và phải kèm dấu vết người duyệt (D8); Rules cũng cưỡng chế.
  mode: 'dry' | 'full';
  businessId: string;
  config: RunConfig | { partnerName: string };
  approval?: 'human';
  approvedBy?: string;
  // Khai chuỗi D12: chỉ trên job assign `full` (dry không bao giờ dừng ở pending-approval).
  chain?: ChainDecl;
  createdAt: unknown;
  createdBy: string;
  cancelRequested: false;
  state: { status: 'pending' };
};

export const DEFAULT_SCAN_DELAYS_SEC = [120, 300, 600];
export const DEFAULT_CHAIN_TTL_SEC = 86_400;

// Khai chuỗi của `ops assign --chain-partner`: tên người yêu cầu bắt buộc (quyết định D12: ít request mơ hồ).
export function buildChain(
  partnerName: string | undefined,
  requesterName: string | undefined,
  mode: 'dry' | 'full'
): ChainDecl {
  if (mode !== 'full')
    throw new Error(
      'chuỗi chỉ có nghĩa với job assign full (dry không ghi gì)'
    );
  if (partnerName === undefined)
    throw new Error('thiếu --chain-partner "<tên BM đối tác>"');
  const partnerIssue = validatePartnerName(partnerName);
  if (partnerIssue)
    throw new Error(`--chain-partner không hợp lệ (${partnerIssue})`);
  if (requesterName === undefined)
    throw new Error('thiếu --chain-requester "<tên admin yêu cầu>"');
  const requesterIssue = validatePartnerName(requesterName);
  if (requesterIssue)
    throw new Error(`--chain-requester không hợp lệ (${requesterIssue})`);
  return {
    auto: true,
    partnerName: cleanPartnerName(partnerName),
    requesterName: cleanPartnerName(requesterName),
    mode: 'full',
    scanDelaysSec: DEFAULT_SCAN_DELAYS_SEC,
    ttlSec: DEFAULT_CHAIN_TTL_SEC,
  };
}

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
  // Engine cũng từ chối tổ hợp quyền mà nhãn UI BM không biểu diễn chính xác (vd ADVERTISE riêng lẻ).
  if (uiTaskKeys(config.tasks) === undefined)
    throw new Error(
      'tasks không biểu diễn được trên UI BM: dùng ADVERTISE+ANALYZE, ANALYZE hoặc MANAGE'
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

export function buildAssignJob(
  config: RunConfig,
  args: BuildArgs,
  mode: 'dry' | 'full' = 'dry',
  chain?: ChainDecl
): NewJob {
  return {
    flow: 'partner-assign',
    mode,
    businessId: args.businessId,
    config,
    // Job ghi thật do người duyệt: `approvedBy` = người tạo (Rules kiểm khớp `auth.uid`).
    ...(mode === 'full'
      ? { approval: 'human' as const, approvedBy: args.uid }
      : {}),
    ...(chain ? { chain } : {}),
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

// ---- Job duyệt request (D6: người đã xem danh sách quét) --------------------

export type NewApproveJob = {
  flow: 'partner-approve';
  mode: 'dry' | 'full';
  businessId: string;
  config: ApproveConfig;
  scanJobId: string;
  approvedBy: string;
  approval: 'human';
  createdAt: unknown;
  createdBy: string;
  cancelRequested: false;
  state: { status: 'pending' };
};

// "1,3-5" hoặc "all" → chỉ số 0-based tăng dần, không trùng. Ném lỗi khi rỗng/ngoài phạm vi: không bao giờ đoán.
export function parseSelection(text: string, total: number): number[] {
  const input = text.trim().toLowerCase();
  if (input === 'all') return Array.from({ length: total }, (_, i) => i);
  const picked = new Set<number>();
  input.split(',').forEach((part) => {
    const range = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!range) throw new Error(`lựa chọn không hợp lệ: "${part.trim()}"`);
    const from = Number(range[1]);
    const to = range[2] === undefined ? from : Number(range[2]);
    if (from < 1 || to < from || to > total)
      throw new Error(`ngoài phạm vi 1–${total}: "${part.trim()}"`);
    for (let n = from; n <= to; n += 1) picked.add(n - 1);
  });
  if (picked.size === 0) throw new Error('chưa chọn request nào');
  return [...picked].sort((a, b) => a - b);
}

// Chỉ cho chọn TẬP CON của kết quả quét (không có ô nhập tay); config đi qua đúng parser của engine.
export function buildApproveJob(params: {
  scan: { partnerName: string; requests: unknown };
  selection: number[];
  action: 'approve' | 'decline';
  mode: 'dry' | 'full';
  scanJobId: string;
  args: BuildArgs;
}): NewApproveJob {
  const { scan, selection, action, mode, scanJobId, args } = params;
  if (!Array.isArray(scan.requests))
    throw new Error('kết quả quét không có danh sách request');
  const chosen = selection.map((index) => (scan.requests as unknown[])[index]);
  const config = parseApproveConfig({
    partnerName: scan.partnerName,
    action,
    requests: chosen,
  });
  if (!config)
    throw new Error(
      `config duyệt không hợp lệ (cần 1–${MAX_APPROVE_REQUESTS} request, đủ requester/account)`
    );
  return {
    flow: 'partner-approve',
    mode,
    businessId: args.businessId,
    config,
    scanJobId,
    approvedBy: args.uid,
    approval: 'human',
    createdAt: args.createdAt,
    createdBy: args.uid,
    cancelRequested: false,
    state: { status: 'pending' },
  };
}
