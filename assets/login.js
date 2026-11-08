/* Sign-in for an existing TWGI master account.
   Uses the same public Supabase project as the rest of the site.
   Does not load storage.js, so it does not create a Compass profile.
   No service key is used. */
(function () {
  var SUPABASE_URL = 'https://xfswvbxuhgqbdqpqiywa.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_xHJ2V2lN-9B3LqSa3La3iw_QhqtU6JC';
  var form = document.getElementById('login-form');
  var status = document.getElementById('login-status');
  var sessionBox = document.getElementById('login-session');
  var who = document.getElementById('login-who');
  var out = document.getElementById('login-out');
  var emailInput = document.getElementById('login-email');

  function say(text) {
    if (status) status.textContent = text || '';
  }

  function validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function message(error) {
    var text = (error && (error.message || error.error_description)) || 'Something went wrong.';
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return 'You appear to be offline. Try again when you are connected.';
    }
    if (/failed to fetch|networkerror|network request failed|load failed|offline|timeout/i.test(String(text))) {
      return 'You appear to be offline. Try again when you are connected.';
    }
    if (/signups not allowed|user not found|invalid login/i.test(String(text))) {
      return 'No account found for that email.';
    }
    return String(text);
  }

  if (!window.supabase || !window.supabase.createClient) {
    say('Sign-in is unavailable because the auth library did not load.');
    return;
  }

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
      flowType: 'pkce'
    }
  });

  function showSession(session) {
    var email = session && session.user && session.user.email;
    if (!email) {
      if (form) form.hidden = false;
      if (sessionBox) sessionBox.hidden = true;
      return;
    }
    if (form) form.hidden = true;
    if (sessionBox) sessionBox.hidden = false;
    if (who) who.textContent = 'Signed in as ' + email + '.';
  }

  client.auth.getSession().then(function (result) {
    if (result.error) {
      say(message(result.error));
      return;
    }
    showSession(result.data.session);
  }).catch(function (err) {
    say(message(err));
  });

  client.auth.onAuthStateChange(function (_event, session) {
    showSession(session);
  });

  if (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var email = String(emailInput && emailInput.value || '').trim();
      if (!validEmail(email)) {
        say('Enter a valid email.');
        if (emailInput) emailInput.focus();
        return;
      }
      say('Sending a sign-in link…');
      var submit = form.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;
      client.auth.signInWithOtp({
        email: email,
        options: {
          emailRedirectTo: location.origin + '/login/',
          shouldCreateUser: false
        }
      }).then(function (result) {
        if (submit) submit.disabled = false;
        if (result.error) {
          say(message(result.error));
          return;
        }
        say('Check that email for a sign-in link.');
      }).catch(function (err) {
        if (submit) submit.disabled = false;
        say(message(err));
      });
    });
  }

  if (out) {
    out.addEventListener('click', function () {
      client.auth.signOut().then(function (result) {
        if (result.error) {
          say(message(result.error));
          return;
        }
        showSession(null);
        say('Signed out.');
      }).catch(function (err) {
        say(message(err));
      });
    });
  }
})();
