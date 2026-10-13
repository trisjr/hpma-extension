import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite/package.json'))(
  'esbuild'
);
const listeners = [];
globalThis.testBrowser = {
  runtime: {
    id: 'hpma-test',
    onMessage: { addListener: (listener) => listeners.push(listener) },
    sendMessage: async (message) =>
      listeners[0](message, {
        id: 'hpma-test',
        tab: { id: 1 },
        url: globalThis.location.href,
      }),
  },
};
const bundle = await build({
  stdin: {
    contents: `
      export * from './src/shared/adAccounts';
      export { buildDiff } from './src/shared/run';
      export { default as fetchAdAccounts } from './src/background/adAccounts';
      export { default as readAdAccounts } from './src/content/adAccounts';
      export { watchAccountScope } from './src/content/adAccounts';
      export { default as StepAccounts } from './src/sidepanel/components/partner/StepAccounts';
      export { createElement } from 'react';
      export { renderToStaticMarkup } from 'react-dom/server';
      import './src/background/index';
    `,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  plugins: [
    {
      name: 'mock-browser',
      setup(plugin) {
        plugin.onResolve({ filter: /^webextension-polyfill$/ }, () => ({
          path: 'browser',
          namespace: 'mock',
        }));
        plugin.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({
          contents: 'export default globalThis.testBrowser;',
        }));
      },
    },
  ],
});
const module = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
  require,
  module,
  module.exports
);
const api = module.exports;
const token = `EAA${'A'.repeat(80)}`;
const page = { businessId: '123456789012345', edge: 'owned_ad_accounts' };
const row = { id: 'act_42', name: 'Spa Hoa', account_status: 1 };
const reply = (data, paging) => ({ data, ...(paging ? { paging } : {}) });
const requests = [];
let payload = reply([row]);
globalThis.fetch = async (url, options) => {
  requests.push({ url: String(url), options });
  // Phản hồi thực tế của Meta khi token phiên được gửi thiếu cookie.
  if (options.credentials !== 'include') {
    return new Response(
      JSON.stringify({
        error: { message: 'Invalid request.', type: 'OAuthException', code: 1 },
      }),
      { status: 400 }
    );
  }
  return new Response(JSON.stringify(payload));
};

assert.equal(
  api.extractSessionToken(JSON.stringify({ accessToken: token })),
  token
);
assert.equal(
  api.extractSessionToken(`{\\"apiAccessToken\\":\\"${token}\\"}`),
  token
);
assert.equal(
  api.extractSessionToken(`{&quot;access_token&quot;:&quot;${token}&quot;}`),
  token
);
assert.equal(api.extractSessionToken(`<div>${token}</div>`), undefined);
assert.equal(api.extractSessionToken('{"accessToken":"EAAshort"}'), undefined);
assert.equal(api.isAccountsRead({ kind: 'accounts.read', page }), true);
assert.equal(
  api.isAccountsRead({
    kind: 'accounts.read',
    page: { ...page, edge: 'agencies' },
  }),
  false
);
assert.equal(
  api.isAccountsGraph({ kind: 'accounts.graph', token, page }),
  true
);
assert.equal(
  api.isAccountsGraph({ kind: 'accounts.graph', token: `${token}\n`, page }),
  false
);
assert.equal(
  api.isAccountsGraph({
    kind: 'accounts.graph',
    token,
    page: { ...page, businessId: '../me' },
  }),
  false
);

let result = await api.fetchAdAccounts({ kind: 'accounts.graph', token, page });
assert.deepEqual(result, {
  ok: true,
  businessId: page.businessId,
  accounts: [{ id: 'act_42', name: 'Spa Hoa', status: 'active' }],
  next: { ...page, edge: 'client_ad_accounts' },
});
assert.equal(requests[0].options.headers.Authorization, `Bearer ${token}`);
assert.equal(requests[0].options.credentials, 'include');
assert.equal(requests[0].url.includes(token), false);
assert.equal(requests[0].url.includes('access_token'), false);
assert.equal(JSON.stringify(result).includes(token), false);
assert.equal(
  api.buildDiff(
    {
      accountIds: ['act_42'],
      partnerBmId: page.businessId,
      tasks: ['ANALYZE'],
    },
    result.accounts,
    true
  )[0].account.name,
  'Spa Hoa'
);

payload = reply([{ ...row, id: '43', account_status: 2 }], {
  next: `https://evil.example/?access_token=${token}`,
  cursors: { after: 'cursor' },
});
result = await api.fetchAdAccounts({ kind: 'accounts.graph', token, page });
assert.equal(result.accounts[0].status, 'restricted');
assert.equal(result.accounts[0].id, 'act_43');
assert.equal(result.next.after, 'cursor');
await api.fetchAdAccounts({ kind: 'accounts.graph', token, page: result.next });
assert.equal(new URL(requests.at(-1).url).origin, 'https://graph.facebook.com');
assert.equal(new URL(requests.at(-1).url).searchParams.get('after'), 'cursor');
assert.equal(
  api.parseAccountsPage(payload, { ...page, after: 'cursor' }).error,
  'response'
);
assert.equal(
  api.parseAccountsPage(reply([row], { next: 'anything' }), page).error,
  'response'
);
assert.equal(
  api.parseAccountsPage(reply([{ ...row, id: '<script>' }]), page).error,
  'response'
);
assert.equal(
  api.parseAccountsPage(reply([{ ...row, account_status: undefined }]), page)
    .error,
  'response'
);
assert.equal(
  api.parseAccountsPage(reply([]), { ...page, edge: 'client_ad_accounts' })
    .next,
  undefined
);
assert.equal(
  api.isAccountsReply({
    ok: true,
    businessId: page.businessId,
    accounts: [],
    next: { ...page, businessId: '987' },
  }),
  false
);

for (const [code, error] of [
  [190, 'expired'],
  [10, 'permission'],
  [200, 'permission'],
  [4, 'rate'],
  [613, 'rate'],
]) {
  payload = { error: { code, message: token } };
  assert.deepEqual(
    await api.fetchAdAccounts({ kind: 'accounts.graph', token, page }),
    { ok: false, error }
  );
}
globalThis.fetch = async () => new Response('{}', { status: 429 });
assert.equal(
  (await api.fetchAdAccounts({ kind: 'accounts.graph', token, page })).error,
  'rate'
);
globalThis.fetch = async () => {
  throw new Error(token);
};
assert.deepEqual(
  await api.fetchAdAccounts({ kind: 'accounts.graph', token, page }),
  { ok: false, error: 'network' }
);

const listener = listeners[0];
const message = { kind: 'accounts.graph', token, page };
assert.equal(
  listener(message, {
    id: 'other',
    tab: { id: 1 },
    url: `https://business.facebook.com/?business_id=${page.businessId}`,
  }),
  undefined
);
assert.equal(
  listener(message, {
    id: 'hpma-test',
    url: 'chrome-extension://hpma-test/panel',
  }),
  undefined
);
assert.equal(
  listener(message, {
    id: 'hpma-test',
    tab: { id: 1 },
    url: `https://evil.example/?business_id=${page.businessId}`,
  }),
  undefined
);
assert.equal(
  listener(message, {
    id: 'hpma-test',
    tab: { id: 1 },
    url: 'https://business.facebook.com/?business_id=987',
  }),
  undefined
);

globalThis.location = {
  origin: 'https://business.facebook.com',
  href: `https://business.facebook.com/settings/ad_accounts?business_id=${page.businessId}`,
};
globalThis.window = { location: globalThis.location };
globalThis.document = {
  documentElement: { outerHTML: JSON.stringify({ accessToken: token }) },
};
globalThis.fetch = async () => new Response(JSON.stringify(reply([row])));
assert.equal((await api.readAdAccounts({ kind: 'accounts.read' })).ok, true);
assert.equal(
  (
    await api.readAdAccounts({
      kind: 'accounts.read',
      page: { ...page, businessId: '987' },
    })
  ).error,
  'business'
);
globalThis.document.documentElement.outerHTML = '';
globalThis.fetch = async (url) =>
  String(url).startsWith('https://business.facebook.com/')
    ? new Response(JSON.stringify({ apiAccessToken: token }))
    : new Response(JSON.stringify(reply([])));
assert.equal((await api.readAdAccounts({ kind: 'accounts.read' })).ok, true);
globalThis.fetch = async (url) =>
  String(url).startsWith('https://business.facebook.com/')
    ? new Response(
        `[["LMBootstrapper","__elem_1"],["${token}","436761779744"]]`.replace(
          /"/g,
          '\\"'
        )
      )
    : new Response(JSON.stringify(reply([])));
assert.equal((await api.readAdAccounts({ kind: 'accounts.read' })).ok, true);
globalThis.fetch = async () => new Response('<html>Sign in</html>');
assert.equal(
  (await api.readAdAccounts({ kind: 'accounts.read' })).error,
  'token'
);

globalThis.document.documentElement.outerHTML = JSON.stringify({
  accessToken: token,
});
globalThis.fetch = async () => {
  globalThis.location.href =
    'https://business.facebook.com/settings?business_id=987';
  return new Response(JSON.stringify(reply([row])));
};
assert.equal(
  (await api.readAdAccounts({ kind: 'accounts.read' })).error,
  'business'
);
let onMutation;
globalThis.MutationObserver = class {
  constructor(callback) {
    onMutation = callback;
  }
  observe() {}
};
const scopeMessages = [];
globalThis.testBrowser.runtime.sendMessage = async (value) => {
  scopeMessages.push(value);
};
api.watchAccountScope();
onMutation();
assert.equal(scopeMessages.length, 0);
globalThis.location.href =
  'https://business.facebook.com/settings?business_id=111';
onMutation();
onMutation();
assert.deepEqual(scopeMessages, [{ kind: 'accounts.changed' }]);

const render = (source, selectedIds = []) =>
  api.renderToStaticMarkup(
    api.createElement(api.StepAccounts, {
      lang: 'vi',
      source,
      selectedIds,
      engineMode: true,
      onChange: () => {},
    })
  );
const source = {
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
const html = render(source, ['act_42']);
assert.ok(html.includes('&lt;script&gt;Spa&lt;/script&gt;'));
assert.ok(html.includes('Tải thêm TKQC'));
assert.ok(html.includes('checked=""'));
assert.ok(html.includes('disabled=""'));
assert.equal(html.includes('textarea'), false);
assert.ok(
  render({ ...source, status: 'error', error: 'expired' }).includes(
    'role="alert"'
  )
);
assert.ok(
  render({ ...source, status: 'loading', accounts: [] }).includes(
    'aria-busy="true"'
  )
);
assert.ok(
  render({ ...source, accounts: [], total: 0, hasMore: false }).includes(
    'BM này chưa có TKQC'
  )
);
assert.ok(
  render({ ...source, accounts: [], total: 0 }).includes('phần đã tải')
);
console.log(
  'adAccounts: parser, pagination, credentials, broker, session extraction and UI states passed'
);
