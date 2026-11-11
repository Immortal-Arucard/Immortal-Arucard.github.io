/* Democrapedia catalog for a future standalone app.
   The landing page is static HTML so it works with JavaScript off.
   Keep this list aligned with democrapedia/index.html.
   status "placeholder" means the entry is a marked stub, not a sourced article.
   The template page is not an entry.
*/
(function (global) {
  global.TWGIDemocrapedia = {
    app: {
      name: 'Democrapedia',
      startUrl: '/democrapedia/',
      manifest: '/democrapedia/manifest.webmanifest',
      scope: '/democrapedia/'
    },
    articles: [
      {
        slug: 'democratic-republican-party',
        title: 'Democratic-Republican Party',
        summary: 'Placeholder for the party page already published under American Democratic Politics.',
        status: 'placeholder',
        href: '/democrapedia/articles/democratic-republican-party/'
      },
      {
        slug: 'drp-compass',
        title: 'DRP Compass',
        summary: 'Placeholder for the party platform test. The test itself lives on the Compass site.',
        status: 'placeholder',
        href: '/democrapedia/articles/drp-compass/'
      },
      {
        slug: 'democracy',
        title: 'Democracy',
        summary: 'Placeholder for the encyclopedia entry. No definition is written here yet.',
        status: 'placeholder',
        href: '/democrapedia/articles/democracy/'
      }
    ]
  };
})(window);
