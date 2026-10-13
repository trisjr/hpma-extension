import type { AdAccount } from './partnerAssign';

export type AccountEdge = 'owned_ad_accounts' | 'client_ad_accounts';
export type AccountPage = {
  businessId: string;
  edge: AccountEdge;
  after?: string;
};
export type AccountsError =
  | 'business'
  | 'token'
  | 'permission'
  | 'expired'
  | 'rate'
  | 'network'
  | 'response';
export type AccountsReply =
  | { ok: true; businessId: string; accounts: AdAccount[]; next?: AccountPage }
  | { ok: false; error: AccountsError };
export type AccountsRead = { kind: 'accounts.read'; page?: AccountPage };
export type AccountsGraph = {
  kind: 'accounts.graph';
  token: string;
  page: AccountPage;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isAccountPage(value: unknown): value is AccountPage {
  return (
    isRecord(value) &&
    typeof value.businessId === 'string' &&
    /^\d{1,30}$/.test(value.businessId) &&
    (value.edge === 'owned_ad_accounts' ||
      value.edge === 'client_ad_accounts') &&
    (value.after === undefined ||
      (typeof value.after === 'string' && value.after.length <= 4096))
  );
}

export function isAccountsRead(value: unknown): value is AccountsRead {
  return (
    isRecord(value) &&
    value.kind === 'accounts.read' &&
    (value.page === undefined || isAccountPage(value.page))
  );
}

export function isAccountsGraph(value: unknown): value is AccountsGraph {
  return (
    isRecord(value) &&
    value.kind === 'accounts.graph' &&
    typeof value.token === 'string' &&
    /^EAA[A-Za-z0-9_-]{20,4096}$/.test(value.token) &&
    isAccountPage(value.page)
  );
}

export function isAccountsReply(value: unknown): value is AccountsReply {
  if (!isRecord(value)) return false;
  if (value.ok === false)
    return [
      'business',
      'token',
      'permission',
      'expired',
      'rate',
      'network',
      'response',
    ].includes(String(value.error));
  return (
    value.ok === true &&
    typeof value.businessId === 'string' &&
    /^\d{1,30}$/.test(value.businessId) &&
    Array.isArray(value.accounts) &&
    value.accounts.length <= 100 &&
    value.accounts.every(
      (account: unknown) =>
        isRecord(account) &&
        typeof account.id === 'string' &&
        /^act_\d+$/.test(account.id) &&
        typeof account.name === 'string' &&
        (account.status === 'active' || account.status === 'restricted')
    ) &&
    (value.next === undefined ||
      (isAccountPage(value.next) && value.next.businessId === value.businessId))
  );
}

// shortcut: chỉ đọc token trong bootstrap HTML; nếu Meta đổi bootstrap, cập nhật extractor.
export function extractSessionToken(html: string): string | undefined {
  const decoded = html.replace(/&quot;|&#34;/g, '"').replace(/\\"/g, '"');
  return (
    decoded.match(
      /"(?:accessToken|access_token|apiAccessToken)"\s*:\s*"(EAA[A-Za-z0-9_-]{20,4096})"/
    )?.[1] ??
    // /business_locations/ đưa token vào lời gọi init: [...,"LMBootstrapper",...],["EAA..."
    decoded.match(
      /"LMBootstrapper"[^\]]*\]\s*,\s*\[\s*"(EAA[A-Za-z0-9_-]{20,4096})"/
    )?.[1]
  );
}

export function parseAccountsPage(
  raw: unknown,
  page: AccountPage
): AccountsReply {
  if (!isRecord(raw)) return { ok: false, error: 'response' };
  if (isRecord(raw.error)) {
    const { code } = raw.error;
    let error: AccountsError = 'response';
    if (code === 190) error = 'expired';
    else if ([10, 200].includes(Number(code))) error = 'permission';
    else if ([4, 17, 32, 613, 80000, 80004].includes(Number(code)))
      error = 'rate';
    return { ok: false, error };
  }
  if (!Array.isArray(raw.data) || raw.data.length > 100)
    return { ok: false, error: 'response' };
  const accounts: AdAccount[] = [];
  for (let i = 0; i < raw.data.length; i += 1) {
    const row: unknown = raw.data[i];
    if (
      !isRecord(row) ||
      typeof row.id !== 'string' ||
      !/^(?:act_)?\d+$/.test(row.id) ||
      typeof row.name !== 'string' ||
      typeof row.account_status !== 'number'
    )
      return { ok: false, error: 'response' };
    accounts.push({
      id: row.id.startsWith('act_') ? row.id : `act_${row.id}`,
      name: row.name,
      status: row.account_status === 1 ? 'active' : 'restricted',
    });
  }
  const paging = isRecord(raw.paging) ? raw.paging : undefined;
  const cursors = isRecord(paging?.cursors) ? paging.cursors : undefined;
  let next: AccountPage | undefined;
  // Không theo paging.next: URL đó có thể chứa token; chỉ dựng lại URL từ cursor.
  if (paging?.next !== undefined) {
    if (
      typeof cursors?.after !== 'string' ||
      !cursors.after ||
      cursors.after === page.after ||
      cursors.after.length > 4096
    )
      return { ok: false, error: 'response' };
    next = { ...page, after: cursors.after };
  } else if (page.edge === 'owned_ad_accounts') {
    next = { businessId: page.businessId, edge: 'client_ad_accounts' };
  }
  return { ok: true, businessId: page.businessId, accounts, next };
}
