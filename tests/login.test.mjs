/* Repeatable browser checks for /login/. No Auth email is sent.
   Run from the repo root: node tests/login.test.mjs
   Writes tests/login-test-output.json */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PORT = 8766;
const ORIGIN = 'http://127.0.0.1:' + PORT;
const CDP = 9239;
const KEY = 'sb-xfswvbxuhgqbdqpqiywa-auth-token-code-verifier';
const OUTPUT = new URL('./login-test-output.json', import.meta.url);

function fakeSession() {
  const payload = Buffer.from(JSON.stringify({
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: '11111111-1111-1111-1111-111111111111',
    email: 'person@example.com',
    role: 'authenticated'
  })).toString('base64url');
  return {
    access_token: 'hdr.' + payload + '.sig',
    token_type: 'bearer',
    expires_in: 3600,
    refresh_token: 'refresh-test',
    user: {
      id: '11111111-1111-1111-1111-111111111111',
      aud: 'authenticated',
      email: 'person@example.com',
      role: 'authenticated'
    }
  };
}

const server = spawn('python3', ['-m', 'http.server', String(PORT)], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: ['ignore', 'ignore', 'pipe']
});
const chrome = spawn('/usr/bin/google-chrome', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  '--remote-debugging-port=' + CDP, 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, ms = 20000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < ms) {
    try { return await fn(); } catch (err) { last = err; await sleep(120); }
  }
  throw last || new Error('timeout');
}

await waitFor(() => fetch(ORIGIN + '/login/').then((r) => {
  if (!r.ok) throw new Error(String(r.status));
  return r.status;
}));
const version = await waitFor(() => fetch('http://127.0.0.1:' + CDP + '/json/version').then((r) => r.json()));
const browser = new WebSocket(version.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
const paused = [];
browser.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === 'Fetch.requestPaused') { paused.push(msg.params); return; }
  if (!msg.id || !pending.has(msg.id)) return;
  const { resolve, reject } = pending.get(msg.id);
  pending.delete(msg.id);
  if (msg.error) reject(new Error(JSON.stringify(msg.error)));
  else resolve(msg.result);
});
await new Promise((resolve) => browser.addEventListener('open', resolve));
function send(method, params = {}, sessionId) {
  const id = ++seq;
  browser.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

const mockSource = `
  window.__authCalls = [];
  window.__logout = '';
  const orig = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    window.__authCalls.push(url);
    if (url.indexOf('/auth/v1/token') !== -1) {
      const mode = sessionStorage.getItem('mock-auth') || '';
      if (mode === 'ok') {
        return Promise.resolve(new Response(JSON.stringify(${JSON.stringify(fakeSession())}), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      if (mode === 'expired') {
        return Promise.resolve(new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Email link is invalid or has expired', error_code: 'otp_expired' }), { status: 400, headers: { 'content-type': 'application/json' } }));
      }
    }
    if (url.indexOf('/logout') !== -1) {
      window.__logout = url;
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    return orig(input, init);
  };
`;

const { browserContextId } = await send('Target.createBrowserContext', {});
async function withPage(fn, options = {}) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params = {}) => send(method, params, sessionId);
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: mockSource });
  const patterns = [
    { urlPattern: '*supabase.co/auth/v1/authorize*' },
    { urlPattern: '*accounts.google.com*' }
  ];
  if (options.blockLibrary) patterns.push({ urlPattern: '*vendor/supabase.js*' });
  await call('Fetch.enable', { patterns });
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const page = {
    async goto(url) {
      await call('Page.navigate', { url });
      await waitFor(async () => {
        const value = await page.eval('document.readyState');
        if (value !== 'complete') throw new Error(String(value));
        return value;
      });
      await sleep(300);
    },
    async eval(expression) {
      const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails.exception || result.exceptionDetails));
      return result.result.value;
    }
  };
  try { return await fn(page, call); }
  finally {
    await send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

function assert(condition, label) {
  if (!condition) throw new Error('assertion failed: ' + label);
}

const report = { ok: false, checks: {} };

report.checks.missingLibrary = await withPage(async (page, call) => {
  const failing = (async () => {
    const start = Date.now();
    while (Date.now() - start < 5000) {
      const item = paused.find((entry) => entry.request && entry.request.url.includes('vendor/supabase.js'));
      if (item) {
        paused.splice(paused.indexOf(item), 1);
        await call('Fetch.failRequest', { requestId: item.requestId, errorReason: 'Failed' });
        return true;
      }
      await sleep(20);
    }
    return false;
  })();
  await page.goto(ORIGIN + '/login/?code=should-not-remain');
  assert(await failing, 'supabase.js was blocked');
  await sleep(150);
  const state = await page.eval(`({
    href: location.pathname + location.search + location.hash,
    status: document.getElementById('login-status').textContent,
    statusOutside: document.getElementById('login-status').closest('form') === null,
    method: document.getElementById('login-form').method,
    named: document.getElementById('login-email').getAttribute('name'),
    disabled: document.getElementById('login-email').disabled && document.getElementById('login-submit').disabled && document.getElementById('login-google').disabled
  })`);
  await page.eval(`document.getElementById('login-email').value='person@example.com'; document.getElementById('login-form').requestSubmit();`);
  await sleep(150);
  state.after = await page.eval('location.pathname + location.search');
  assert(state.href === '/login/', 'callback code removed when the library is missing');
  assert(state.after === '/login/', 'blocked library does not put email in the URL');
  assert(state.method === 'post' && state.named === null && state.disabled, 'form cannot fall back to GET');
  assert(state.statusOutside && /auth library did not load/.test(state.status), 'missing library is reported outside the form');
  return state;
}, { blockLibrary: true });

report.checks.providerError = await withPage(async (page) => {
  await page.goto(ORIGIN + '/login/?error=access_denied&error_description=User%20denied%20access&code=leftover#access_token=secret');
  const state = await page.eval(`({ status: document.getElementById('login-status').textContent, href: location.pathname + location.search + location.hash, who: document.getElementById('login-who').textContent })`);
  assert(state.href === '/login/', 'provider error scrubs query and hash');
  assert(/User denied access/.test(state.status), 'provider error is shown');
  assert(state.who === '', 'provider error does not sign in');
  return state;
});

report.checks.missingVerifier = await withPage(async (page) => {
  await page.goto(ORIGIN + '/login/?code=missing-verifier&sb_flow_id=not-a-real-flow');
  const state = await page.eval(`({ status: document.getElementById('login-status').textContent, href: location.pathname + location.search + location.hash })`);
  assert(state.href === '/login/', 'missing verifier scrubs the code');
  assert(/same browser/.test(state.status), 'missing verifier tells the user to use the same browser');
  return state;
});

report.checks.expiredCode = await withPage(async (page) => {
  await page.goto(ORIGIN + '/login/');
  await page.eval(`localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify('test-verifier')); sessionStorage.setItem('mock-auth','expired')`);
  await page.goto(ORIGIN + '/login/?code=used-code');
  const state = await page.eval(`({ status: document.getElementById('login-status').textContent, href: location.pathname + location.search, calls: window.__authCalls, who: document.getElementById('login-who').textContent })`);
  assert(/expired or has already been used/.test(state.status), 'expired code is rejected');
  assert(state.href === '/login/', 'expired code is scrubbed');
  assert(state.calls.some((url) => url.includes('grant_type=pkce')), 'expired code is exchanged rather than ignored');
  assert(state.who === '', 'expired code does not sign in');
  return state;
});

report.checks.successAndLocalLogout = await withPage(async (page) => {
  await page.goto(ORIGIN + '/login/');
  await page.eval(`localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify('test-verifier')); sessionStorage.setItem('mock-auth','ok')`);
  await page.goto(ORIGIN + '/login/?code=good-code');
  const signed = await page.eval(`({ status: document.getElementById('login-status').textContent, href: location.pathname + location.search, who: document.getElementById('login-who').textContent, formHidden: document.getElementById('login-form').hidden, statusOutside: document.getElementById('login-status').parentElement.id === 'main' })`);
  assert(signed.who === 'Signed in as person@example.com.', 'successful code signs in');
  assert(signed.href === '/login/' && signed.formHidden && signed.statusOutside, 'successful code scrubs the URL');
  await page.eval(`document.getElementById('login-out').click()`);
  await sleep(600);
  const after = await page.eval(`({ status: document.getElementById('login-status').textContent, logout: window.__logout, formHidden: document.getElementById('login-form').hidden, who: document.getElementById('login-who').textContent })`);
  assert(after.logout.includes('/auth/v1/logout?scope=local'), 'sign-out is local: ' + after.logout);
  assert(after.status === 'Signed out.' && !after.formHidden && after.who === '', 'local sign-out clears the signed-in UI: ' + JSON.stringify(after));
  return { signed, after };
});

report.checks.unsupportedQuery = await withPage(async (page) => {
  await page.goto(ORIGIN + '/login/?access_token=secret-access&refresh_token=secret-refresh&token_type=bearer&expires_in=3600');
  const state = await page.eval(`({ status: document.getElementById('login-status').textContent, href: location.pathname + location.search + location.hash, who: document.getElementById('login-who').textContent, calls: window.__authCalls })`);
  assert(/not a supported code/.test(state.status), 'implicit query is rejected');
  assert(state.href === '/login/', 'implicit query tokens are scrubbed');
  assert(state.who === '', 'implicit query tokens are not accepted');
  assert(!state.calls.some((url) => url.includes('/token')), 'implicit query does not exchange a code');
  return state;
});

report.checks.unsupportedHash = await withPage(async (page) => {
  await page.goto(ORIGIN + '/login/#access_token=secret-access&refresh_token=secret-refresh&token_type=bearer');
  const state = await page.eval(`({ status: document.getElementById('login-status').textContent, href: location.pathname + location.search + location.hash, who: document.getElementById('login-who').textContent })`);
  assert(/not a supported code/.test(state.status), 'implicit hash is rejected');
  assert(state.href === '/login/', 'implicit hash tokens are scrubbed');
  assert(state.who === '', 'implicit hash tokens are not accepted');
  return state;
});

report.checks.unsupportedTokenHash = await withPage(async (page) => {
  await page.goto(ORIGIN + '/login/?token_hash=abc&type=email');
  const state = await page.eval(`({ status: document.getElementById('login-status').textContent, href: location.pathname + location.search + location.hash, who: document.getElementById('login-who').textContent })`);
  assert(/not a supported code/.test(state.status), 'token_hash is rejected');
  assert(state.href === '/login/', 'token_hash is scrubbed');
  assert(state.who === '', 'token_hash is not accepted');
  return state;
});

report.checks.crossTabNull = await withPage(async (page) => {
  await page.goto(ORIGIN + '/login/');
  await page.eval(`localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify('test-verifier')); sessionStorage.setItem('mock-auth','ok')`);
  await page.goto(ORIGIN + '/login/?code=good-code');
  const before = await page.eval(`document.getElementById('login-who').textContent`);
  assert(before === 'Signed in as person@example.com.', 'signed in before the other tab logs out');
  await page.eval(`new BroadcastChannel('sb-xfswvbxuhgqbdqpqiywa-auth-token').postMessage({ event: 'SIGNED_OUT', session: null })`);
  await sleep(400);
  const after = await page.eval(`({ who: document.getElementById('login-who').textContent, formHidden: document.getElementById('login-form').hidden, sessionHidden: document.getElementById('login-session').hidden })`);
  assert(after.who === '' && !after.formHidden && after.sessionHidden, 'a null auth state from another tab clears the signed-in UI');
  return { before, after };
});

report.checks.google = await withPage(async (page, call) => {
  await page.goto(ORIGIN + '/login/');
  await page.eval(`localStorage.clear(); sessionStorage.clear();`);
  await page.goto(ORIGIN + '/login/');
  const watch = (async () => {
    const start = Date.now();
    while (Date.now() - start < 5000) {
      const item = paused.find((entry) => entry.request && /authorize|accounts\.google\.com/.test(entry.request.url));
      if (item) {
        paused.splice(paused.indexOf(item), 1);
        await call('Fetch.failRequest', { requestId: item.requestId, errorReason: 'Aborted' });
        return item.request.url;
      }
      await sleep(20);
    }
    return '';
  })();
  await page.eval(`document.getElementById('login-google').click()`);
  const url = new URL(await watch);
  assert(url.pathname === '/auth/v1/authorize', 'Google starts the Auth authorize endpoint');
  assert(url.searchParams.get('provider') === 'google', 'Google provider is requested');
  assert(url.searchParams.get('redirect_to') === ORIGIN + '/login/', 'Google returns to /login/');
  assert(url.searchParams.get('code_challenge_method') === 's256' && url.searchParams.get('code_challenge'), 'Google uses PKCE');
  const stayed = await page.eval('location.pathname');
  assert(stayed === '/login/', 'the test does not continue to Google');
  return { url: url.toString(), stayed };
});

report.checks.nativeGet = await withPage(async (page) => {
  await page.goto(ORIGIN + '/login/');
  await page.eval(`localStorage.clear(); sessionStorage.clear();`);
  await page.goto(ORIGIN + '/login/');
  await page.eval(`document.getElementById('login-email').disabled=false; document.getElementById('login-email').value='person@example.com'; document.getElementById('login-form').requestSubmit();`);
  await sleep(200);
  const href = await page.eval('location.pathname + location.search');
  assert(href === '/login/', 'native submit does not leak the email');
  return href;
});

report.ok = true;
writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
chrome.kill('SIGKILL');
server.kill('SIGKILL');
process.exit(0);
