(function () {
  var button = document.querySelector('.menu-btn');
  var menu = document.getElementById('site-menu');

  var tree = [
    {
      href: '/',
      name: 'Home',
      children: [
        { href: '/login/', name: 'Log in', mark: 'login' },
        { href: '/donate/', name: 'Donate' },
        { href: '/memberships/', name: 'Memberships' }
      ]
    },
    {
      href: '/philosophy/',
      name: 'Philosophy',
      children: [
        {
          href: '/philosophy/politics/',
          name: 'Politics',
          children: [
            {
              href: '/philosophy/politics/democratic/',
              name: 'Democratic Politics',
              children: [
                {
                  href: '/philosophy/politics/democratic/american/',
                  name: 'American Democratic Politics',
                  children: [
                    {
                      href: '/philosophy/politics/democratic/american/drp/',
                      name: 'DRP',
                      children: [
                        { href: 'https://drp-party-platform.theworldgovernmentincorporated.com/', name: 'Platform' },
                        { href: 'https://political-compass.theworldgovernmentincorporated.com/', name: 'Compass' },
                        { href: '/philosophy/politics/democratic/american/drp/donate/', name: 'Donate' },
                        { href: '/memberships/', name: 'Memberships' }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },
        { href: '/philosophy/poetry/', name: 'Poetry' }
      ]
    },
    {
      href: '/religion/',
      name: 'Religion',
      children: [
        {
          href: '/religion/the-church-of-the-second-coming-of-jesus-christ/',
          name: 'The Church of the Second Coming of Jesus Christ',
          children: [
            { href: '/religion/the-church-of-the-second-coming-of-jesus-christ/donate/', name: 'Donate' }
          ]
        }
      ]
    },
    {
      href: '/science/',
      name: 'Science',
      children: [
        { href: '/science/military-rd/', name: 'Military R&amp;D', children: [
          { href: '/science/military-rd/donate/', name: 'Donate' }
        ] },
        { href: '/science/immortality/', name: 'Immortality', children: [
          { href: '/science/immortality/donate/', name: 'Donate' }
        ] },
        { href: '/science/resurrection/', name: 'Resurrection', children: [
          { href: '/science/resurrection/donate/', name: 'Donate' }
        ] },
        { href: '/science/flight/', name: 'Flight', children: [
          { href: '/science/flight/donate/', name: 'Donate' }
        ] },
        { href: '/science/oceanic-travel/', name: 'Oceanic Travel', children: [
          { href: '/science/oceanic-travel/donate/', name: 'Donate' }
        ] },
        { href: '/science/interplanetary-travel/', name: 'Interplanetary Travel', children: [
          { href: '/science/interplanetary-travel/donate/', name: 'Donate' }
        ] }
      ]
    },
    {
      href: '/recreation/',
      name: 'Recreation',
      children: [
        { href: 'https://chess.theworldgovernmentincorporated.com/', name: 'Chess' }
      ]
    },
    {
      href: '/building/',
      name: 'Building',
      children: [
        { href: '/building/lands/', name: 'Lands' },
        { href: '/building/infrastructure/', name: 'Infrastructure' },
        { href: '/building/proper-supply-chains/', name: 'Proper Supply Chains' }
      ]
    },
    {
      href: '/trading/',
      name: 'Trading',
      children: [
        { href: '/trading/the-world-citizens-identities-exchange-wcie/', name: 'The World Citizens Identities Exchange (WCIE)' },
        { href: '/trading/the-grand-exchange/', name: 'The Grand Exchange' }
      ]
    }
  ];

  function norm(path) {
    if (!path || path === '/') return '/';
    return path.replace(/\/index\.html$/, '/').replace(/\/?$/, '/');
  }

  function here() {
    return norm(location.pathname);
  }

  var seq = 0;

  function render(items) {
    return items.map(function (item) {
      var current = here() === norm(item.href) ? ' aria-current="page"' : '';
      var link = '<a href="' + item.href + '"' + current + (item.mark ? ' data-nav="' + item.mark + '"' : '') + '>' + item.name + '</a>';
      if (item.mark === 'login') {
        return '<div class="nav-item" data-account-slot><span class="account-pending" aria-busy="true" aria-label="Account"></span>' + link.replace('<a ', '<a hidden ') + '</div>';
      }
      if (!item.children) return '<div class="nav-item">' + link + '</div>';
      var id = 'nav-branch-' + (++seq);
      return '<div class="nav-item">' + link +
        '<button type="button" class="expand" aria-expanded="false" aria-controls="' + id + '" aria-label="Show categories inside ' + item.name + '"><span aria-hidden="true">+</span></button>' +
        '</div><ul id="' + id + '" class="nav-sub" hidden>' + render(item.children) + '</ul>';
    }).join('');
  }

  function setBranch(btn, open) {
    var panel = document.getElementById(btn.getAttribute('aria-controls'));
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    var label = btn.getAttribute('aria-label') || '';
    var name = label.replace(/^(Show|Hide) categories inside /, '');
    btn.setAttribute('aria-label', (open ? 'Hide' : 'Show') + ' categories inside ' + name);
    var glyph = btn.querySelector('[aria-hidden]');
    if (glyph) glyph.textContent = open ? '\u2212' : '+';
    if (panel) panel.hidden = !open;
  }

  function wire(root) {
    root.querySelectorAll('.expand').forEach(function (btn) {
      if (btn.getAttribute('data-wired') === 'true') return;
      btn.setAttribute('data-wired', 'true');
      btn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        setBranch(btn, btn.getAttribute('aria-expanded') !== 'true');
      });
    });
  }

  if (menu) {
    menu.innerHTML = render(tree);
    wire(menu);
  }

  ensureAccountChrome();
  loadAccount();

  if (!button || !menu) return;

  function setOpen(open) {
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    menu.hidden = !open;
  }

  button.addEventListener('click', function (event) {
    event.stopPropagation();
    setOpen(button.getAttribute('aria-expanded') !== 'true');
  });

  document.addEventListener('click', function (event) {
    if (menu.hidden) return;
    if (button.contains(event.target) || menu.contains(event.target)) return;
    setOpen(false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    var active = document.activeElement;
    if (active && active.classList.contains('expand') && active.getAttribute('aria-expanded') === 'true' && !menu.contains(active)) {
      setBranch(active, false);
      return;
    }
    if (button.getAttribute('aria-expanded') !== 'true') return;
    setOpen(false);
    button.focus();
  });

  function ensureAccountChrome() {
    var path = here();
    if (path === '/login/' || path === '/account/') return;
    var header = document.querySelector('.site-header');
    if (!header) return;
    var bar = header.querySelector('.site-bar');
    if (bar && !document.getElementById('home-login')) {
      var login = document.createElement('div');
      login.id = 'home-login';
      login.className = 'home-account';
      login.setAttribute('aria-busy', 'true');
      var nav = bar.querySelector('.site-nav');
      if (nav) bar.insertBefore(login, nav);
      else bar.appendChild(login);
    }
    if (!document.getElementById('home-account')) {
      var chip = document.createElement('div');
      chip.id = 'home-account';
      chip.className = 'home-account-bar';
      chip.hidden = true;
      header.insertAdjacentElement('afterend', chip);
    }
  }

  function loadAccount() {
    function add(src, next) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = next || function () {};
      script.onerror = next || function () {};
      document.body.appendChild(script);
    }
    add('/assets/account-sections.js', function () {
      add('/assets/account.js');
    });
  }
})();
