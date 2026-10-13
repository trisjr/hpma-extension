import type { AccountsRead, AccountsReply } from '@/shared/adAccounts';
import browser from 'webextension-polyfill';

import { extractSessionToken, isAccountsReply } from '@/shared/adAccounts';

export default async function readAdAccounts(
  message: AccountsRead
): Promise<AccountsReply> {
  const businessId = new URL(window.location.href).searchParams.get(
    'business_id'
  );
  if (
    !businessId ||
    !/^\d{1,30}$/.test(businessId) ||
    (message.page && message.page.businessId !== businessId)
  )
    return { ok: false, error: 'business' };
  try {
    let token = extractSessionToken(document.documentElement.outerHTML);
    if (!token) {
      const url = new URL('/business_locations/', window.location.origin);
      url.searchParams.set('business_id', businessId);
      // Meta thường redirect trang này (vd. về login/Business Suite): theo redirect
      // nhưng chỉ chấp nhận đích cùng origin, không phải trang đăng nhập.
      const response = await fetch(url, {
        credentials: 'same-origin',
        signal: AbortSignal.timeout(15000),
      });
      const finalUrl = new URL(response.url || url);
      if (
        !response.ok ||
        finalUrl.origin !== window.location.origin ||
        finalUrl.pathname.startsWith('/business/loginpage')
      )
        return { ok: false, error: 'token' };
      token = extractSessionToken(await response.text());
    }
    if (!token) return { ok: false, error: 'token' };
    if (
      new URL(window.location.href).searchParams.get('business_id') !==
      businessId
    )
      return { ok: false, error: 'business' };
    const reply: unknown = await browser.runtime.sendMessage({
      kind: 'accounts.graph',
      token,
      page: message.page ?? { businessId, edge: 'owned_ad_accounts' },
    });
    if (
      new URL(window.location.href).searchParams.get('business_id') !==
      businessId
    )
      return { ok: false, error: 'business' };
    return isAccountsReply(reply) ? reply : { ok: false, error: 'response' };
  } catch {
    return { ok: false, error: 'network' };
  }
}

// SPA đổi BM không nhất thiết phát tabs.onUpdated có URL cho extension.
export function watchAccountScope(): void {
  let businessId = new URL(window.location.href).searchParams.get(
    'business_id'
  );
  const observer = new MutationObserver(() => {
    const current = new URL(window.location.href).searchParams.get(
      'business_id'
    );
    if (current === businessId) return;
    businessId = current;
    browser.runtime
      .sendMessage({ kind: 'accounts.changed' })
      .catch(() => undefined);
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
