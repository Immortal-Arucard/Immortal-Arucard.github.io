/* Master-account session for the menu and the page indicator.
   The indicator is injected on every page except /login/ and /account/.
   A registered section can replace it when the signed-in user has that
   section's own account. See account-sections.js. This file does not
   create a profile row and does not read other people's rows. */
(function () {
  var SUPABASE_URL = 'https://xfswvbxuhgqbdqpqiywa.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_xHJ2V2lN-9B3LqSa3La3iw_QhqtU6JC';
  var state = null;
  var settled = false;
  var listeners = [];
  var client = null;
  var paintGeneration = 0;

  function emit() {
    var generation = ++paintGeneration;
    var session = state && state.user ? { user: state.user } : null;
    var sections = window.TWGIAccountSections;
    var pending = sections ? sections.appearance(session) : Promise.resolve(null);
    Promise.resolve(pending).then(function (look) {
      if (generation !== paintGeneration) return;
      paintMenu(look);
      paintHome(look);
    }).catch(function () {
      if (generation !== paintGeneration) return;
      paintMenu(null);
      paintHome(null);
    });
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

  function masterUrls(look) {
    if (look && look.master) return look.master;
    if (window.TWGIAccountSections) return window.TWGIAccountSections.masterUrls();
    return { signInUrl: '/login/', accountUrl: '/account/' };
  }

  function shownIdentity(look) {
    if (look && look.kind === 'local' && look.local) {
      return {
        name: look.local.name,
        avatarUrl: httpsUrl(look.local.avatarUrl),
        href: look.local.url
      };
    }
    return {
      name: state && state.name,
      avatarUrl: state && state.avatarUrl,
      href: masterUrls(look).accountUrl
    };
  }

  function paintHome(look) {
    var loginSlot = document.getElementById('home-login');
    var chip = document.getElementById('home-account');
    var urls = masterUrls(look);
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
        link.href = urls.signInUrl;
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
    var identity = shownIdentity(look);
    chip.hidden = false;
    var account = document.createElement('a');
    account.href = identity.href;
    account.appendChild(avatarNode(identity.avatarUrl, identity.name));
    account.appendChild(nameNode(identity.name));
    chip.appendChild(account);
  }

  function menuItemsFor(look) {
    if (look && look.kind === 'local' && look.section && look.section.menuItems && look.section.menuItems.length) {
      return look.section.menuItems;
    }
    return [
      { label: 'Account', href: shownIdentity(look).href },
      { label: 'Log out', action: 'sign-out' }
    ];
  }

  function appendMenuItem(panel, item) {
    if (!item || !item.label) return;
    var li = document.createElement('li');
    if (item.action === 'sign-out') {
      var logout = document.createElement('button');
      logout.type = 'button';
      logout.className = 'account-logout';
      logout.textContent = String(item.label);
      logout.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (client) client.auth.signOut({ scope: 'local' });
      });
      li.appendChild(logout);
      panel.appendChild(li);
      return;
    }
    var href = window.TWGIAccountSections ? window.TWGIAccountSections.safeHref(item.href) : '';
    if (!href) return;
    var link = document.createElement('a');
    link.href = href;
    link.textContent = String(item.label);
    if (location.pathname === href || location.pathname + '/' === href) link.setAttribute('aria-current', 'page');
    li.appendChild(link);
    panel.appendChild(li);
  }

  function paintMenu(look) {
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
      link.href = masterUrls(look).signInUrl;
      link.setAttribute('data-nav', 'login');
      if (location.pathname === '/login' || location.pathname === '/login/') link.setAttribute('aria-current', 'page');
      link.textContent = 'Log in';
      slot.appendChild(link);
      return;
    }
    var identity = shownIdentity(look);
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'account-menu';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'account-menu-panel');
    button.appendChild(avatarNode(identity.avatarUrl, identity.name));
    button.appendChild(nameNode(identity.name));
    var panel = document.createElement('ul');
    panel.id = 'account-menu-panel';
    panel.className = 'nav-sub';
    panel.hidden = true;
    menuItemsFor(look).forEach(function (item) { appendMenuItem(panel, item); });
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
  document.addEventListener('twgi-account-sections', function () {
    if (settled) emit();
  });
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
