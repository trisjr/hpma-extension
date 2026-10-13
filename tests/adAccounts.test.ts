// @vitest-environment node
// Giữ nguyên các assert của tests/adAccounts.test.mjs (đã chuyển sang Vitest). Chạy ở
// môi trường node vì test tự dựng location/document/DOMParser/MutationObserver tối giản.
import { createElement } from 'react';
import type {
  AccountPage,
  AccountsGraph,
  AccountsReply,
} from '@/shared/adAccounts';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import fetchAdAccounts from '@/background/adAccounts';
import readAdAccounts, { watchAccountScope } from '@/content/adAccounts';
import {
  extractSessionToken,
  isAccountsGraph,
  isAccountsRead,
  isAccountsReply,
  parseAccountsPage,
} from '@/shared/adAccounts';
import { buildDiff } from '@/shared/run';
import StepAccounts from '@/sidepanel/components/partner/StepAccounts';

import {
  browserMock,
  EXTENSION_ID,
  messageListeners,
} from './helpers/browserMock';

type Listener = (message: unknown, sender: unknown) => unknown;
type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;
type FetchArgs = { url: string; options: FetchInit };

const token = `EAA${'A'.repeat(80)}`;
const page: AccountPage = {
  businessId: '123456789012345',
  edge: 'owned_ad_accounts',
};
const row = { id: 'act_42', name: 'Spa Hoa', account_status: 1 };
const reply = (data: unknown[], paging?: unknown): unknown => ({
  data,
  ...(paging ? { paging } : {}),
});
const graph = (pageValue: AccountPage = page): AccountsGraph => ({
  kind: 'accounts.graph',
  token,
  page: pageValue,
});
const okReply = (
  value: AccountsReply
): Extract<AccountsReply, { ok: true }> => {
  if (!value.ok) throw new Error(`expected ok reply, got ${value.error}`);
  return value;
};

let requests: FetchArgs[];
let payload: unknown;

beforeEach(async () => {
  requests = [];
  payload = reply([row]);
  vi.stubGlobal(
    'fetch',
    async (url: string | URL, options: FetchInit): Promise<Response> => {
      requests.push({ url: String(url), options });
      // Phản hồi thực tế của Meta khi token phiên được gửi thiếu cookie.
      if (options.credentials !== 'include') {
        return new Response(
          JSON.stringify({
            error: {
              message: 'Invalid request.',
              type: 'OAuthException',
              code: 1,
            },
          }),
          { status: 400 }
        );
      }
      return new Response(JSON.stringify(payload));
    }
  );
  // Listener của background được đăng ký khi import (side effect).
  vi.resetModules();
  await import('@/background/index');
});

describe('extractSessionToken', () => {
  it('đọc token từ JSON và từ chuỗi thoát', () => {
    expect(extractSessionToken(JSON.stringify({ accessToken: token }))).toBe(
      token
    );
    expect(extractSessionToken(`{\\"apiAccessToken\\":\\"${token}\\"}`)).toBe(
      token
    );
  });

  it('không giải mã entity HTML: input là text của inline script', () => {
    expect(
      extractSessionToken(`{&quot;access_token&quot;:&quot;${token}&quot;}`)
    ).toBeUndefined();
    expect(extractSessionToken(`<div>${token}</div>`)).toBeUndefined();
  });

  it('hai token khác nhau (một cái chèn vào tên) thì không chọn cái nào', () => {
    const otherToken = `EAA${'B'.repeat(80)}`;
    expect(
      extractSessionToken(
        JSON.stringify({
          name: `{"accessToken":"${otherToken}"}`,
          accessToken: token,
        })
      )
    ).toBeUndefined();
    expect(
      extractSessionToken(
        JSON.stringify({ accessToken: token, nested: { access_token: token } })
      )
    ).toBe(token);
    expect(extractSessionToken('{"accessToken":"EAAshort"}')).toBeUndefined();
  });
});

describe('type guards', () => {
  it('isAccountsRead / isAccountsGraph', () => {
    expect(isAccountsRead({ kind: 'accounts.read', page })).toBe(true);
    expect(
      isAccountsRead({
        kind: 'accounts.read',
        page: { ...page, edge: 'agencies' },
      })
    ).toBe(false);
    expect(isAccountsGraph({ kind: 'accounts.graph', token, page })).toBe(true);
    expect(
      isAccountsGraph({ kind: 'accounts.graph', token: `${token}\n`, page })
    ).toBe(false);
    expect(
      isAccountsGraph({
        kind: 'accounts.graph',
        token,
        page: { ...page, businessId: '../me' },
      })
    ).toBe(false);
  });
});

describe('fetchAdAccounts (background broker)', () => {
  it('parser, credentials, token không lọt vào URL/kết quả, phân trang', async () => {
    let result = okReply(await fetchAdAccounts(graph()));
    expect(result).toEqual({
      ok: true,
      businessId: page.businessId,
      accounts: [{ id: 'act_42', name: 'Spa Hoa', status: 'active' }],
      next: { ...page, edge: 'client_ad_accounts' },
    });
    const headers = requests[0].options.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${token}`);
    expect(requests[0].options.credentials).toBe('include');
    expect(requests[0].url.includes(token)).toBe(false);
    expect(requests[0].url.includes('access_token')).toBe(false);
    expect(JSON.stringify(result).includes(token)).toBe(false);
    expect(
      buildDiff(
        {
          accountIds: ['act_42'],
          partnerBmId: page.businessId,
          tasks: ['ANALYZE'],
        },
        result.accounts,
        true
      )[0].account.name
    ).toBe('Spa Hoa');

    payload = reply([{ ...row, id: '43', account_status: 2 }], {
      next: `https://evil.example/?access_token=${token}`,
      cursors: { after: 'cursor' },
    });
    result = okReply(await fetchAdAccounts(graph()));
    expect(result.accounts[0].status).toBe('restricted');
    expect(result.accounts[0].id).toBe('act_43');
    expect(result.next?.after).toBe('cursor');
    await fetchAdAccounts(graph(result.next));
    const last = new URL(requests[requests.length - 1].url);
    expect(last.origin).toBe('https://graph.facebook.com');
    expect(last.searchParams.get('after')).toBe('cursor');
    expect(
      (
        parseAccountsPage(payload, { ...page, after: 'cursor' }) as {
          error: string;
        }
      ).error
    ).toBe('response');
    expect(
      (
        parseAccountsPage(reply([row], { next: 'anything' }), page) as {
          error: string;
        }
      ).error
    ).toBe('response');
    expect(
      (
        parseAccountsPage(reply([{ ...row, id: '<script>' }]), page) as {
          error: string;
        }
      ).error
    ).toBe('response');
    expect(
      (
        parseAccountsPage(
          reply([{ ...row, account_status: undefined }]),
          page
        ) as {
          error: string;
        }
      ).error
    ).toBe('response');
    expect(
      (
        parseAccountsPage(reply([]), {
          ...page,
          edge: 'client_ad_accounts',
        }) as { next?: AccountPage }
      ).next
    ).toBeUndefined();
    expect(
      isAccountsReply({
        ok: true,
        businessId: page.businessId,
        accounts: [],
        next: { ...page, businessId: '987' },
      })
    ).toBe(false);
  });

  it.each([
    [190, 'expired'],
    [10, 'permission'],
    [200, 'permission'],
    [4, 'rate'],
    [613, 'rate'],
  ])('mã lỗi Graph %i -> %s', async (code, error) => {
    payload = { error: { code, message: token } };
    expect(await fetchAdAccounts(graph())).toEqual({ ok: false, error });
  });

  it('HTTP 429 -> rate, lỗi mạng -> network (không lộ token)', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 429 }));
    expect((await fetchAdAccounts(graph())) as { error: string }).toMatchObject(
      {
        error: 'rate',
      }
    );
    vi.stubGlobal('fetch', async () => {
      throw new Error(token);
    });
    expect(await fetchAdAccounts(graph())).toEqual({
      ok: false,
      error: 'network',
    });
  });

  it('quyền Graph bị thu hồi: báo access và không gọi Graph', async () => {
    let graphCalled = false;
    browserMock.permissions.contains.mockImplementation(async () => false);
    vi.stubGlobal('fetch', async () => {
      graphCalled = true;
      return new Response(JSON.stringify(reply([row])));
    });
    expect(await fetchAdAccounts(graph())).toEqual({
      ok: false,
      error: 'access',
    });
    expect(graphCalled).toBe(false);
  });
});

describe('listener của background', () => {
  const message = { kind: 'accounts.graph', token, page };
  const call = (sender: unknown): unknown =>
    (messageListeners[0] as Listener)(message, sender);

  it('chỉ nhận từ content script BM đúng business', () => {
    expect(messageListeners).toHaveLength(1);
    expect(
      call({
        id: 'other',
        tab: { id: 1 },
        url: `https://business.facebook.com/?business_id=${page.businessId}`,
      })
    ).toBeUndefined();
    expect(
      call({ id: EXTENSION_ID, url: 'chrome-extension://hpma-test/panel' })
    ).toBeUndefined();
    expect(
      call({
        id: EXTENSION_ID,
        tab: { id: 1 },
        url: `https://evil.example/?business_id=${page.businessId}`,
      })
    ).toBeUndefined();
    expect(
      call({
        id: EXTENSION_ID,
        tab: { id: 1 },
        url: 'https://business.facebook.com/?business_id=987',
      })
    ).toBeUndefined();
  });

  it('nhận hợp lệ thì trả về kết quả Graph', async () => {
    const result = await (call({
      id: EXTENSION_ID,
      tab: { id: 1 },
      url: `https://business.facebook.com/?business_id=${page.businessId}`,
    }) as Promise<AccountsReply>);
    expect(result.ok).toBe(true);
  });
});

describe('readAdAccounts (content script)', () => {
  type FakeDoc = {
    documentElement: { outerHTML?: string };
    scripts: { src: string; textContent: string }[];
  };
  let location: { origin: string; href: string };
  let doc: FakeDoc;

  beforeEach(() => {
    location = {
      origin: 'https://business.facebook.com',
      href: `https://business.facebook.com/settings/ad_accounts?business_id=${page.businessId}`,
    };
    doc = {
      documentElement: {},
      scripts: [
        { src: '', textContent: JSON.stringify({ accessToken: token }) },
      ],
    };
    vi.stubGlobal('location', location);
    vi.stubGlobal('window', { location });
    vi.stubGlobal('document', doc);
    // Trong trình duyệt DOMParser không chạy script; stub chỉ cần trả về các <script> của chuỗi HTML.
    vi.stubGlobal(
      'DOMParser',
      // Cần `new`: không dùng được arrow function.
      // eslint-disable-next-line prefer-arrow-callback
      vi.fn(function FakeDomParser() {
        return {
          parseFromString: (text: string): FakeDoc => ({
            documentElement: {},
            scripts: [{ src: '', textContent: text }],
          }),
        };
      })
    );
    // Content script gọi background qua runtime.sendMessage: nối thẳng vào listener thật.
    browserMock.runtime.sendMessage.mockImplementation(async (message) =>
      (messageListeners[0] as Listener)(message, {
        id: EXTENSION_ID,
        tab: { id: 1 },
        url: location.href,
      })
    );
    vi.stubGlobal(
      'fetch',
      async () => new Response(JSON.stringify(reply([row])))
    );
  });

  it('đọc token từ inline script và khoá theo business_id', async () => {
    expect((await readAdAccounts({ kind: 'accounts.read' })).ok).toBe(true);
    expect(
      (
        await readAdAccounts({
          kind: 'accounts.read',
          page: { ...page, businessId: '987' },
        })
      ).ok
    ).toBe(false);
    expect(
      await readAdAccounts({
        kind: 'accounts.read',
        page: { ...page, businessId: '987' },
      })
    ).toEqual({ ok: false, error: 'business' });
  });

  it('token chỉ nằm ngoài <script> (HTML trang) thì không được dùng', async () => {
    doc.scripts = [];
    doc.documentElement.outerHTML = JSON.stringify({ accessToken: token });
    vi.stubGlobal('fetch', async () => new Response('<html>Sign in</html>'));
    expect(await readAdAccounts({ kind: 'accounts.read' })).toEqual({
      ok: false,
      error: 'token',
    });
  });

  it('lấy token từ trang tải về (JSON hoặc chuỗi thoát) khi inline script không có', async () => {
    doc.scripts = [];
    vi.stubGlobal('fetch', async (url: string | URL) =>
      String(url).startsWith('https://business.facebook.com/')
        ? new Response(JSON.stringify({ apiAccessToken: token }))
        : new Response(JSON.stringify(reply([])))
    );
    expect((await readAdAccounts({ kind: 'accounts.read' })).ok).toBe(true);
    vi.stubGlobal('fetch', async (url: string | URL) =>
      String(url).startsWith('https://business.facebook.com/')
        ? new Response(
            `[["LMBootstrapper","__elem_1"],["${token}","436761779744"]]`.replace(
              /"/g,
              '\\"'
            )
          )
        : new Response(JSON.stringify(reply([])))
    );
    expect((await readAdAccounts({ kind: 'accounts.read' })).ok).toBe(true);
    vi.stubGlobal('fetch', async () => new Response('<html>Sign in</html>'));
    expect(await readAdAccounts({ kind: 'accounts.read' })).toEqual({
      ok: false,
      error: 'token',
    });
  });

  it('đổi BM giữa chừng thì báo business', async () => {
    vi.stubGlobal('fetch', async () => {
      location.href = 'https://business.facebook.com/settings?business_id=987';
      return new Response(JSON.stringify(reply([row])));
    });
    expect(
      (await readAdAccounts({ kind: 'accounts.read' })) as { error: string }
    ).toMatchObject({ error: 'business' });
  });

  it('watchAccountScope chỉ báo khi business_id đổi', () => {
    let onMutation: () => void = () => undefined;
    vi.stubGlobal(
      'MutationObserver',
      // Cần `new`: không dùng được arrow function.
      // eslint-disable-next-line prefer-arrow-callback
      function FakeObserver(callback: () => void) {
        onMutation = callback;
        return { observe: () => undefined };
      }
    );
    const scopeMessages: unknown[] = [];
    browserMock.runtime.sendMessage.mockImplementation(async (value) => {
      scopeMessages.push(value);
    });
    watchAccountScope();
    onMutation();
    expect(scopeMessages).toHaveLength(0);
    location.href = 'https://business.facebook.com/settings?business_id=111';
    onMutation();
    onMutation();
    expect(scopeMessages).toEqual([{ kind: 'accounts.changed' }]);
  });
});

describe('StepAccounts (UI)', () => {
  type Source = Parameters<typeof StepAccounts>[0]['source'];
  const render = (source: Source, selectedIds: string[] = []): string =>
    renderToStaticMarkup(
      createElement(StepAccounts, {
        lang: 'vi',
        source,
        selectedIds,
        engineMode: true,
        onChange: () => undefined,
      })
    );
  const source: Source = {
    status: 'ready',
    accounts: [
      { id: 'act_42', name: '<script>Spa</script>', status: 'active' },
      { id: 'act_43', name: 'Disabled', status: 'restricted' },
    ],
    total: 2,
    hasMore: true,
    isSample: false,
    businessId: page.businessId,
  };

  it('escape tên, nút tải thêm, trạng thái chọn/khoá, không có textarea', () => {
    const html = render(source, ['act_42']);
    expect(html).toContain('&lt;script&gt;Spa&lt;/script&gt;');
    expect(html).toContain('Tải thêm TKQC');
    expect(html).toContain('checked=""');
    expect(html).toContain('disabled=""');
    expect(html.includes('textarea')).toBe(false);
  });

  it('các trạng thái lỗi / đang tải / rỗng', () => {
    expect(render({ ...source, status: 'error', error: 'expired' })).toContain(
      'role="alert"'
    );
    expect(render({ ...source, status: 'loading', accounts: [] })).toContain(
      'aria-busy="true"'
    );
    expect(
      render({ ...source, accounts: [], total: 0, hasMore: false })
    ).toContain('BM này chưa có TKQC');
    expect(render({ ...source, accounts: [], total: 0 })).toContain(
      'phần đã tải'
    );
  });
});
