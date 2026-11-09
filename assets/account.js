/* Master-account session for the menu and the home-page indicator.
   Reads the existing Supabase session. Does not create a profile row. */
(function () {
  var SUPABASE_URL = 'https://xfswvbxuhgqbdqpqiywa.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_xHJ2V2lN-9B3LqSa3La3iw_QhqtU6JC';
  var state = null;
  var settled = false;
  var listeners = [];
  var client = null;

  function emit() {
    paintMenu();
    paintHome();
    listeners.forEach(function (fn) {
      try { fn(state); } catch (err) {}
    });
  }

  function httpsUrl(value) {
    try {
      var url = new URL(String(value || ''));
      if (url.protocol !== 'https:') return '';
      return url.href;
    } catch (err) {
      return '';
    }
  }

  function emailLocal(email) {
    var local = String(email || '').split('@')[0].trim();
    return local || 'Account';
  }

  function metadataName(user) {
    var meta = (user && user.user_metadata) || {};
    var email = String((user && user.email) || '').trim().toLowerCase();
    var fields = [meta.full_name, meta.name];
    var i;
    for (i = 0; i < fields.length; i += 1) {
      var value = String(fields[i] || '').trim();
      if (!value) continue;
      if (email && value.toLowerCase() === email) continue;
      return value;
    }
    return '';
  }

  function displayName(user, profile) {
    var stored = profile && String(profile.display_name || '').trim();
    if (stored) return stored;
    return metadataName(user) || emailLocal(user && user.email);
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function avatarNode(url, name) {
    if (url) {
      var img = document.createElement('img');
      img.className = 'account-avatar';
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.src = url;
      img.addEventListener('error', function () {
        var fallback = document.createElement('span');
        fallback.className = 'account-avatar';
        fallback.setAttribute('aria-hidden', 'true');
        fallback.textContent = initials(name);
        if (img.parentNode) img.parentNode.replaceChild(fallback, img);
      });
      return img;
    }
    var span = document.createElement('span');
    span.className = 'account-avatar';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = initials(name);
    return span;
  }

  function nameNode(name) {
    var span = document.createElement('span');
    span.className = 'account-name';
    span.textContent = name;
    return span;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function paintHome() {
    var loginSlot = document.getElementById('home-login');
    var chip = document.getElementById('home-account');
    if (loginSlot) {
      clear(loginSlot);
      if (!settled || !state || state.user) {
        if (!settled || !state) {
          var pending = document.createElement('span');
          pending.className = 'account-pending';
          pending.setAttribute('aria-busy', 'true');
          pending.setAttribute('aria-label', 'Account');
          loginSlot.appendChild(pending);
          loginSlot.setAttribute('aria-busy', 'true');
        } else {
          loginSlot.removeAttribute('aria-busy');
        }
      } else {
        loginSlot.removeAttribute('aria-busy');
        var link = document.createElement('a');
        link.href = '/login/';
        link.textContent = 'Log in';
        loginSlot.appendChild(link);
      }
    }
    if (!chip) return;
    clear(chip);
    if (!settled || !state || !state.user) {
      chip.hidden = true;
      return;
    }
    chip.hidden = false;
    var account = document.createElement('a');
    account.href = '/account/';
    account.appendChild(avatarNode(state.avatarUrl, state.name));
    account.appendChild(nameNode(state.name));
    chip.appendChild(account);
  }

  function paintMenu() {
    var slot = document.querySelector('[data-account-slot]');
    if (!slot) return;
    clear(slot);
    if (!settled || !state) {
      var pending = document.createElement('span');
      pending.className = 'account-pending';
      pending.setAttribute('aria-busy', 'true');
      pending.setAttribute('aria-label', 'Account');
      slot.appendChild(pending);
      return;
    }
    if (!state.user) {
      var link = document.createElement('a');
      link.href = '/login/';
      link.setAttribute('data-nav', 'login');
      if (location.pathname === '/login' || location.pathname === '/login/') link.setAttribute('aria-current', 'page');
      link.textContent = 'Log in';
      slot.appendChild(link);
      return;
    }
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'account-menu';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'account-menu-panel');
    button.appendChild(avatarNode(state.avatarUrl, state.name));
    button.appendChild(nameNode(state.name));
    var panel = document.createElement('ul');
    panel.id = 'account-menu-panel';
    panel.className = 'nav-sub';
    panel.hidden = true;
    var accountItem = document.createElement('li');
    var accountLink = document.createElement('a');
    accountLink.href = '/account/';
    accountLink.textContent = 'Account';
    if (location.pathname === '/account' || location.pathname === '/account/') accountLink.setAttribute('aria-current', 'page');
    accountItem.appendChild(accountLink);
    var logoutItem = document.createElement('li');
    var logout = document.createElement('button');
    logout.type = 'button';
    logout.className = 'account-logout';
    logout.textContent = 'Log out';
    logout.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (client) client.auth.signOut({ scope: 'local' });
    });
    logoutItem.appendChild(logout);
    panel.appendChild(accountItem);
    panel.appendChild(logoutItem);
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      var open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      panel.hidden = !open;
    });
    slot.appendChild(button);
    slot.appendChild(panel);
  }

  function apply(user, profile, images) {
    images = images || {};
    state = {
      user: user || null,
      profile: profile || null,
      name: user ? displayName(user, profile) : '',
      avatarUrl: user ? (httpsUrl(images.avatar) || httpsUrl(((user.user_metadata || {}).avatar_url || (user.user_metadata || {}).picture))) : '',
      backgroundUrl: httpsUrl(images.background),
      email: user && user.email ? String(user.email) : '',
      memberSince: user && user.created_at ? String(user.created_at) : ''
    };
    settled = true;
    emit();
  }

  async function signedImage(userId, kind, type) {
    if (!type || !client) return '';
    var result = await client.storage.from('master-account').createSignedUrl(userId + '/' + kind, 3600);
    if (result.error || !result.data) return '';
    return result.data.signedUrl || '';
  }

  async function refresh(user) {
    var profile = null;
    var images = {};
    if (user && client) {
      try {
        var row = await client.from('master_profiles').select('display_name,bio,avatar_type,background_type').eq('id', user.id).maybeSingle();
        if (row && !row.error && row.data) profile = row.data;
      } catch (err) {}
      try {
        if (profile && profile.avatar_type) images.avatar = await signedImage(user.id, 'avatar', profile.avatar_type);
        if (profile && profile.background_type) images.background = await signedImage(user.id, 'background', profile.background_type);
      } catch (err) {}
    }
    apply(user, profile, images);
  }

  var api = {
    subscribe: function (fn) {
      listeners.push(fn);
      if (settled) fn(state);
    },
    signOut: function () {
      if (!client) return Promise.resolve();
      return client.auth.signOut({ scope: 'local' });
    },
    saveProfile: async function (fields) {
      if (!client || !state || !state.user) throw new Error('Sign in required.');
      var avatarType = state.profile && state.profile.avatar_type || null;
      var backgroundType = state.profile && state.profile.background_type || null;
      if (fields.avatar) {
        var avatar = await client.storage.from('master-account').upload(state.user.id + '/avatar', new Blob([fields.avatar.bytes], { type: fields.avatar.type }), { upsert: true, contentType: fields.avatar.type });
        if (avatar.error) throw new Error(avatar.error.message || 'The picture could not be saved.');
        avatarType = fields.avatar.type;
      }
      if (fields.background) {
        var background = await client.storage.from('master-account').upload(state.user.id + '/background', new Blob([fields.background.bytes], { type: fields.background.type }), { upsert: true, contentType: fields.background.type });
        if (background.error) throw new Error(background.error.message || 'The background could not be saved.');
        backgroundType = fields.background.type;
      }
      var saved = await client.rpc('save_master_profile', {
        next_name: fields.name,
        next_bio: fields.bio,
        next_avatar: avatarType,
        next_background: backgroundType
      });
      if (saved.error) throw new Error(saved.error.message || 'The account profile store is not set up yet.');
      await refresh(state.user);
    }
  };
  window.TWGIAccount = api;
  document.dispatchEvent(new CustomEvent('twgi-account-api'));
  paintMenu();
  paintHome();

  function boot() {
    if (!window.supabase || !window.supabase.createClient) {
      apply(null, null, {});
      return;
    }
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { detectSessionInUrl: false, persistSession: true, autoRefreshToken: true, flowType: 'pkce' }
    });
    client.auth.getSession().then(function (result) {
      return refresh(result.data.session && result.data.session.user);
    }).catch(function () {
      apply(null, null, {});
    });
    client.auth.onAuthStateChange(function (_event, session) {
      if (!settled) return;
      refresh(session && session.user).catch(function () { apply(null, null, {}); });
    });
  }

  if (window.supabase && window.supabase.createClient) boot();
  else {
    var lib = document.createElement('script');
    lib.src = '/vendor/supabase.js';
    lib.onload = boot;
    lib.onerror = function () { apply(null, null, {}); };
    document.body.appendChild(lib);
  }
})();
