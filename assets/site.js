(function () {
  var button = document.querySelector('.menu-btn');
  var menu = document.getElementById('site-menu');
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
    if (button.getAttribute('aria-expanded') !== 'true') return;
    setOpen(false);
    button.focus();
  });
})();
