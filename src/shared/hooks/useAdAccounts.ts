import type { AdAccount } from '@/shared/partnerAssign';

export type AdAccountsState = {
  status: 'loading' | 'ready' | 'error';
  accounts: AdAccount[];
  total: number;
  hasMore: boolean;
  // true: dữ liệu mẫu, chưa lấy từ BM thật.
  isSample: boolean;
};

// TODO(FR-08): thay bằng flow đọc kiểm kê qua content script (read-only,
// phân trang lazy-load). Tới lúc đó danh sách chỉ là dữ liệu mẫu từ artboard
// FlowConfigAccounts để dựng và thử UI; UI luôn hiện nhãn "dữ liệu mẫu".
const SAMPLE_ACCOUNTS: AdAccount[] = [
  { id: 'act_238100451122', name: 'HPMA – Shop Lan 01', status: 'active' },
  { id: 'act_238100451187', name: 'HPMA – Shop Lan 02', status: 'active' },
  { id: 'act_771203348810', name: 'Tenomad – Spa Hoa', status: 'active' },
  { id: 'act_771203349902', name: 'Tenomad – Nha khoa An', status: 'active' },
  {
    id: 'act_771203350014',
    name: 'Tenomad – BĐS Phú Mỹ',
    status: 'restricted',
  },
];

const SAMPLE_STATE: AdAccountsState = {
  status: 'ready',
  accounts: SAMPLE_ACCOUNTS,
  total: SAMPLE_ACCOUNTS.length,
  hasMore: false,
  isSample: true,
};

export default function useAdAccounts(): AdAccountsState {
  return SAMPLE_STATE;
}
