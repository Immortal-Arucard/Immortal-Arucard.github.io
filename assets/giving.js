/* Giving config. Edit this file to change tiers or turn payments on.
   Leave url as "" until Stripe is ready. A Stripe Payment Link on
   https://buy.stripe.com/ or https://donate.stripe.com/ enables that
   button. Any other value stays disabled. Do not put secrets here.
   Labels are placeholders. Amounts are not set.
   To add a science project: add a pages entry, copy one science donate
   page, point data-giving at the new id, then add the menu child and
   the service-worker paths. */
(function (global) {
  global.TWGIGiving = {
    closed: {
      donation: 'Donations open soon',
      membership: 'Memberships open soon'
    },
    pages: {
      church: {
        kind: 'donation',
        tiers: [
          { id: 'placeholder', label: 'Placeholder tier', note: 'Placeholder. Amount not set.', url: '' }
        ]
      },
      twgi: {
        kind: 'donation',
        tiers: [
          { id: 'placeholder', label: 'Placeholder tier', note: 'Placeholder. Amount not set.', url: '' }
        ]
      },
      drp: {
        kind: 'donation',
        tiers: [
          { id: 'placeholder', label: 'Placeholder tier', note: 'Placeholder. Amount not set.', url: '' }
        ]
      },
      'science-military-rd': {
        kind: 'donation',
        tiers: [
          { id: 'placeholder', label: 'Placeholder tier', note: 'Placeholder. Amount not set.', url: '' }
        ]
      },
      'science-immortality': {
        kind: 'donation',
        tiers: [
          { id: 'placeholder', label: 'Placeholder tier', note: 'Placeholder. Amount not set.', url: '' }
        ]
      },
      'science-resurrection': {
        kind: 'donation',
        tiers: [
          { id: 'placeholder', label: 'Placeholder tier', note: 'Placeholder. Amount not set.', url: '' }
        ]
      },
      'science-flight': {
        kind: 'donation',
        tiers: [
          { id: 'placeholder', label: 'Placeholder tier', note: 'Placeholder. Amount not set.', url: '' }
        ]
      },
      'science-oceanic-travel': {
        kind: 'donation',
        tiers: [
          { id: 'placeholder', label: 'Placeholder tier', note: 'Placeholder. Amount not set.', url: '' }
        ]
      },
      'science-interplanetary-travel': {
        kind: 'donation',
        tiers: [
          { id: 'placeholder', label: 'Placeholder tier', note: 'Placeholder. Amount not set.', url: '' }
        ]
      },
      memberships: {
        kind: 'membership',
        tiers: [
          { id: 'paid-twgi', label: 'Paid TWGI', note: 'Placeholder. Amount not set.', url: '' },
          { id: 'paid-drp', label: 'Paid DRP', note: 'Placeholder. Amount not set.', url: '' }
        ]
      }
    }
  };
})(window);
