/* Public master-account profile and follow-button scaffold.

   Own profile fields come from the signed-in TWGIAccount state already
   on the device (name, bio, member since, picture). Email is never shown.

   Other profiles are not readable: master_profiles is owner-only until
   public.public_master_profile exists. This file must not call Supabase.
   Do not invent a name, bio, or follower count.

   Follow seam: TWGIFollow.pull / TWGIFollow.push.
   After supabase/master_social.sql is applied (it is not applied now):
     pull(target) -> client.rpc('public_master_profile', { target })
     push(target, follow) -> client.rpc(follow ? 'follow_master' : 'unfollow_master', { target })
   Until then a follow is stored only in localStorage under
   twgi-follow-scaffold-v1, keyed by the signed-in user id.
*/
(function (global) {
  var STORE = 'twgi-follow-scaffold-v1';
  var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var viewer = null;

  var sync = {
    mode: 'scaffold',
    pull: function () { return Promise.resolve(null); },
    push: function () { return Promise.resolve({ synced: false, reason: 'sql-not-applied' }); }
  };

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
  }

  function rawId() {
    return new URLSearchParams(global.location.search).get('id');
  }

  function queryId() {
    var id = rawId() || '';
    return isUuid(id) ? id.toLowerCase() : '';
  }

  function memberSince(iso) {
    var date = new Date(iso);
    if (!iso || isNaN(date.getTime())) return '';
    return 'Member since ' + months[date.getUTCMonth()] + ' ' + date.getUTCDate() + ', ' + date.getUTCFullYear();
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function readMap() {
    try {
      var parsed = JSON.parse(global.localStorage.getItem(STORE) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function viewerId() {
    return viewer && viewer.user && viewer.user.id ? String(viewer.user.id).toLowerCase() : '';
  }

  function isFollowing(target) {
    var id = viewerId();
    if (!id) return false;
    var mine = readMap()[id] || {};
    return !!mine[target];
  }

  function setFollowing(target, follow) {
    var id = viewerId();
    if (!id) return;
    var all = readMap();
    var mine = all[id] || {};
    if (follow) mine[target] = new Date().toISOString();
    else delete mine[target];
    all[id] = mine;
    global.localStorage.setItem(STORE, JSON.stringify(all));
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function text(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = value || '';
  }

  function paintFollow(target, self) {
    var button = document.getElementById('profile-follow');
    var note = document.getElementById('profile-follow-note');
    var login = document.getElementById('profile-login');
    if (!button) return;
    if (self || !target) {
      button.hidden = true;
      if (login) login.hidden = true;
      return;
    }
    if (!viewer) {
      button.hidden = true;
      if (login) login.hidden = false;
      if (note) note.textContent = 'Log in to use the follow button. It does not store a follow while signed out.';
      return;
    }
    if (login) login.hidden = true;
    button.hidden = false;
    var on = isFollowing(target);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
    button.textContent = on ? 'Following on this device' : 'Follow';
  }

  function emptyPortrait() {
    var slot = document.getElementById('profile-portrait');
    if (slot) clear(slot);
  }

  function paintPortrait(state) {
    var slot = document.getElementById('profile-portrait');
    if (!slot) return;
    clear(slot);
    if (!state || !state.name) return;
    if (state && state.avatarUrl) {
      var img = document.createElement('img');
      img.className = 'account-portrait';
      img.alt = '';
      img.src = state.avatarUrl;
      slot.appendChild(img);
      return;
    }
    var span = document.createElement('span');
    span.className = 'account-portrait';
    span.textContent = initials(state && state.name);
    slot.appendChild(span);
  }

  function render() {
    var requested = queryId();
    var selfId = viewerId();
    if (rawId() && !requested) {
      text('profile-name', 'Public profile');
      text('profile-status', 'This link is not a profile id.');
      text('profile-since', '');
      text('profile-bio', '');
      text('profile-id', '');
      text('profile-counts', '');
      emptyPortrait();
      paintFollow('', false);
      return;
    }
    if (!requested && selfId && isUuid(selfId)) {
      var url = new URL(global.location.href);
      url.searchParams.set('id', selfId);
      global.history.replaceState(null, '', url.pathname + url.search);
      requested = selfId;
    }
    var self = !!(requested && selfId && requested === selfId);
    text('profile-status', '');
    paintFollow(requested, self);

    if (!requested && !viewer) {
      text('profile-name', 'Public profile');
      text('profile-status', 'Log in to open your public profile, or open a profile link with an id.');
      text('profile-since', '');
      text('profile-bio', '');
      text('profile-id', '');
      emptyPortrait();
      return;
    }
    if (!requested) {
      text('profile-name', 'Public profile');
      text('profile-status', 'This link has no profile id.');
      return;
    }
    text('profile-id', 'Profile id ' + requested);

    if (self && viewer) {
      text('profile-name', viewer.name || 'Account');
      text('profile-since', memberSince(viewer.memberSince));
      text('profile-bio', (viewer.profile && viewer.profile.bio) || 'No bio yet.');
      text('profile-status', 'This is your public profile. Email stays on the account page.');
      text('profile-counts', 'Follower counts appear after the social tables are applied. None are shown here.');
      paintPortrait(viewer);
      return;
    }

    text('profile-name', 'Public profile');
    text('profile-since', '');
    text('profile-bio', '');
    text('profile-counts', '');
    text('profile-status', 'This profile cannot be read yet. Public reads are proposed and not turned on. No name or bio is filled in.');
    emptyPortrait();
  }

  function bindFollow() {
    var button = document.getElementById('profile-follow');
    if (!button || button.getAttribute('data-wired') === 'true') return;
    button.setAttribute('data-wired', 'true');
    button.addEventListener('click', function () {
      var target = queryId();
      if (!viewerId() || !target || viewerId() === target) return;
      var next = !isFollowing(target);
      try {
        setFollowing(target, next);
      } catch (err) {
        text('profile-follow-note', 'This device could not store the follow.');
        return;
      }
      paintFollow(target, false);
      sync.push(target, next).then(function (result) {
        if (result && result.synced) text('profile-follow-note', next ? 'Following.' : 'Unfollowed.');
        else text('profile-follow-note', 'Saved on this device only. Following is not stored on the account yet.');
      }).catch(function () {
        text('profile-follow-note', 'Saved on this device only. Following is not stored on the account yet.');
      });
    });
  }

  function boot() {
    bindFollow();
    function apply(state) {
      viewer = state && state.user ? state : null;
      render();
    }
    if (!global.TWGIAccount) {
      render();
      return;
    }
    global.TWGIAccount.subscribe(apply);
  }

  global.TWGIFollow = sync;

  function start() {
    if (global.TWGIAccount) boot();
    else document.addEventListener('twgi-account-api', boot);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
