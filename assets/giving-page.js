/* Paints #giving from assets/giving.js. An empty or non-Stripe url
   leaves the button disabled. */
(function (global) {
  function paymentLink(value) {
    try {
      var url = new URL(String(value || '').trim());
      var host = url.hostname.toLowerCase();
      if (url.protocol !== 'https:') return '';
      if (host !== 'buy.stripe.com' && host !== 'donate.stripe.com') return '';
      if (!url.pathname || url.pathname === '/') return '';
      return url.href;
    } catch (err) {
      return '';
    }
  }

  function closedMessage(kind) {
    var closed = (global.TWGIGiving && global.TWGIGiving.closed) || {};
    if (kind === 'membership') return closed.membership || 'Memberships open soon';
    return closed.donation || 'Donations open soon';
  }

  function render(root) {
    if (!root) root = document.getElementById('giving');
    if (!root) return;
    var config = global.TWGIGiving;
    var page = config && config.pages && config.pages[root.getAttribute('data-giving')];
    while (root.firstChild) root.removeChild(root.firstChild);
    var kind = page && page.kind === 'membership' ? 'membership' : 'donation';
    var tiers = (page && page.tiers) || [];
    if (!tiers.length) {
      var empty = document.createElement('p');
      empty.className = 'lead';
      empty.textContent = closedMessage(kind);
      root.appendChild(empty);
      return;
    }
    var list = document.createElement('div');
    list.className = 'giving';
    tiers.forEach(function (tier) {
      var article = document.createElement('article');
      var heading = document.createElement('h2');
      heading.textContent = String((tier && tier.label) || 'Placeholder tier');
      var note = document.createElement('p');
      note.textContent = String((tier && tier.note) || 'Placeholder. Amount not set.');
      article.appendChild(heading);
      article.appendChild(note);
      var href = paymentLink(tier && tier.url);
      if (href) {
        var link = document.createElement('a');
        link.className = 'take';
        link.href = href;
        link.rel = 'noopener noreferrer';
        link.textContent = String(tier.label || 'Continue');
        article.appendChild(link);
      } else {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'take';
        button.disabled = true;
        button.textContent = closedMessage(kind);
        article.appendChild(button);
      }
      list.appendChild(article);
    });
    root.appendChild(list);
  }

  if (!global.TWGIGiving) global.TWGIGiving = {};
  global.TWGIGiving.paymentLink = paymentLink;
  global.TWGIGiving.render = render;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { render(); });
  else render();
})(window);
