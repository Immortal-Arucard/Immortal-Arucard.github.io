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
const chromeExpr = `(() => {
  const chip = document.getElementById('home-account');
  const login = document.getElementById('home-login');
  const header = document.querySelector('.site-header');
  const main = document.getElementById('main');
  const crumbs = document.querySelector('.crumbs');
  const name = chip && chip.querySelector('.account-name');
  const chipBox = chip ? chip.getBoundingClientRect() : null;
  const headerBox = header ? header.getBoundingClientRect() : null;
  const mainBox = main ? main.getBoundingClientRect() : null;
  const crumbBox = crumbs ? crumbs.getBoundingClientRect() : null;
  return {
    login: login ? login.innerText.trim() : '',
    loginHref: login && login.querySelector('a') ? login.querySelector('a').getAttribute('href') : '',
    inHeader: !!(login && login.closest('header')),
    chipHidden: !chip || chip.hidden,
    name: name ? name.textContent : '',
    href: chip && chip.querySelector('a') ? chip.querySelector('a').getAttribute('href') : '',
    belowHeader: !!(chip && header && header.nextElementSibling === chip && !header.contains(chip)),
    aboveContent: !!(chip && headerBox && mainBox && chipBox.top >= headerBox.bottom - 1 && chipBox.bottom <= mainBox.top + 1 && (!crumbBox || chipBox.bottom <= crumbBox.top + 1)),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    nameOverflow: !!(name && name.scrollWidth > name.clientWidth)
  };
})()`;
async function waitMasterLogin(page) {
  await waitFor(async () => {
    const text = await page.eval(`(document.getElementById('home-login') || {}).innerText || ''`);
    if (text.trim() !== 'Log in') throw new Error(text || 'waiting for Log in');
    return text;
  });
}
async function waitMasterName(page) {
  await waitFor(async () => {
    const text = await page.eval(`(document.querySelector('#home-account .account-name') || {}).textContent || ''`);
    if (!text.includes('Ada Lovelace')) throw new Error(text || 'waiting for name');
    return text;
  });
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
  const text = await signedOut.eval(`document.getElementById('home-login').innerText`);
  if (text.trim() !== 'Log in') throw new Error(text);
  return text;
});
report.homeSignedOut = await signedOut.eval(`({ text: document.getElementById('home-login').innerText.trim(), href: document.getElementById('home-login').querySelector('a').getAttribute('href'), inHeader: !!document.getElementById('home-login').closest('header'), chipHidden: document.getElementById('home-account').hidden, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth })`);
await signedOut.shot('account_home_signed_out_desktop.png');
await openHomeLogin(signedOut);
report.menuSignedOut = await signedOut.eval(`({ text: document.querySelector('[data-nav="login"]').textContent, href: document.querySelector('[data-nav="login"]').getAttribute('href'), logout: !!document.querySelector('.account-logout') })`);
await signedOut.shot('account_menu_signed_out_desktop.png');
await signedOut.goto(ORIGIN + '/philosophy/');
await waitMasterLogin(signedOut);
report.philosophySignedOut = await signedOut.eval(chromeExpr);
await signedOut.goto(ORIGIN + '/science/military-rd/');
await waitMasterLogin(signedOut);
report.deepSignedOut = await signedOut.eval(chromeExpr);
await signedOut.shot('account_division_signed_out_desktop.png');
await signedOut.goto(ORIGIN + '/login/');
await waitFor(async () => {
  const ready = await signedOut.eval(`!!document.querySelector('[data-account-slot]') && !document.getElementById('home-login') && !document.getElementById('home-account')`);
  if (!ready) throw new Error('login chrome still present');
  return true;
});
report.loginChrome = await signedOut.eval(`({ login: !!document.getElementById('home-login'), chip: !!document.getElementById('home-account') })`);
await signedOut.goto(ORIGIN + '/recreation/');
await waitMasterLogin(signedOut);
await signedOut.eval(`window.__localChecks = 0; TWGIAccountSections.register({ sectionId: 'signed-out-probe', label: 'Probe', pathPrefixes: ['/recreation/'], signInUrl: '/recreation/', hasLocalAccount: function () { window.__localChecks += 1; return true; }, localProfile: function () { return { name: 'Should Not Show', url: '/recreation/' }; } });`);
await sleep(300);
report.signedOutSkipsLocal = await signedOut.eval(`({ checks: window.__localChecks, login: document.getElementById('home-login').innerText.trim(), chipHidden: document.getElementById('home-account').hidden })`);
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
  const text = await signedOutPhone.eval(`document.getElementById('home-login').innerText`);
  if (text.trim() !== 'Log in') throw new Error(text);
  return text;
});
report.homeSignedOutPhone = await signedOutPhone.eval(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
await signedOutPhone.shot('account_home_signed_out_390.png');
await signedOutPhone.goto(ORIGIN + '/science/military-rd/');
await waitMasterLogin(signedOutPhone);
report.deepSignedOutPhone = await signedOutPhone.eval(chromeExpr);
await signedOutPhone.shot('account_division_signed_out_390.png');
await signedOutPhone.close();

const signedIn = await withPage(1280, 900);
await signIn(signedIn);
await signedIn.goto(ORIGIN + '/');
await waitFor(async () => {
  const text = await signedIn.eval(`(document.querySelector('#home-account .account-name') || {}).textContent || ''`);
  if (!text.includes('Ada Lovelace')) throw new Error(text);
  return text;
});
report.homeSignedIn = await signedIn.eval(`(() => {
  const chip = document.getElementById('home-account');
  const header = document.querySelector('.site-header');
  const main = document.getElementById('main');
  const chipBox = chip.getBoundingClientRect();
  const headerBox = header.getBoundingClientRect();
  const mainBox = main.getBoundingClientRect();
  return {
    name: chip.querySelector('.account-name').textContent,
    href: chip.querySelector('a').getAttribute('href'),
    signedPhrase: chip.innerText.includes('Signed in as'),
    belowHeader: header.nextElementSibling === chip && !header.contains(chip),
    aboveContent: chipBox.top >= headerBox.bottom - 1 && chipBox.bottom <= mainBox.top + 1,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
})()`);
await signedIn.shot('account_home_signed_in_desktop.png');
await openHomeLogin(signedIn);
await signedIn.eval(`document.querySelector('.account-menu').click()`);
report.menuSignedIn = await signedIn.eval(`({ name: document.querySelector('.account-menu .account-name').textContent, account: document.querySelector('#account-menu-panel a').textContent, accountHref: document.querySelector('#account-menu-panel a').getAttribute('href'), logout: document.querySelector('.account-logout').textContent, loginWords: document.querySelector('.account-menu').innerText.includes('Log in') })`);
await signedIn.shot('account_menu_signed_in_desktop.png');
await signedIn.goto(ORIGIN + '/philosophy/');
await waitMasterName(signedIn);
report.philosophySignedIn = await signedIn.eval(chromeExpr);
await signedIn.goto(ORIGIN + '/science/military-rd/');
await waitMasterName(signedIn);
report.deepSignedIn = await signedIn.eval(chromeExpr);
await signedIn.shot('account_division_signed_in_desktop.png');
await openHomeLogin(signedIn);
await signedIn.eval(`document.querySelector('.account-menu').click()`);
report.deepMenu = await signedIn.eval(`({ account: document.querySelector('#account-menu-panel a').textContent, href: document.querySelector('#account-menu-panel a').getAttribute('href'), logout: document.querySelector('.account-logout').textContent })`);
await signedIn.goto(ORIGIN + '/account/');
await waitFor(async () => {
  const hidden = await signedIn.eval(`document.getElementById('account-signed-in').hidden`);
  if (hidden) throw new Error('account still loading');
  return true;
});
report.accountSignedIn = await signedIn.eval(`({ name: document.getElementById('account-name').textContent, email: document.getElementById('account-email').textContent, since: document.getElementById('account-since').textContent, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, listsChess: document.getElementById('main').innerText.includes('Chess'), chrome: !!document.getElementById('home-login') || !!document.getElementById('home-account') })`);
await signedIn.shot('account_page_signed_in_desktop.png');
await signedIn.goto(ORIGIN + '/trading/the-grand-exchange/');
await waitMasterName(signedIn);
await signedIn.eval(`window.__falseRan = false; TWGIAccountSections.register({ sectionId: 'shorter-false', label: 'Trading', pathPrefixes: ['/trading/'], signInUrl: '/trading/', hasLocalAccount: function () { window.__falseRan = true; return false; }, localProfile: function () { return { name: 'Nope', url: '/trading/' }; } });`);
await waitFor(async () => {
  const ran = await signedIn.eval(`window.__falseRan === true && (document.querySelector('#home-account .account-name') || {}).textContent || ''`);
  if (!String(ran).includes('Ada Lovelace')) throw new Error(String(ran));
  return ran;
});
report.registryFalse = await signedIn.eval(`document.querySelector('#home-account .account-name').textContent`);
await signedIn.eval(`TWGIAccountSections.register({ sectionId: 'probe', label: 'Probe', pathPrefixes: ['/trading/the-grand-exchange/'], signInUrl: '/trading/the-grand-exchange/', hasLocalAccount: function (session) { window.__sawUser = session && session.user && session.user.id; window.__sawToken = !!(session && session.access_token); return session && session.user && session.user.id === '11111111-1111-1111-1111-111111111111'; }, localProfile: function () { return { name: 'Local Ada', avatarUrl: 'http://insecure.example/a.png', url: '/trading/the-grand-exchange/#local' }; }, menuItems: [{ label: 'Section', href: '/trading/the-grand-exchange/#local' }, { label: 'Log out', action: 'sign-out' }, { label: 'Bad', href: 'javascript:alert(1)' }] });`);
await waitFor(async () => {
  const text = await signedIn.eval(`(document.querySelector('#home-account .account-name') || {}).textContent || ''`);
  if (text !== 'Local Ada') throw new Error(text);
  return text;
});
await openHomeLogin(signedIn);
await signedIn.eval(`document.querySelector('.account-menu').click()`);
report.registryLocal = await signedIn.eval(`({ name: document.querySelector('#home-account .account-name').textContent, href: document.querySelector('#home-account a').getAttribute('href'), avatar: document.querySelector('#home-account .account-avatar').textContent, menu: document.querySelector('#account-menu-panel a').textContent, menuHref: document.querySelector('#account-menu-panel a').getAttribute('href'), bad: document.querySelector('#account-menu-panel').innerText.includes('Bad'), logout: document.querySelector('.account-logout').textContent, sawUser: window.__sawUser, sawToken: window.__sawToken, registered: TWGIAccountSections.list().length })`);
await signedIn.goto(ORIGIN + '/building/');
await waitMasterName(signedIn);
await signedIn.eval(`window.__throwRan = false; TWGIAccountSections.register({ sectionId: 'throws', label: 'Building', pathPrefixes: ['/building/'], signInUrl: '/building/', hasLocalAccount: function () { window.__throwRan = true; throw new Error('private store unavailable'); }, localProfile: function () { return { name: 'Should Not Show', url: '/building/' }; } });`);
await waitFor(async () => {
  const ran = await signedIn.eval(`window.__throwRan === true && (document.querySelector('#home-account .account-name') || {}).textContent || ''`);
  if (!String(ran).includes('Ada Lovelace')) throw new Error(String(ran));
  return ran;
});
report.registryThrow = await signedIn.eval(`document.querySelector('#home-account .account-name').textContent`);
await signedIn.goto(ORIGIN + '/religion/');
await waitMasterName(signedIn);
await signedIn.eval(`window.__badRan = false; TWGIAccountSections.register({ sectionId: 'bad-url', label: 'Religion', pathPrefixes: ['/religion/'], signInUrl: '/religion/', hasLocalAccount: function () { window.__badRan = true; return true; }, localProfile: function () { return { name: 'Evil', url: 'javascript:alert(1)' }; } });`);
await waitFor(async () => {
  const ran = await signedIn.eval(`window.__badRan === true && (document.querySelector('#home-account a') || {}).getAttribute && document.querySelector('#home-account a').getAttribute('href')`);
  if (ran !== '/account/') throw new Error(String(ran));
  return ran;
});
report.registryBadUrl = await signedIn.eval(`document.querySelector('#home-account a').getAttribute('href')`);
await signedIn.close();

const signedInPhone = await withPage(390, 844);
await signIn(signedInPhone);
await signedInPhone.goto(ORIGIN + '/');
await waitFor(async () => {
  const text = await signedInPhone.eval(`(document.querySelector('#home-account .account-name') || {}).textContent || ''`);
  if (!text) throw new Error('no name');
  return text;
});
report.phone = await signedInPhone.eval(`({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, nameOverflow: document.querySelector('#home-account .account-name').scrollWidth > document.querySelector('#home-account .account-name').clientWidth, belowHeader: document.querySelector('.site-header').nextElementSibling === document.getElementById('home-account') })`);
await signedInPhone.shot('account_home_signed_in_390.png');
await signedInPhone.goto(ORIGIN + '/science/military-rd/');
await waitMasterName(signedInPhone);
report.deepPhone = await signedInPhone.eval(chromeExpr);
await signedInPhone.shot('account_division_signed_in_390.png');
await signedInPhone.goto(ORIGIN + '/');
await waitMasterName(signedInPhone);
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
  const text = await signedInPhone.eval(`document.getElementById('home-login').innerText`);
  if (text.trim() !== 'Log in') throw new Error(text);
  return text;
});
report.afterLogout = await signedInPhone.eval(`document.getElementById('home-login').innerText.trim()`);
await signedInPhone.close();

assert(report.homeSignedOut.text === 'Log in' && report.homeSignedOut.href === '/login/' && report.homeSignedOut.inHeader === true && report.homeSignedOut.chipHidden === true && report.homeSignedOut.overflow === 0, 'signed-out home');
assert(report.menuSignedOut.text === 'Log in' && report.menuSignedOut.href === '/login/' && report.menuSignedOut.logout === false, 'signed-out menu');
assert(report.accountSignedOut.href === '/login/' && report.accountSignedOut.text.includes('Log in to view this account') && report.accountSignedOut.overflow === 0 && report.accountSignedOut.subaccounts === false, 'signed-out account page');
assert(report.homeSignedOutPhone === 0, 'signed-out phone overflow');
assert(report.homeSignedIn.href === '/account/' && report.homeSignedIn.signedPhrase === false && report.homeSignedIn.name.startsWith('Ada Lovelace') && report.homeSignedIn.belowHeader === true && report.homeSignedIn.aboveContent === true && report.homeSignedIn.overflow === 0, 'signed-in home');
assert(report.menuSignedIn.account === 'Account' && report.menuSignedIn.accountHref === '/account/' && report.menuSignedIn.logout === 'Log out' && report.menuSignedIn.loginWords === false, 'signed-in menu');
assert(report.accountSignedIn.email === 'ada@example.com' && report.accountSignedIn.since === 'Member since January 2, 2020' && report.accountSignedIn.listsChess === false && report.accountSignedIn.overflow === 0, 'signed-in account page');
assert(report.phone.overflow === 0 && report.phone.nameOverflow === true && report.phone.belowHeader === true && report.menuPhone === 0 && report.accountPhoneOverflow === 0, 'phone layout');
assert(report.philosophySignedOut.login === 'Log in' && report.philosophySignedOut.loginHref === '/login/' && report.philosophySignedOut.inHeader === true && report.philosophySignedOut.chipHidden === true && report.philosophySignedOut.overflow === 0, 'philosophy signed out');
assert(report.deepSignedOut.login === 'Log in' && report.deepSignedOut.belowHeader === true && report.deepSignedOut.chipHidden === true && report.deepSignedOut.overflow === 0, 'deep signed out');
assert(report.deepSignedOutPhone.login === 'Log in' && report.deepSignedOutPhone.chipHidden === true && report.deepSignedOutPhone.overflow === 0, 'deep phone signed out');
assert(report.loginChrome.login === false && report.loginChrome.chip === false, 'login page has no chip');
assert(report.signedOutSkipsLocal.checks === 0 && report.signedOutSkipsLocal.login === 'Log in' && report.signedOutSkipsLocal.chipHidden === true, 'signed out stays master');
assert(report.philosophySignedIn.href === '/account/' && report.philosophySignedIn.name.startsWith('Ada Lovelace') && report.philosophySignedIn.belowHeader === true && report.philosophySignedIn.aboveContent === true && report.philosophySignedIn.overflow === 0, 'philosophy signed in');
assert(report.deepSignedIn.href === '/account/' && report.deepSignedIn.belowHeader === true && report.deepSignedIn.aboveContent === true && report.deepSignedIn.overflow === 0, 'deep signed in');
assert(report.deepMenu.account === 'Account' && report.deepMenu.href === '/account/' && report.deepMenu.logout === 'Log out', 'deep menu');
assert(report.deepPhone.overflow === 0 && report.deepPhone.nameOverflow === true && report.deepPhone.belowHeader === true && report.deepPhone.aboveContent === true, 'deep phone');
assert(report.accountSignedIn.chrome === false, 'account page has no header chip');
assert(report.registryFalse.startsWith('Ada Lovelace'), 'false local check keeps master');
assert(report.registryLocal.name === 'Local Ada' && report.registryLocal.href === '/trading/the-grand-exchange/#local' && report.registryLocal.avatar === 'LA' && report.registryLocal.menu === 'Section' && report.registryLocal.menuHref === '/trading/the-grand-exchange/#local' && report.registryLocal.bad === false && report.registryLocal.logout === 'Log out' && report.registryLocal.sawUser === '11111111-1111-1111-1111-111111111111' && report.registryLocal.sawToken === false && report.registryLocal.registered === 2, 'local section');
assert(report.registryThrow.startsWith('Ada Lovelace'), 'throwing check keeps master');
assert(report.registryBadUrl === '/account/', 'unsafe local url keeps master');
assert(report.afterLogout === 'Log in', 'logout restores Log in');
assert(imageCheck.ok.type === 'image/png' && /could not be read/.test(imageCheck.rejected), 'image checks');
const leaked = networkHits.filter((url) => url.includes('/auth/v1/otp') || url.includes('accounts.google.com'));
assert(leaked.length === 0, 'auth network leak ' + leaked.join(' | '));
report.ok = true;
report.networkHits = networkHits;
writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ok: report.ok, homeSignedIn: report.homeSignedIn, philosophySignedIn: report.philosophySignedIn, deepSignedIn: report.deepSignedIn, deepPhone: report.deepPhone, accountSignedIn: report.accountSignedIn, registryLocal: report.registryLocal, registryBadUrl: report.registryBadUrl, afterLogout: report.afterLogout }, null, 2));
chrome.kill('SIGKILL');
server.kill('SIGKILL');
process.exit(0);
