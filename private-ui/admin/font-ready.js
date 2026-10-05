(() => {
  'use strict';
  const workspace = location.pathname.includes('/workspace');
  const display = workspace ? 'JHT Display' : 'JHTDisplay';
  const sans = workspace ? 'JHT Sans' : 'JHT';
  window.JHTAdminFontsReady = document.fonts
    ? Promise.allSettled([document.fonts.load(`900 36px "${display}"`), ...[400,650,800].map(weight=>document.fonts.load(`${weight} 14px "${sans}"`))])
    : Promise.resolve();
  window.JHTAdminFontsReady.then(() => document.documentElement.classList.add('admin-fonts-ready'));
})();
