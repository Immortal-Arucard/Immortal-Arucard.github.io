/* Device storage for DRP Compass accounts and history.
   Every method returns a Promise so a Supabase client can replace this file
   later without changing the pages that call it. This version never sends
   data off the device. */
(function (global) {
  var PROFILES = 'drp.profiles';
  var SESSION = 'drp.session';

  function historyKey(id) { return 'drp.history.' + id; }

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function uid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  var api = {
    async listProfiles() {
      var rows = read(PROFILES, []);
      return Array.isArray(rows) ? rows : [];
    },

    async currentProfile() {
      var id = localStorage.getItem(SESSION);
      if (!id) return null;
      var rows = await this.listProfiles();
      return rows.find(function (p) { return p.id === id; }) || null;
    },

    async createProfile(name, email) {
      name = String(name || '').trim();
      email = String(email || '').trim();
      if (!name) throw new Error('Enter your name.');
      if (!validEmail(email)) throw new Error('Enter a valid email.');
      var profiles = await this.listProfiles();
      var profile = { id: uid(), name: name, email: email, createdAt: new Date().toISOString() };
      profiles.push(profile);
      write(PROFILES, profiles);
      localStorage.setItem(SESSION, profile.id);
      return profile;
    },

    async switchProfile(id) {
      var profiles = await this.listProfiles();
      var profile = profiles.find(function (p) { return p.id === id; });
      if (!profile) throw new Error('That account is not on this device.');
      localStorage.setItem(SESSION, profile.id);
      return profile;
    },

    async signOut() {
      localStorage.removeItem(SESSION);
    },

    async deleteProfile(id) {
      var profiles = (await this.listProfiles()).filter(function (p) { return p.id !== id; });
      write(PROFILES, profiles);
      localStorage.removeItem(historyKey(id));
      if (localStorage.getItem(SESSION) === id) localStorage.removeItem(SESSION);
    },

    async listHistory(profileId) {
      var rows = read(historyKey(profileId), []);
      if (!Array.isArray(rows)) rows = [];
      return rows.slice().sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
    },

    async saveResult(profileId, entry) {
      var rows = read(historyKey(profileId), []);
      if (!Array.isArray(rows)) rows = [];
      var saved = {
        id: uid(),
        at: new Date().toISOString(),
        score: entry.score,
        label: entry.label,
        r: entry.r,
        note: entry.note || ''
      };
      rows.push(saved);
      write(historyKey(profileId), rows);
      return saved;
    },

    async updateNote(profileId, entryId, note) {
      var rows = read(historyKey(profileId), []);
      var row = rows.find(function (r) { return r.id === entryId; });
      if (!row) throw new Error('That entry is gone.');
      row.note = String(note || '');
      write(historyKey(profileId), rows);
      return row;
    },

    async deleteEntry(profileId, entryId) {
      var rows = read(historyKey(profileId), []).filter(function (r) { return r.id !== entryId; });
      write(historyKey(profileId), rows);
    }
  };

  global.DRPStorage = api;
})(window);
