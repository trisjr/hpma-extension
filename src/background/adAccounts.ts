import type { AccountsGraph, AccountsReply } from '@/shared/adAccounts';
import browser from 'webextension-polyfill';

import { GRAPH_ORIGIN_PATTERN, parseAccountsPage } from '@/shared/adAccounts';

export default async function fetchAdAccounts(
  message: AccountsGraph
): Promise<AccountsReply> {
  const { page } = message;
  // Lớp phòng thủ thứ hai: user có thể thu hồi quyền; khi đó báo đúng lỗi, không để CORS giả dạng 'network'.
  if (
    !(await browser.permissions.contains({ origins: [GRAPH_ORIGIN_PATTERN] }))
  )
    return { ok: false, error: 'access' };
  const url = new URL(
    `https://graph.facebook.com/v26.0/${page.businessId}/${page.edge}`
  );
  url.searchParams.set('fields', 'id,name,account_status');
  url.searchParams.set('limit', '100');
  if (page.after) url.searchParams.set('after', page.after);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${message.token}` },
      // Token phiên BM cần cookie đăng nhập đi kèm; không đọc/lưu cookie trong extension.
      credentials: 'include',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 429) return { ok: false, error: 'rate' };
    const raw: unknown = await response.json();
    const result = parseAccountsPage(raw, page);
    return !response.ok && result.ok
      ? { ok: false, error: 'response' }
      : result;
  } catch {
    return { ok: false, error: 'network' };
  }
}
