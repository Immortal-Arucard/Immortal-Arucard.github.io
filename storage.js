/* Cloud storage for DRP Compass.
   supabase-js is loaded from /vendor/supabase.js (the v2 UMD build).
   Every method returns a Promise. A different backend can replace this file
   if it keeps the same methods. No secret key is used. */
(function (global) {
  var SUPABASE_URL = 'https://xfswvbxuhgqbdqpqiywa.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_xHJ2V2lN-9B3LqSa3La3iw_QhqtU6JC';
  var IMPORT_FLAG = 'drp.importOffered.';

  if (!global.supabase || !global.supabase.createClient) {
    throw new Error('Supabase failed to load.');
  }

  var client = global.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
      flowType: 'pkce'
    }
  });

  var profile = null;

  function validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function friendly(error) {
    var msg = (error && (error.message || error.error_description)) || 'Something went wrong.';
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return new Error('You appear to be offline. Try again when you are connected.');
    }
    if (/failed to fetch|networkerror|network request failed|load failed|offline|timeout/i.test(String(msg))) {
      return new Error('You appear to be offline. Try again when you are connected.');
    }
    return new Error(msg);
  }

  function shape(row, email) {
    return {
      id: row.id,
      name: row.name || email || 'Account',
      email: email || '',
      createdAt: row.created_at || null
    };
  }

  function toEntry(row) {
    return {
      id: row.id,
      at: row.taken_at,
      score: row.score,
      label: row.label,
      r: row.answers,
      note: row.note || '',
      profileId: row.user_id
    };
  }

  async function sessionUser() {
    var result = await client.auth.getSession();
    if (result.error) throw friendly(result.error);
    return result.data.session ? result.data.session.user : null;
  }

  async function ensureProfile(user) {
    if (!user) {
      profile = null;
      return null;
    }
    var pendingName = '';
    try { pendingName = sessionStorage.getItem('drp.pendingName') || ''; } catch (e) {}
    var metaName = user.user_metadata && user.user_metadata.name;
    var name = String(metaName || pendingName || '').trim();
    var existing = await client.from('profiles').select('id,name,created_at').eq('id', user.id).maybeSingle();
    if (existing.error) throw friendly(existing.error);
    if (!existing.data) {
      var inserted = await client.from('profiles').insert({
        id: user.id,
        name: name || user.email || 'Account',
        created_at: new Date().toISOString()
      }).select('id,name,created_at').single();
      if (inserted.error && inserted.error.code !== '23505') throw friendly(inserted.error);
      if (inserted.error) {
        var again = await client.from('profiles').select('id,name,created_at').eq('id', user.id).maybeSingle();
        if (again.error || !again.data) throw friendly(inserted.error);
        profile = shape(again.data, user.email);
        return profile;
      }
      profile = shape(inserted.data, user.email);
      return profile;
    }
    if (name && existing.data.name !== name) {
      var updated = await client.from('profiles').update({ name: name }).eq('id', user.id).select('id,name,created_at').single();
      if (!updated.error && updated.data) {
        profile = shape(updated.data, user.email);
        return profile;
      }
    }
    profile = shape(existing.data, user.email);
    return profile;
  }

  function redirectTo() {
    return location.origin + '/';
  }

  function gatherLocal() {
    var profiles = [];
    try { profiles = JSON.parse(localStorage.getItem('drp.profiles') || '[]') || []; } catch (e) { profiles = []; }
    if (!Array.isArray(profiles)) profiles = [];
    var entries = [];
    var seen = {};
    function add(rows) {
      if (!Array.isArray(rows)) return;
      rows.forEach(function (row) {
        if (!row || !row.r) return;
        var key = (row.at || '') + '|' + row.r + '|' + (row.note || '');
        if (seen[key]) return;
        seen[key] = true;
        entries.push(row);
      });
    }
    profiles.forEach(function (p) {
      try { add(JSON.parse(localStorage.getItem('drp.history.' + p.id) || '[]')); } catch (e) {}
    });
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.indexOf('drp.history.') === 0) {
        try { add(JSON.parse(localStorage.getItem(key) || '[]')); } catch (e) {}
      }
    }
    return { profiles: profiles, entries: entries };
  }

  var api = {
    async listProfiles() {
      return profile ? [profile] : [];
    },

    async currentProfile() {
      return profile;
    },

    async createProfile(name, email) {
      name = String(name || '').trim();
      email = String(email || '').trim();
      if (!name) throw new Error('Enter your name.');
      if (!validEmail(email)) throw new Error('Enter a valid email.');
      try { sessionStorage.setItem('drp.pendingName', name); } catch (e) {}
      var result;
      try {
        result = await client.auth.signInWithOtp({
          email: email,
          options: {
            emailRedirectTo: redirectTo(),
            data: { name: name }
          }
        });
      } catch (err) {
        throw friendly(err);
      }
      if (result.error) throw friendly(result.error);
      return { pending: true, email: email, name: name };
    },

    async signIn(email) {
      email = String(email || '').trim();
      if (!validEmail(email)) throw new Error('Enter a valid email.');
      var result;
      try {
        result = await client.auth.signInWithOtp({
          email: email,
          options: {
            emailRedirectTo: redirectTo(),
            shouldCreateUser: false
          }
        });
      } catch (err) {
        throw friendly(err);
      }
      if (result.error) {
        if (/signups not allowed/i.test(result.error.message || '')) throw new Error('No account found for that email. Create an account instead.');
        throw friendly(result.error);
      }
      return { pending: true, email: email };
    },

    async switchProfile(id) {
      if (!profile || profile.id !== id) throw new Error('That account is not signed in on this device.');
      return profile;
    },

    async signOut() {
      var result = await client.auth.signOut();
      if (result.error) throw friendly(result.error);
      profile = null;
    },

    async deleteProfile(id) {
      var user = await sessionUser();
      if (!user || user.id !== id) throw new Error('Sign in again before deleting this account.');
      var results = await client.from('results').delete().eq('user_id', id);
      if (results.error) throw friendly(results.error);
      var removed = await client.from('profiles').delete().eq('id', id);
      if (removed.error) throw friendly(removed.error);
      profile = null;
      var signedOut = await client.auth.signOut();
      if (signedOut.error) throw friendly(signedOut.error);
    },

    async listHistory() {
      var user = await sessionUser();
      if (!user) return [];
      var result = await client.from('results').select('id,user_id,taken_at,score,label,answers,note').eq('user_id', user.id).order('taken_at', { ascending: false });
      if (result.error) throw friendly(result.error);
      return (result.data || []).map(toEntry);
    },

    async saveResult(profileId, entry) {
      var user = await sessionUser();
      if (!user) throw new Error('Sign in to save this result.');
      var row = {
        id: (global.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2)),
        user_id: user.id,
        taken_at: entry.at || new Date().toISOString(),
        score: entry.score,
        label: entry.label,
        answers: entry.r,
        note: entry.note || ''
      };
      var result = await client.from('results').insert(row).select('id,user_id,taken_at,score,label,answers,note').single();
      if (result.error) throw friendly(result.error);
      return toEntry(result.data);
    },

    async updateNote(profileId, entryId, note) {
      var user = await sessionUser();
      if (!user) throw new Error('Sign in to save this note.');
      var result = await client.from('results').update({ note: String(note || '') }).eq('id', entryId).eq('user_id', user.id).select('id,user_id,taken_at,score,label,answers,note').single();
      if (result.error) throw friendly(result.error);
      return toEntry(result.data);
    },

    async deleteEntry(profileId, entryId) {
      var user = await sessionUser();
      if (!user) throw new Error('Sign in to delete this result.');
      var result = await client.from('results').delete().eq('id', entryId).eq('user_id', user.id);
      if (result.error) throw friendly(result.error);
    },

    localMigration() {
      return gatherLocal();
    },

    async importLocal(profileId, entries) {
      for (var i = 0; i < entries.length; i++) {
        var row = entries[i];
        await this.saveResult(profileId, {
          at: row.at,
          score: row.score,
          label: row.label,
          r: row.r,
          note: row.note || ''
        });
      }
    },

    importFlag: function (userId) { return IMPORT_FLAG + userId; },

    /* Records one anonymous count row per completed test (guests and signed-in
       users). Stores only registered flag, user id (if signed in) and score.
       Never throws: failures are ignored silently. */
    /* One visit row per page load; the server hashes the IP. Never throws. */
    logVisit: function (path) {
      return (async function () {
        try { await client.rpc('log_visit', { path: String(path || '/').slice(0, 200) }); } catch (e) { /* ignore */ }
      })();
    },

    logTestEvent: function (score) {
      return (async function () {
        try {
          var sess = await client.auth.getSession();
          var user = sess && sess.data && sess.data.session && sess.data.session.user;
          var n = Number(score);
          await client.from('test_events').insert({
            registered: !!user,
            user_id: user ? user.id : null,
            score: Number.isFinite(n) ? n : null
          });
        } catch (e) { /* ignore */ }
      })();
    }
  };

  global.DRPStorage = api;

  client.auth.onAuthStateChange(function (_event, session) {
    ensureProfile(session && session.user).then(function () {
      global.dispatchEvent(new CustomEvent('drp-auth'));
    }).catch(function (err) {
      global.dispatchEvent(new CustomEvent('drp-auth', { detail: { error: friendly(err) } }));
    });
  });

  client.auth.getSession().then(function (result) {
    if (result.error) throw result.error;
    return ensureProfile(result.data.session && result.data.session.user);
  }).then(function () {
    global.dispatchEvent(new CustomEvent('drp-storage-ready'));
  }).catch(function (err) {
    global.dispatchEvent(new CustomEvent('drp-storage-ready', { detail: { error: friendly(err) } }));
  });
})(window);
