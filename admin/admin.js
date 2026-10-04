(() => {
  'use strict';

  const INVENTORY_KEY = 'jht-admin-inventory-v1';
  const HOMEPAGE_KEY = 'jht-admin-homepage-v1';
  const THEME_KEY = 'jht-admin-theme-v1';
  const statusSeed = {
    'ck-2026-511': 'reserved',
    'ck-2026-486': 'sold',
    'ck-2026-340': 'draft',
    'ck-2026-251': 'archived'
  };

  const state = {
    vehicles: [],
    filteredStatus: 'all',
    query: '',
    editingId: null,
    archiveId: null,
    photoUrls: [],
    homepage: { featuredId: '', showPrice: true, showLabel: true, arrivalOrder: 'automatic' }
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const money = value => `$${Number(value || 0).toLocaleString('en-US')}`;
  const imagePath = value => {
    if (!value) return '../assets/car-1.webp';
    if (/^(blob:|data:|https?:)/.test(value)) return value;
    return value.startsWith('../') ? value : `../${value.replace(/^\.\//, '')}`;
  };
  const slugify = value => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function showToast(message) {
    const toast = $('#admin-toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
  }

  function persistInventory() {
    const safe = state.vehicles.map(vehicle => ({ ...vehicle, image: String(vehicle.image || '').startsWith('blob:') ? 'assets/car-1.webp' : vehicle.image }));
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(safe));
  }

  function loadHomepage() {
    try {
      state.homepage = { ...state.homepage, ...JSON.parse(localStorage.getItem(HOMEPAGE_KEY) || '{}') };
    } catch (_) {}
  }

  async function loadInventory() {
    let source = [];
    try {
      const response = await fetch('../cars.json');
      if (!response.ok) throw new Error('Inventory could not be loaded');
      source = await response.json();
    } catch (_) {
      showToast('The sample inventory could not be loaded. You can still add a vehicle.');
    }

    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(INVENTORY_KEY) || 'null'); } catch (_) {}
    state.vehicles = Array.isArray(stored) && stored.length
      ? stored
      : source.map((vehicle, index) => ({
          ...vehicle,
          id: vehicle.id || vehicle.slug || `vehicle-${index + 1}`,
          status: statusSeed[vehicle.slug] || 'available',
          createdAt: Date.now() - index * 86400000
        }));
    renderAll();
  }

  function statusOptions(current) {
    return ['available', 'reserved', 'sold', 'draft', 'archived']
      .map(status => `<option value="${status}"${status === current ? ' selected' : ''}>${status}</option>`).join('');
  }

  const editIcon = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m4 20 4.2-1 10.4-10.4a2.1 2.1 0 0 0-3-3L5.2 16zM14.5 6.5l3 3"/></svg>';
  const viewIcon = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 12s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5z"/><circle cx="12" cy="12" r="2"/></svg>';
  const archiveIcon = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M6 7v13h12V7M9 4h6l1 3M9 11h6"/></svg>';
  const starIcon = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 3 2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.9z"/></svg>';

  function rowMarkup(vehicle) {
    const title = `${vehicle.brand || ''} ${vehicle.model || ''}`.trim();
    const isFeatured = String(state.homepage.featuredId) === String(vehicle.id);
    const publicVisible = vehicle.status === 'available' || vehicle.status === 'reserved';
    return `<article class="vehicle-row" data-vehicle-id="${escapeHTML(vehicle.id)}">
      <div class="vehicle-identity"><img src="${escapeHTML(imagePath(vehicle.image))}" alt="" loading="lazy"><div><strong>${escapeHTML(title || 'Untitled vehicle')}</strong><span>${escapeHTML(vehicle.ref || 'No reference')} · ${escapeHTML(vehicle.year || 'Year pending')}</span></div></div>
      <div class="vehicle-price">${money(vehicle.price)}<small>Listed price</small></div>
      <select class="status-select status-${escapeHTML(vehicle.status)}" data-status-id="${escapeHTML(vehicle.id)}" aria-label="Status for ${escapeHTML(title)}">${statusOptions(vehicle.status)}</select>
      <span class="feature-mark${isFeatured ? ' is-featured' : ''}">${starIcon}${isFeatured ? 'Homepage feature' : 'Not featured'}</span>
      <div class="row-actions">
        <button type="button" data-edit-id="${escapeHTML(vehicle.id)}" aria-label="Edit ${escapeHTML(title)}">${editIcon}</button>
        ${publicVisible ? `<a href="../cars/${escapeHTML(vehicle.slug)}/" target="_blank" rel="noopener" aria-label="View ${escapeHTML(title)} on website">${viewIcon}</a>` : ''}
        ${vehicle.status !== 'archived' ? `<button type="button" data-archive-id="${escapeHTML(vehicle.id)}" aria-label="Archive ${escapeHTML(title)}">${archiveIcon}</button>` : ''}
      </div>
    </article>`;
  }

  function renderMetrics() {
    const counts = state.vehicles.reduce((result, vehicle) => {
      result[vehicle.status] = (result[vehicle.status] || 0) + 1;
      return result;
    }, {});
    $('#metric-total').textContent = state.vehicles.length;
    $('#metric-available').textContent = counts.available || 0;
    $('#metric-reserved').textContent = counts.reserved || 0;
    $('#metric-attention').textContent = (counts.draft || 0) + state.vehicles.filter(vehicle => !vehicle.price || !vehicle.image).length;
    $('#nav-inventory-count').textContent = state.vehicles.length;
  }

  function filteredVehicles() {
    const needle = state.query.trim().toLowerCase();
    let list = state.vehicles.filter(vehicle => {
      const matchesStatus = state.filteredStatus === 'all' || vehicle.status === state.filteredStatus;
      const haystack = `${vehicle.brand} ${vehicle.model} ${vehicle.ref} ${vehicle.year}`.toLowerCase();
      return matchesStatus && (!needle || haystack.includes(needle));
    });
    const sort = $('#inventory-sort').value;
    list = [...list].sort((a, b) => {
      if (sort === 'price-high') return Number(b.price) - Number(a.price);
      if (sort === 'price-low') return Number(a.price) - Number(b.price);
      if (sort === 'year') return Number(b.year) - Number(a.year);
      return Number(b.createdAt || 0) - Number(a.createdAt || 0);
    });
    return list;
  }

  function renderInventory() {
    const list = filteredVehicles();
    $('#inventory-vehicle-list').innerHTML = list.map(rowMarkup).join('');
    $('#inventory-empty').hidden = list.length > 0;
    $('#inventory-vehicle-list').hidden = list.length === 0;
    const overview = state.vehicles.filter(vehicle => vehicle.status !== 'archived').slice(0, 5);
    $('#overview-vehicle-list').innerHTML = overview.map(rowMarkup).join('');
  }

  function renderFeaturedSelector() {
    const select = $('#featured-vehicle');
    const available = state.vehicles.filter(vehicle => vehicle.status === 'available');
    select.innerHTML = '<option value="">Choose an available vehicle</option>' + available.map(vehicle => `<option value="${escapeHTML(vehicle.id)}">${escapeHTML(`${vehicle.brand} ${vehicle.model} · ${vehicle.ref}`)}</option>`).join('');
    if (available.some(vehicle => String(vehicle.id) === String(state.homepage.featuredId))) select.value = state.homepage.featuredId;
    else if (state.homepage.featuredId) state.homepage.featuredId = '';
    $('#feature-show-price').checked = state.homepage.showPrice;
    $('#feature-show-label').checked = state.homepage.showLabel;
    const arrival = $(`input[name="arrival-order"][value="${state.homepage.arrivalOrder}"]`);
    if (arrival) arrival.checked = true;
    renderFeaturePreview();
  }

  function renderFeaturePreview() {
    const vehicle = state.vehicles.find(item => String(item.id) === String($('#featured-vehicle').value));
    const label = $('#feature-label');
    const price = $('#feature-price');
    label.hidden = !$('#feature-show-label').checked;
    price.hidden = !$('#feature-show-price').checked;
    if (!vehicle) {
      $('#feature-image').src = '../assets/car-1.webp';
      $('#feature-image').alt = 'Selected featured vehicle';
      $('#feature-title').textContent = 'Choose a vehicle';
      $('#feature-meta').textContent = 'Your selection will appear here.';
      price.textContent = '—';
      $('#featured-task-copy').textContent = 'No featured vehicle selected';
      return;
    }
    const title = `${vehicle.brand} ${vehicle.model}`;
    $('#feature-image').src = imagePath(vehicle.image);
    $('#feature-image').alt = title;
    $('#feature-title').textContent = title;
    $('#feature-meta').textContent = `${vehicle.year} · ${vehicle.fuel || 'Fuel pending'} · ${vehicle.transmission || 'Transmission pending'}`;
    price.textContent = money(vehicle.price);
    $('#featured-task-copy').textContent = title;
  }

  function renderAll() {
    renderMetrics();
    renderInventory();
    renderFeaturedSelector();
  }

  function switchView(name) {
    $$('.admin-view').forEach(panel => {
      const active = panel.dataset.panel === name;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
    $$('.nav-item').forEach(button => button.classList.toggle('is-active', button.dataset.view === name));
    $('#current-view-label').textContent = name.charAt(0).toUpperCase() + name.slice(1);
    closeSidebar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openSidebar() {
    $('#admin-sidebar').classList.add('is-open');
    $('#sidebar-scrim').hidden = false;
    $('#sidebar-open').setAttribute('aria-expanded', 'true');
  }

  function closeSidebar() {
    $('#admin-sidebar').classList.remove('is-open');
    $('#sidebar-scrim').hidden = true;
    $('#sidebar-open').setAttribute('aria-expanded', 'false');
  }

  function clearFieldErrors() {
    $$('.field.has-error', $('#vehicle-form')).forEach(field => field.classList.remove('has-error'));
    $('#form-error').hidden = true;
  }

  function setFormValue(name, value) {
    const field = $(`[name="${name}"]`, $('#vehicle-form'));
    if (field) field.value = value ?? '';
  }

  function openEditor(vehicle = null) {
    state.editingId = vehicle?.id || null;
    state.photoUrls.forEach(url => URL.revokeObjectURL(url));
    state.photoUrls = [];
    $('#vehicle-form').reset();
    clearFieldErrors();
    $('#photo-preview').innerHTML = '';
    setFormValue('seats', 5);
    setFormValue('status', 'available');
    if (vehicle) {
      ['brand', 'model', 'year', 'ref', 'body', 'status', 'price', 'fuel', 'transmission', 'seats', 'mileage'].forEach(key => setFormValue(key, vehicle[key]));
      $('#editor-mode').textContent = vehicle.ref || 'Inventory record';
      $('#editor-title').textContent = `Edit ${vehicle.brand} ${vehicle.model}`;
      if (vehicle.image) $('#photo-preview').innerHTML = photoMarkup(imagePath(vehicle.image), -1, true);
    } else {
      $('#editor-mode').textContent = 'New inventory record';
      $('#editor-title').textContent = 'Add vehicle';
    }
    $('#vehicle-editor').classList.add('is-open');
    $('#vehicle-editor').setAttribute('aria-hidden', 'false');
    $('#editor-backdrop').hidden = false;
    document.body.classList.add('editor-open');
    setTimeout(() => $('#car-brand').focus(), 120);
  }

  function closeEditor() {
    $('#vehicle-editor').classList.remove('is-open');
    $('#vehicle-editor').setAttribute('aria-hidden', 'true');
    $('#editor-backdrop').hidden = true;
    document.body.classList.remove('editor-open');
  }

  function photoMarkup(src, index, existing = false) {
    return `<div><img src="${escapeHTML(src)}" alt="Vehicle photo preview"><button type="button" data-remove-photo="${index}"${existing ? ' data-existing-photo="true"' : ''} aria-label="Remove photo"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>`;
  }

  function previewPhotos(files) {
    state.photoUrls.forEach(url => URL.revokeObjectURL(url));
    state.photoUrls = [...files].slice(0, 12).map(file => URL.createObjectURL(file));
    $('#photo-preview').innerHTML = state.photoUrls.map((url, index) => photoMarkup(url, index)).join('');
  }

  function formVehicle(statusOverride) {
    clearFieldErrors();
    const form = $('#vehicle-form');
    const required = $$('[required]', form);
    let firstInvalid = null;
    required.forEach(field => {
      const invalid = !field.value.trim() || !field.checkValidity();
      field.closest('.field')?.classList.toggle('has-error', invalid);
      if (invalid && !firstInvalid) firstInvalid = field;
    });
    if (firstInvalid) {
      $('#form-error').hidden = false;
      $('#form-error').focus();
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return null;
    }
    const data = Object.fromEntries(new FormData(form).entries());
    const previous = state.vehicles.find(vehicle => String(vehicle.id) === String(state.editingId));
    const refSlug = slugify(data.ref);
    return {
      ...previous,
      ...data,
      id: previous?.id || `${refSlug}-${Date.now()}`,
      slug: previous?.slug || refSlug,
      year: Number(data.year),
      price: Number(data.price),
      seats: Number(data.seats || 5),
      mileage: data.mileage ? Number(data.mileage) : '',
      status: statusOverride || data.status,
      image: state.photoUrls[0] || previous?.image || 'assets/car-1.webp',
      createdAt: previous?.createdAt || Date.now()
    };
  }

  function saveVehicle(statusOverride) {
    const vehicle = formVehicle(statusOverride);
    if (!vehicle) return;
    const index = state.vehicles.findIndex(item => String(item.id) === String(vehicle.id));
    if (index >= 0) state.vehicles[index] = vehicle;
    else state.vehicles.unshift(vehicle);
    persistInventory();
    renderAll();
    closeEditor();
    showToast(statusOverride === 'draft' ? 'Draft saved on this device.' : 'Vehicle published in this preview.');
  }

  function requestArchive(id) {
    state.archiveId = id;
    $('#confirm-dialog').hidden = false;
    $('#cancel-archive').focus();
  }

  function closeArchiveDialog() {
    state.archiveId = null;
    $('#confirm-dialog').hidden = true;
  }

  function wireEvents() {
    $$('.nav-item').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
    $$('[data-view-jump]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.viewJump)));
    $$('[data-open-editor]').forEach(button => button.addEventListener('click', () => openEditor()));
    $('#sidebar-open').addEventListener('click', openSidebar);
    $('#sidebar-close').addEventListener('click', closeSidebar);
    $('#sidebar-scrim').addEventListener('click', closeSidebar);
    $('#editor-close').addEventListener('click', closeEditor);
    $('#editor-backdrop').addEventListener('click', closeEditor);
    $('#vehicle-form').addEventListener('submit', event => { event.preventDefault(); saveVehicle(); });
    $('#save-draft').addEventListener('click', () => saveVehicle('draft'));
    $('#car-photos').addEventListener('change', event => previewPhotos(event.target.files));
    $('#photo-drop').addEventListener('dragover', event => { event.preventDefault(); event.currentTarget.classList.add('is-dragging'); });
    $('#photo-drop').addEventListener('dragleave', event => event.currentTarget.classList.remove('is-dragging'));
    $('#photo-drop').addEventListener('drop', event => {
      event.preventDefault();
      event.currentTarget.classList.remove('is-dragging');
      previewPhotos([...event.dataTransfer.files].filter(file => file.type.startsWith('image/')));
    });
    $('#photo-preview').addEventListener('click', event => {
      const button = event.target.closest('[data-remove-photo]');
      if (!button) return;
      if (button.dataset.existingPhoto) button.parentElement.remove();
      else {
        const index = Number(button.dataset.removePhoto);
        URL.revokeObjectURL(state.photoUrls[index]);
        state.photoUrls.splice(index, 1);
        $('#photo-preview').innerHTML = state.photoUrls.map((url, itemIndex) => photoMarkup(url, itemIndex)).join('');
      }
    });

    $('#inventory-vehicle-list').addEventListener('click', handleVehicleAction);
    $('#overview-vehicle-list').addEventListener('click', handleVehicleAction);
    $('#inventory-vehicle-list').addEventListener('change', handleStatusChange);
    $('#overview-vehicle-list').addEventListener('change', handleStatusChange);

    $('#inventory-search').addEventListener('input', event => { state.query = event.target.value; renderInventory(); });
    $('#global-search').addEventListener('input', event => {
      state.query = event.target.value;
      $('#inventory-search').value = state.query;
      switchView('inventory');
      renderInventory();
    });
    $('#inventory-sort').addEventListener('change', renderInventory);
    $$('[data-status-filter]').forEach(button => button.addEventListener('click', () => {
      state.filteredStatus = button.dataset.statusFilter;
      $$('[data-status-filter]').forEach(item => item.classList.toggle('is-active', item === button));
      renderInventory();
    }));

    $('#featured-vehicle').addEventListener('change', renderFeaturePreview);
    $('#feature-show-price').addEventListener('change', renderFeaturePreview);
    $('#feature-show-label').addEventListener('change', renderFeaturePreview);
    $('#save-homepage').addEventListener('click', () => {
      state.homepage = {
        featuredId: $('#featured-vehicle').value,
        showPrice: $('#feature-show-price').checked,
        showLabel: $('#feature-show-label').checked,
        arrivalOrder: $('input[name="arrival-order"]:checked').value
      };
      localStorage.setItem(HOMEPAGE_KEY, JSON.stringify(state.homepage));
      renderAll();
      showToast('Homepage choices saved on this device.');
    });

    $('#cancel-archive').addEventListener('click', closeArchiveDialog);
    $('#confirm-archive').addEventListener('click', () => {
      const vehicle = state.vehicles.find(item => String(item.id) === String(state.archiveId));
      if (vehicle) vehicle.status = 'archived';
      persistInventory();
      renderAll();
      closeArchiveDialog();
      showToast('Vehicle archived. It is hidden from customers.');
    });
    $('#confirm-dialog').addEventListener('click', event => { if (event.target === $('#confirm-dialog')) closeArchiveDialog(); });

    $('#preview-site').addEventListener('click', () => window.open('../', '_blank', 'noopener'));
    $('.prototype-note button')?.addEventListener('click', event => event.currentTarget.closest('.prototype-note').remove());
    $('#new-notice').addEventListener('click', () => showToast('Notice editing will activate when the CMS is connected.'));
    $$('.notices-panel .secondary-action').forEach(button => button.addEventListener('click', () => showToast('Notice editing will activate when the CMS is connected.')));

    $('#theme-button').addEventListener('click', toggleTheme);
    document.addEventListener('keydown', event => {
      if (event.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) {
        event.preventDefault();
        $('#global-search').focus();
      }
      if (event.key === 'Escape') {
        if (!$('#confirm-dialog').hidden) closeArchiveDialog();
        else if ($('#vehicle-editor').classList.contains('is-open')) closeEditor();
        else closeSidebar();
      }
    });
  }

  function handleVehicleAction(event) {
    const edit = event.target.closest('[data-edit-id]');
    const archive = event.target.closest('[data-archive-id]');
    if (edit) openEditor(state.vehicles.find(vehicle => String(vehicle.id) === edit.dataset.editId));
    if (archive) requestArchive(archive.dataset.archiveId);
  }

  function handleStatusChange(event) {
    const select = event.target.closest('[data-status-id]');
    if (!select) return;
    const vehicle = state.vehicles.find(item => String(item.id) === select.dataset.statusId);
    if (!vehicle) return;
    vehicle.status = select.value;
    persistInventory();
    renderAll();
    showToast(`${vehicle.brand} ${vehicle.model} is now ${vehicle.status}.`);
  }

  function applyTheme(theme) {
    document.documentElement.dataset.adminTheme = theme;
    localStorage.setItem(THEME_KEY, theme);
    $('#theme-button').setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }

  function toggleTheme() {
    applyTheme(document.documentElement.dataset.adminTheme === 'dark' ? 'light' : 'dark');
  }

  function init() {
    applyTheme(localStorage.getItem(THEME_KEY) || 'light');
    loadHomepage();
    wireEvents();
    const now = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
    $('#today-label').textContent = now;
    loadInventory();
  }

  init();
})();
