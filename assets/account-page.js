(function () {
  var status = document.getElementById('account-status');
  var signedOut = document.getElementById('account-signed-out');
  var signedIn = document.getElementById('account-signed-in');
  var hero = document.getElementById('account-hero');
  var title = document.getElementById('account-name');
  var email = document.getElementById('account-email');
  var since = document.getElementById('account-since');
  var bio = document.getElementById('account-bio');
  var form = document.getElementById('account-form');
  var nameInput = document.getElementById('account-name-input');
  var bioInput = document.getElementById('account-bio-input');
  var avatarInput = document.getElementById('account-avatar-file');
  var backgroundInput = document.getElementById('account-background-file');
  var logout = document.getElementById('account-out');
  if (!status) return;

  var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function memberSince(iso) {
    var date = new Date(iso);
    if (!iso || isNaN(date.getTime())) return '';
    return 'Member since ' + months[date.getUTCMonth()] + ' ' + date.getUTCDate() + ', ' + date.getUTCFullYear();
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function say(text) {
    status.textContent = text || '';
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function show(state) {
    if (!state) return;
    if (!state.user) {
      signedOut.hidden = false;
      signedIn.hidden = true;
      say('');
      return;
    }
    signedOut.hidden = true;
    signedIn.hidden = false;
    if (status.textContent === 'Loading account…') say('');
    title.textContent = state.name;
    email.textContent = state.email;
    since.textContent = memberSince(state.memberSince);
    bio.textContent = (state.profile && state.profile.bio) || '';
    if (!nameInput.value) nameInput.value = state.name;
    if (!bioInput.value && state.profile) bioInput.value = state.profile.bio || '';
    clear(hero);
    if (state.backgroundUrl) {
      var background = document.createElement('img');
      background.className = 'account-background';
      background.alt = '';
      background.src = state.backgroundUrl;
      hero.appendChild(background);
    }
    hero.appendChild((function () {
      if (state.avatarUrl) {
        var img = document.createElement('img');
        img.className = 'account-portrait';
        img.alt = '';
        img.src = state.avatarUrl;
        return img;
      }
      var span = document.createElement('span');
      span.className = 'account-portrait';
      span.textContent = initials(state.name);
      return span;
    })());
  }

  function bind() {
    window.TWGIAccount.subscribe(show);
    if (logout) {
      logout.addEventListener('click', function () {
        window.TWGIAccount.signOut();
      });
    }
    if (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        say('Saving…');
        var avatarFile = avatarInput.files && avatarInput.files[0];
        var backgroundFile = backgroundInput.files && backgroundInput.files[0];
        Promise.resolve().then(function () {
          var images = window.TWGIAccountImage;
          return Promise.all([
            avatarFile ? images.prepareProfileImage(avatarFile) : null,
            backgroundFile ? images.prepareProfileImage(backgroundFile) : null
          ]);
        }).then(function (prepared) {
          return window.TWGIAccount.saveProfile({
            name: nameInput.value,
            bio: bioInput.value,
            avatar: prepared[0],
            background: prepared[1]
          });
        }).then(function () {
          say('Saved.');
          avatarInput.value = '';
          backgroundInput.value = '';
        }).catch(function (err) {
          say(err && err.message ? err.message : 'The account could not be saved.');
        });
      });
    }
  }

  if (window.TWGIAccount) bind();
  else document.addEventListener('twgi-account-api', bind);
})();
