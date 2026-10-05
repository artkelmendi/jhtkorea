(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ease = 'cubic-bezier(.23,1,.32,1)';
  const active = new WeakMap();
  const keyboard = () => document.documentElement.classList.contains('keyboard-navigation');
  document.addEventListener('keydown', () => document.documentElement.classList.add('keyboard-navigation'), {capture:true});
  document.addEventListener('pointerdown', () => document.documentElement.classList.remove('keyboard-navigation'), {capture:true,passive:true});
  function enter(element, { delay = 0, duration = 220, distance = 8 } = {}) {
    if (!element || reduced.matches || keyboard() || document.hidden) return;
    active.get(element)?.cancel();
    const motion = element.animate([
      { opacity: .5, transform: `translateY(${distance}px)` },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration, delay, easing: ease });
    active.set(element, motion);
    motion.finished.catch(() => {}).finally(() => {
      if (active.get(element) === motion) active.delete(element);
    });
  }
  function closeDialog(dialog) {
    if (!dialog?.open || dialog.dataset.closing) return;
    if (reduced.matches || keyboard()) { dialog.close(); return; }
    dialog.dataset.closing = 'true';
    const motion = dialog.animate([
      { opacity: 1, transform: 'translateY(0) scale(1)' },
      { opacity: 0, transform: 'translateY(6px) scale(.985)' }
    ], { duration: 160, easing: ease, fill: 'forwards' });
    motion.finished.catch(() => {}).finally(() => {
      dialog.close(); motion.cancel(); delete dialog.dataset.closing;
    });
  }
  // A decoded image replaces the current photo, so slow connections never reveal a blank frame.
  const photoTickets = new WeakMap();
  async function photo(element, src, alt) {
    const ticket = {}; photoTickets.set(element, ticket);
    const next = new Image(); next.src = src;
    element.parentElement?.setAttribute('aria-busy', 'true');
    try {
      await next.decode();
      if (photoTickets.get(element) !== ticket) return false;
      active.get(element)?.cancel();
      element.src = src; if (alt) element.alt = alt;
      if (!reduced.matches && !keyboard()) {
        const motion = element.animate([{ opacity: .65 }, { opacity: 1 }], { duration: 200, easing: ease });
        active.set(element, motion);
        motion.finished.catch(() => {}).finally(() => { if (active.get(element) === motion) active.delete(element); });
      }
      return true;
    } catch { return false; }
    finally { if (photoTickets.get(element) === ticket) element.parentElement?.removeAttribute('aria-busy'); }
  }
  function confirm({ title, message, label = 'Confirm' }) {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog'); dialog.className = 'auction-dialog auction-dialog-small ui-confirm';
      const header = document.createElement('div'); header.className = 'auction-dialog-head';
      const heading = document.createElement('h2'); heading.textContent = title; heading.id = 'ui-confirm-title'; header.append(heading);
      dialog.setAttribute('aria-labelledby', heading.id);
      const copy = document.createElement('p'); copy.className = 'ui-confirm-copy'; copy.textContent = message;
      const actions = document.createElement('div'); actions.className = 'auction-dialog-actions';
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'secondary-action'; cancel.textContent = 'Keep it';
      const accept = document.createElement('button'); accept.type = 'button'; accept.className = 'primary-action'; accept.textContent = label;
      let accepted = false;
      cancel.addEventListener('click', () => closeDialog(dialog));
      accept.addEventListener('click', () => { accepted = true; closeDialog(dialog); });
      dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(dialog); });
      dialog.addEventListener('close', () => { dialog.remove(); resolve(accepted); }, {once:true});
      actions.append(cancel, accept); dialog.append(header, copy, actions); document.body.append(dialog); dialog.showModal(); cancel.focus();
    });
  }
  window.JHTUI = { enter, closeDialog, photo, confirm };
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('cancel', event => {
      if (document.body.classList.contains('is-saving') || dialog.querySelector('#close-bid-confirm:disabled')) return;
      event.preventDefault(); closeDialog(dialog);
    });
  }
  // Private interfaces use vector controls too; mobile fonts cannot turn them into emoji.
  if (/^\/(admin|bidding)\//.test(location.pathname)) {
    const paths = { '↗': 'M7 17 17 7M9 7h8v8', '→': 'M5 12h14m-6-6 6 6-6 6', '←': 'M19 12H5m6-6-6 6 6 6', '×': 'm7 7 10 10M17 7 7 17' };
    function icons(root) {
      if (!root || root.parentElement?.closest('script,style,textarea,input')) return;
      const nodes = root.nodeType === 3 ? [root] : [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        if (!/[↗→←×]/.test(node.nodeValue) || node.parentElement?.closest('script,style,textarea')) continue;
        const fragment = document.createDocumentFragment();
        for (const part of node.nodeValue.split(/([↗→←×])/)) {
          if (!paths[part]) { fragment.append(document.createTextNode(part)); continue; }
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true'); svg.classList.add('ui-icon');
          const path = document.createElementNS(svg.namespaceURI,'path'); path.setAttribute('d',paths[part]);
          svg.append(path); fragment.append(svg);
        }
        node.replaceWith(fragment);
      }
    }
    icons(document.body);
    new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) icons(node); }).observe(document.body, {childList:true,subtree:true});
  }
})();
