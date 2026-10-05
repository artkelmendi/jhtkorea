(() => {
  'use strict';
  const root = document.documentElement;
  root.classList.add('public-type-loading');
  // Runs before the body paints, after the font stylesheets are ready.
  const fonts = ['900 48px "Archivo SemiExpanded JHT"', '400 16px "DM Sans"'];
  if (document.currentScript?.dataset.display === 'expanded') fonts.push('900 48px "Archivo Expanded JHT"');
  window.JHTPublicFontsReady = document.fonts ? Promise.allSettled(fonts.map(font => document.fonts.load(font))) : Promise.resolve();
  // Keep the content readable if the main motion script fails to load.
  window.addEventListener('load', () => window.JHTPublicFontsReady.then(() => {
    setTimeout(() => root.classList.remove('public-type-loading'), 2000);
  }), {once:true});
})();
