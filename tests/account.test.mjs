/* Menu, home indicator, and /account/ checks. No Auth email is sent.
   Run: node tests/account.test.mjs
   Writes tests/account-test-output.json */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PORT = 8767;
const ORIGIN = 'http://127.0.0.1:' + PORT;
const CDP = 9241;
const KEY = 'sb-xfswvbxuhgqbdqpqiywa-auth-token-code-verifier';
const OUTPUT = new URL('./account-test-output.json', import.meta.url);
const ARTIFACTS = '/opt/cursor/artifacts';

function fakeSession() {
  const payload = Buffer.from(JSON.stringify({
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: '11111111-1111-1111-1111-111111111111',
    email: 'ada@example.com',
    role: 'authenticated'
  })).toString('base64url');
  return {
    access_token: 'hdr.' + payload + '.sig',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'refresh-test',
    user: {
      id: '11111111-1111-1111-1111-111111111111',
      aud: 'authenticated',
      email: 'ada@example.com',
      created_at: '2020-01-02T00:00:00.000Z',
      role: 'authenticated',
      user_metadata: { full_name: 'Ada Lovelace Alexandra Theodora of a Very Long Household Name' }
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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(fn, ms = 20000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < ms) {
    try { return await fn(); } catch (err) { last = err; await sleep(120); }
  }
  throw last || new Error('timeout');
}
await waitFor(() => fetch(ORIGIN + '/account/').then((response) => {
  if (!response.ok) throw new Error(String(response.status));
  return response.status;
}));
const version = await waitFor(() => fetch('http://127.0.0.1:' + CDP + '/json/version').then((response) => response.json()));
const browser = new WebSocket(version.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
const networkHits = [];
browser.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === 'Fetch.requestPaused') {
    networkHits.push((msg.params.request && msg.params.request.url) || '');
    const id = ++seq;
    browser.send(JSON.stringify({
      id,
      method: 'Fetch.failRequest',
      ...(msg.sessionId ? { sessionId: msg.sessionId } : {}),
      params: { requestId: msg.params.requestId, errorReason: 'Aborted' }
    }));
    pending.set(id, { resolve() {}, reject() {} });
    return;
  }
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
  const orig = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('supabase.co') !== -1 || url.indexOf('accounts.google.com') !== -1) {
      if (url.indexOf('/auth/v1/token') !== -1 && sessionStorage.getItem('mock-auth') === 'ok') {
        return Promise.resolve(new Response(JSON.stringify(${JSON.stringify(fakeSession())}), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      if (url.indexOf('/logout') !== -1) {
        return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      return Promise.resolve(new Response(JSON.stringify({ message: 'blocked-by-test' }), { status: 400, headers: { 'content-type': 'application/json' } }));
    }
    return orig(input, init);
  };
`;
const { browserContextId } = await send('Target.createBrowserContext', {});
async function withPage(width, height) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (method, params = {}) => send(method, params, sessionId);
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: mockSource });
  await call('Fetch.enable', { patterns: [{ urlPattern: '*supabase.co*' }, { urlPattern: '*accounts.google.com*' }] });
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
  return {
    async goto(url) {
      await call('Page.navigate', { url });
      await waitFor(async () => {
        const value = await this.eval('document.readyState');
        if (value !== 'complete') throw new Error(String(value));
        return value;
      });
      await sleep(450);
    },
    async eval(expression) {
      const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails.exception || result.exceptionDetails));
      return result.result.value;
    },
    async shot(name) {
      const { data } = await call('Page.captureScreenshot', { format: 'png' });
      writeFileSync(ARTIFACTS + '/' + name, Buffer.from(data, 'base64'));
    },
    async close() { await send('Target.closeTarget', { targetId }).catch(() => {}); }
  };
}
function assert(condition, label) {
  if (!condition) throw new Error('assertion failed: ' + label);
}
async function openHomeLogin(page) {
  await page.eval(`document.querySelector('.menu-btn').click(); document.querySelector('button[aria-label="Show categories inside Home"]').click()`);
  await sleep(150);
}
async function signIn(page) {
  await page.goto(ORIGIN + '/login/');
  await page.eval(`localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify('test-verifier')); sessionStorage.setItem('mock-auth','ok')`);
  await page.goto(ORIGIN + '/login/?code=good-code');
  await waitFor(async () => {
    const text = await page.eval(`document.getElementById('login-who').textContent`);
    if (!text.includes('ada@example.com')) throw new Error(text);
    return text;
  });
}

const report = { ok: false };
const signedOut = await withPage(1280, 900);
await signedOut.goto(ORIGIN + '/');
await waitFor(async () => {
  const text = await signedOut.eval(`document.getElementById('home-account').innerText`);
  if (text.trim() !== 'Log in') throw new Error(text);
  return text;
});
report.homeSignedOut = await signedOut.eval(`({ text: document.getElementById('home-account').innerText.trim(), href: document.getElementById('home-account').querySelector('a').getAttribute('href'), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth })`);
await signedOut.shot('account_home_signed_out_desktop.png');
await openHomeLogin(signedOut);
report.menuSignedOut = await signedOut.eval(`({ text: document.querySelector('[data-nav="login"]').textContent, href: document.querySelector('[data-nav="login"]').getAttribute('href'), logout: !!document.querySelector('.account-logout') })`);
await signedOut.shot('account_menu_signed_out_desktop.png');
await signedOut.close();

const signedOutPhone = await withPage(390, 844);
await signedOutPhone.goto(ORIGIN + '/account/');
await waitFor(async () => {
  const hidden = await signedOutPhone.eval(`document.getElementById('account-signed-out').hidden`);
  if (hidden) throw new Error('still loading');
  return true;
});
report.accountSignedOut = await signedOutPhone.eval(`({ text: document.getElementById('account-signed-out').innerText, href: document.querySelector('#account-signed-out a').getAttribute('href'), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, subaccounts: document.body.innerText.includes('Chess') })`);
await signedOutPhone.shot('account_page_signed_out_390.png');
await signedOutPhone.goto(ORIGIN + '/');
await waitFor(async () => {
  const text = await signedOutPhone.eval(`document.getElementById('home-account').innerText`);
  if (text.trim() !== 'Log in') throw new Error(text);
  return text;
});
report.homeSignedOutPhone = await signedOutPhone.eval(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
await signedOutPhone.shot('account_home_signed_out_390.png');
await signedOutPhone.close();

const signedIn = await withPage(1280, 900);
await signIn(signedIn);
await signedIn.goto(ORIGIN + '/');
await waitFor(async () => {
  const text = await signedIn.eval(`(document.querySelector('#home-account .account-name') || {}).textContent || ''`);
  if (!text.includes('Ada Lovelace')) throw new Error(text);
  return text;
});
report.homeSignedIn = await signedIn.eval(`({ name: document.querySelector('#home-account .account-name').textContent, href: document.querySelector('#home-account a').getAttribute('href'), signedPhrase: document.getElementById('home-account').innerText.includes('Signed in as'), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth })`);
await signedIn.shot('account_home_signed_in_desktop.png');
await openHomeLogin(signedIn);
await signedIn.eval(`document.querySelector('.account-menu').click()`);
report.menuSignedIn = await signedIn.eval(`({ name: document.querySelector('.account-menu .account-name').textContent, account: document.querySelector('#account-menu-panel a').textContent, accountHref: document.querySelector('#account-menu-panel a').getAttribute('href'), logout: document.querySelector('.account-logout').textContent, loginWords: document.querySelector('.account-menu').innerText.includes('Log in') })`);
await signedIn.shot('account_menu_signed_in_desktop.png');
await signedIn.goto(ORIGIN + '/account/');
await waitFor(async () => {
  const hidden = await signedIn.eval(`document.getElementById('account-signed-in').hidden`);
  if (hidden) throw new Error('account still loading');
  return true;
});
report.accountSignedIn = await signedIn.eval(`({ name: document.getElementById('account-name').textContent, email: document.getElementById('account-email').textContent, since: document.getElementById('account-since').textContent, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, listsChess: document.getElementById('main').innerText.includes('Chess') })`);
await signedIn.shot('account_page_signed_in_desktop.png');
await signedIn.close();

const signedInPhone = await withPage(390, 844);
await signIn(signedInPhone);
await signedInPhone.goto(ORIGIN + '/');
await waitFor(async () => {
  const text = await signedInPhone.eval(`(document.querySelector('#home-account .account-name') || {}).textContent || ''`);
  if (!text) throw new Error('no name');
  return text;
});
report.phone = await signedInPhone.eval(`({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, nameOverflow: document.querySelector('#home-account .account-name').scrollWidth > document.querySelector('#home-account .account-name').clientWidth })`);
await signedInPhone.shot('account_home_signed_in_390.png');
await openHomeLogin(signedInPhone);
await signedInPhone.eval(`document.querySelector('.account-menu').click()`);
report.menuPhone = await signedInPhone.eval(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
await signedInPhone.shot('account_menu_signed_in_390.png');
await signedInPhone.goto(ORIGIN + '/account/');
await waitFor(async () => {
  const text = await signedInPhone.eval(`document.getElementById('account-signed-in').hidden === false && document.getElementById('account-name').textContent`);
  if (!text) throw new Error('waiting');
  return text;
});
report.accountPhoneOverflow = await signedInPhone.eval(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
await signedInPhone.shot('account_page_signed_in_390.png');
const imageCheck = await signedInPhone.eval(`(async () => {
  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
  const file = new File([png], 'tiny.png', { type: 'image/png' });
  const text = new File(['nope'], 'note.txt', { type: 'text/plain' });
  const ok = await TWGIAccountImage.inspectProfileImage(file);
  let rejected = '';
  try { await TWGIAccountImage.inspectProfileImage(text); } catch (err) { rejected = err.message; }
  return { ok, rejected };
})()`);
await signedInPhone.eval(`document.getElementById('account-out').click()`);
await sleep(500);
await signedInPhone.goto(ORIGIN + '/');
await waitFor(async () => {
  const text = await signedInPhone.eval(`document.getElementById('home-account').innerText`);
  if (text.trim() !== 'Log in') throw new Error(text);
  return text;
});
report.afterLogout = await signedInPhone.eval(`document.getElementById('home-account').innerText.trim()`);
await signedInPhone.close();

assert(report.homeSignedOut.text === 'Log in' && report.homeSignedOut.href === '/login/' && report.homeSignedOut.overflow === 0, 'signed-out home');
assert(report.menuSignedOut.text === 'Log in' && report.menuSignedOut.href === '/login/' && report.menuSignedOut.logout === false, 'signed-out menu');
assert(report.accountSignedOut.href === '/login/' && report.accountSignedOut.text.includes('Log in to view this account') && report.accountSignedOut.overflow === 0 && report.accountSignedOut.subaccounts === false, 'signed-out account page');
assert(report.homeSignedOutPhone === 0, 'signed-out phone overflow');
assert(report.homeSignedIn.href === '/account/' && report.homeSignedIn.signedPhrase === false && report.homeSignedIn.name.startsWith('Ada Lovelace') && report.homeSignedIn.overflow === 0, 'signed-in home');
assert(report.menuSignedIn.account === 'Account' && report.menuSignedIn.accountHref === '/account/' && report.menuSignedIn.logout === 'Log out' && report.menuSignedIn.loginWords === false, 'signed-in menu');
assert(report.accountSignedIn.email === 'ada@example.com' && report.accountSignedIn.since === 'Member since January 2, 2020' && report.accountSignedIn.listsChess === false && report.accountSignedIn.overflow === 0, 'signed-in account page');
assert(report.phone.overflow === 0 && report.phone.nameOverflow === true && report.menuPhone === 0 && report.accountPhoneOverflow === 0, 'phone layout');
assert(report.afterLogout === 'Log in', 'logout restores Log in');
assert(imageCheck.ok.type === 'image/png' && /could not be read/.test(imageCheck.rejected), 'image checks');
const leaked = networkHits.filter((url) => url.includes('/auth/v1/otp') || url.includes('accounts.google.com'));
assert(leaked.length === 0, 'auth network leak ' + leaked.join(' | '));
report.ok = true;
report.networkHits = networkHits;
writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ok: report.ok, homeSignedIn: report.homeSignedIn, menuSignedIn: report.menuSignedIn, accountSignedIn: report.accountSignedIn, phone: report.phone, afterLogout: report.afterLogout }, null, 2));
chrome.kill('SIGKILL');
server.kill('SIGKILL');
process.exit(0);
