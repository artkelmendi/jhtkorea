(() => {
  'use strict';

  const THEME_KEY = 'jht-admin-theme-v1';
  const state = {
    vehicles: [],
    filteredStatus: 'all',
    query: '',
    editingId: null,
    archiveId: null,
    photoUrls: [], photos: [], notices: [], noticeId: null, busy: false, deleteMode: false,
    homepage: { featuredId: '', showPrice: true, showLabel: true, arrivalOrder: 'automatic', arrivalIds: [] }
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const money = value => `$${Number(value || 0).toLocaleString('en-US')}`;
  const imagePath = value => {
    if (!value) return '/assets/car-1.webp';
    if (state.photoUrls.includes(value)) return value;
    return `/${window.JHTSecurity.assetPath(value)}`;
  };
  const slugify = value => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function showToast(message) {
    const toast = $('#admin-toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
  }

  async function api(path,body,method) {
    const result=await fetch('/api/'+path,{method:method||(body?'POST':'GET'),credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    let data;try{data=await result.json();}catch{throw Error('The server could not respond. Please try again.');}
    if(!result.ok){if(result.status===401||result.status===403){location.replace('/admin/');}throw Error(result.status===409?'This record changed. Reload the workspace before trying again.':data.error||'Could not save. Please try again.');}
    return data;
  }
  function writable(vehicle){return Object.fromEntries(['slug','brand','model','ref','body','fuel','transmission','year','price','mileage','seats','status','image','gallery','version'].filter(k=>vehicle[k]!==undefined).map(k=>[k,vehicle[k]]));}
  async function loadInventory(){
    const [inventory,homepage,notices]=await Promise.all([api('admin/vehicles'),api('admin/homepage'),api('admin/notices')]);
    state.vehicles=inventory.vehicles;
    state.homepage={featuredId:homepage.featured_id||'',showPrice:homepage.show_price,showLabel:homepage.show_label,arrivalOrder:homepage.arrival_order,arrivalIds:homepage.arrival_ids};
    state.notices=notices.notices;
    renderAll();renderNotices();
  }
  async function operate(action){if(state.busy)return;state.busy=true;document.body.classList.add('is-saving');try{await action();}catch(error){showToast(error.message);}finally{state.busy=false;document.body.classList.remove('is-saving');}}
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
        ${publicVisible ? `<a href="/cars/${escapeHTML(vehicle.slug)}/" target="_blank" rel="noopener" aria-label="View ${escapeHTML(title)} on website">${viewIcon}</a>` : ''}
        ${vehicle.status !== 'archived' ? `<button type="button" data-archive-id="${escapeHTML(vehicle.id)}" aria-label="Archive ${escapeHTML(title)}">${archiveIcon}</button>` : ''}
        <button type="button" data-delete-id="${escapeHTML(vehicle.id)}" aria-label="Delete ${escapeHTML(title)}">${archiveIcon}</button>
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
    renderManualArrivals();
  }

  function renderFeaturePreview() {
    const vehicle = state.vehicles.find(item => String(item.id) === String($('#featured-vehicle').value));
    const label = $('#feature-label');
    const price = $('#feature-price');
    label.hidden = !$('#feature-show-label').checked;
    price.hidden = !$('#feature-show-price').checked;
    if (!vehicle) {
      $('#feature-image').src = '/assets/car-1.webp';
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
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth' });
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
    if(state.busy)return;
    state.editingId = vehicle?.id || null;
    state.photoUrls.forEach(url => URL.revokeObjectURL(url));
    state.photoUrls = []; state.photos=[];
    $('#vehicle-form').reset();
    clearFieldErrors();
    $('#photo-preview').innerHTML = '';
    setFormValue('seats', 5);
    setFormValue('status', 'available');
    if (vehicle) {
      ['brand', 'model', 'year', 'ref', 'body', 'status', 'price', 'fuel', 'transmission', 'seats', 'mileage'].forEach(key => setFormValue(key, vehicle[key]));
      $('#editor-mode').textContent = vehicle.ref || 'Inventory record';
      $('#editor-title').textContent = `Edit ${vehicle.brand} ${vehicle.model}`;
      state.photos=[...new Set([vehicle.image,...(vehicle.gallery||[])])].filter(Boolean).map(path=>({path,url:imagePath(path)})); renderPhotos();
    } else {
      $('#editor-mode').textContent = 'New inventory record';
      $('#editor-title').textContent = 'Add vehicle';
    }
    state.editorTrigger=document.activeElement;$('.admin-shell').inert=true;
    $('#vehicle-editor').inert=false;$('#vehicle-editor').classList.add('is-open');
    $('#vehicle-editor').setAttribute('aria-hidden', 'false');
    $('#editor-backdrop').hidden = false;
    document.body.classList.add('editor-open');
    setTimeout(() => $('#car-brand').focus(), 120);
  }

  function closeEditor(force=false) {
    if(state.busy&&!force)return;
    $('#vehicle-editor').classList.remove('is-open');$('#vehicle-editor').inert=true;$('.admin-shell').inert=false;state.editorTrigger?.focus();
    $('#vehicle-editor').setAttribute('aria-hidden', 'true');
    $('#editor-backdrop').hidden = true;
    document.body.classList.remove('editor-open');
  }

  function renderPhotos(){
    $('#photo-preview').innerHTML=state.photos.map((photo,i)=>`<div><img src="${escapeHTML(photo.url)}" alt="Vehicle photo ${i+1}"><span class="photo-order">${i===0?'Cover':i+1}</span><button type="button" data-remove-photo="${i}" aria-label="Remove photo ${i+1}">×</button><div class="photo-tools"><button type="button" data-photo-left="${i}" ${i===0?'disabled':''} aria-label="Move photo ${i+1} earlier">←</button><button type="button" data-photo-right="${i}" ${i===state.photos.length-1?'disabled':''} aria-label="Move photo ${i+1} later">→</button></div></div>`).join('');
  }
  function previewPhotos(files){
    const selected=[...files];
    if(state.photos.length+selected.length>12||selected.some(file=>!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>4*1024*1024)){showToast('Choose up to 12 JPG, PNG or WebP photos, each under 4 MB.');return;}
    selected.forEach(file=>{const url=URL.createObjectURL(file);state.photoUrls.push(url);state.photos.push({file,url});});renderPhotos();$('#car-photos').value='';
  }
  async function uploadPhotos(){
    for(let i=0;i<state.photos.length;i++){
      const photo=state.photos[i];if(photo.path)continue;
      showToast(`Uploading photo ${i+1} of ${state.photos.length}…`);
      const result=await fetch('/api/admin/uploads',{method:'POST',credentials:'same-origin',headers:{'Content-Type':photo.file.type},body:photo.file});
      const data=await result.json();if(!result.ok)throw Error(data.error||'A photo could not be uploaded.');
      photo.path=data.path;
    }
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
    const entries = new FormData(form);
    const data = Object.fromEntries(['brand', 'model', 'year', 'ref', 'body', 'status', 'price', 'fuel', 'transmission', 'seats', 'mileage'].map(key => [key, entries.get(key)]));
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
      mileage: data.mileage ? Number(data.mileage) : null,
      status: statusOverride || data.status,
      image: state.photos[0]?.path, gallery: state.photos.map(photo=>photo.path),
      createdAt: previous?.createdAt || Date.now()
    };
  }

  async function saveVehicle(statusOverride){
    const vehicle=formVehicle(statusOverride);if(!vehicle)return;
    if(!state.photos.length){showToast('Add at least one vehicle photo before saving.');return;}
    await operate(async()=>{
      await uploadPhotos();vehicle.image=state.photos[0].path;vehicle.gallery=state.photos.map(photo=>photo.path);
      const existing=state.vehicles.find(v=>v.id===state.editingId);
      const result=await api('admin/vehicles'+(existing?'/'+existing.id:''),writable(vehicle),existing?'PUT':'POST');
      if(existing)state.vehicles[state.vehicles.indexOf(existing)]=result.vehicle;else state.vehicles.unshift(result.vehicle);
      renderAll();closeEditor(true);showToast(result.vehicle.status==='draft'?'Draft saved privately.':'Saved. The customer website is up to date.');
    });
  }
  function requestArchive(id,deleteMode=false) {
    state.deleteMode=deleteMode;$('#confirm-title').textContent=deleteMode?'Delete this vehicle permanently?':'Archive this vehicle?';$('#confirm-dialog p').textContent=deleteMode?'This removes the record from the database and website. You cannot undo this. Archive it if you may need it later.':'It will disappear from the public collection but remain in your workspace.';$('#confirm-archive').textContent=deleteMode?'Delete permanently':'Archive vehicle';
    state.archiveId = id;
    state.archiveTrigger=document.activeElement;$('.admin-shell').inert=true;
    $('#confirm-dialog').hidden = false;
    $('#cancel-archive').focus();
  }

  function closeArchiveDialog() {
    state.archiveId = null;
    $('#confirm-dialog').hidden = true;
    $('.admin-shell').inert=false;state.archiveTrigger?.focus();
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
    $('#photo-preview').addEventListener('click',event=>{
      const remove=event.target.closest('[data-remove-photo]'),left=event.target.closest('[data-photo-left]'),right=event.target.closest('[data-photo-right]');
      if(remove){const i=Number(remove.dataset.removePhoto);state.photos.splice(i,1);}
      if(left||right){const i=Number((left||right).dataset[left?'photoLeft':'photoRight']),j=i+(left?-1:1);if(j>=0&&j<state.photos.length)[state.photos[i],state.photos[j]]=[state.photos[j],state.photos[i]];}
      renderPhotos();
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
    $('#save-homepage').addEventListener('click',()=>operate(async()=>{
      const body={featured_id:$('#featured-vehicle').value||null,show_price:$('#feature-show-price').checked,show_label:$('#feature-show-label').checked,arrival_order:$('input[name="arrival-order"]:checked').value,arrival_ids:[...$('#manual-arrivals').querySelectorAll('select')].map(select=>select.value).filter(Boolean)};
      await api('admin/homepage',body,'PUT');state.homepage={featuredId:body.featured_id||'',showPrice:body.show_price,showLabel:body.show_label,arrivalOrder:body.arrival_order,arrivalIds:body.arrival_ids};renderAll();showToast('Homepage saved. Your feature and arrivals are live.');
    }));
    $$('input[name="arrival-order"]').forEach(input=>input.addEventListener('change',()=>{$('#manual-arrivals').hidden=input.value!=='manual';}));
    $('#cancel-archive').addEventListener('click',closeArchiveDialog);
    $('#confirm-archive').addEventListener('click',()=>operate(async()=>{
      const vehicle=state.vehicles.find(item=>item.id===state.archiveId);if(!vehicle)return;
      if(state.deleteMode){await api('admin/vehicles/'+vehicle.id,{version:vehicle.version},'DELETE');state.vehicles=state.vehicles.filter(v=>v.id!==vehicle.id);}
      else {const result=await api('admin/vehicles/'+vehicle.id,writable({...vehicle,status:'archived'}),'PUT');state.vehicles[state.vehicles.indexOf(vehicle)]=result.vehicle;}
      renderAll();closeArchiveDialog();showToast('Removed from the public website.');
    }));
    $('#confirm-dialog').addEventListener('click', event => { if (event.target === $('#confirm-dialog')) closeArchiveDialog(); });

    $('#preview-site').addEventListener('click', () => window.open('/', '_blank', 'noopener'));
    $('#workspace-signout').addEventListener('click',()=>operate(async()=>{await api('auth/logout',{});location.replace('/admin/');}));
    $('#new-notice').addEventListener('click',()=>openNotice());
    $('#notice-close').addEventListener('click',()=>$('#notice-editor').close());
    $('#notice-form').addEventListener('submit',event=>{event.preventDefault();saveNotice();});
    $('#notice-list').addEventListener('click',event=>{
      const edit=event.target.closest('[data-edit-notice]'),remove=event.target.closest('[data-delete-notice]');
      if(edit)openNotice(state.notices.find(n=>n.id===edit.dataset.editNotice));
      if(remove&&confirm('Delete this notice permanently?'))operate(async()=>{const notice=state.notices.find(n=>n.id===remove.dataset.deleteNotice);await api('admin/notices/'+notice.id,{version:notice.version},'DELETE');state.notices=state.notices.filter(n=>n.id!==notice.id);renderNotices();showToast('Notice deleted from the website.');});
    });
    $('#theme-button').addEventListener('click', toggleTheme);
    document.addEventListener('keydown', event => {
      if(state.busy)return;
      if(event.key==='Tab'&&!$('#confirm-dialog').hidden){const controls=[...$('#confirm-dialog').querySelectorAll('button')],first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
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
    const remove=event.target.closest('[data-delete-id]');if(remove)requestArchive(remove.dataset.deleteId,true);
    if (edit) openEditor(state.vehicles.find(vehicle => String(vehicle.id) === edit.dataset.editId));
    if (archive) requestArchive(archive.dataset.archiveId);
  }

  async function handleStatusChange(event){
    const select=event.target.closest('[data-status-id]');if(!select)return;
    const vehicle=state.vehicles.find(v=>v.id===select.dataset.statusId);if(!vehicle)return;
    const desired=select.value;select.value=vehicle.status;
    await operate(async()=>{const result=await api('admin/vehicles/'+vehicle.id,writable({...vehicle,status:desired}),'PUT');state.vehicles[state.vehicles.indexOf(vehicle)]=result.vehicle;renderAll();showToast(`${vehicle.brand} ${vehicle.model} is now ${desired}. Website updated.`);});
  }
  function renderManualArrivals(){
    const options=state.vehicles.filter(v=>v.status==='available').map(v=>`<option value="${escapeHTML(v.id)}">${escapeHTML(v.brand+' '+v.model+' · '+v.ref)}</option>`).join('');
    $('#manual-arrivals').innerHTML=Array.from({length:10},(_,i)=>`<label class="field"><span>Position ${i+1}</span><select data-position="${i}"><option value="">Leave empty</option>${options}</select></label>`).join('');
    $('#manual-arrivals').querySelectorAll('select').forEach((select,i)=>select.value=state.homepage.arrivalIds[i]||'');$('#manual-arrivals').hidden=state.homepage.arrivalOrder!=='manual';
  }
  function renderNotices(){
    $('#notice-list').innerHTML=state.notices.length?state.notices.map(n=>`<article><div><span class="notice-state">${escapeHTML(n.status)}</span><h2>${escapeHTML(n.title)}</h2><p>${escapeHTML(n.content.slice(0,160))}</p></div><div><button class="secondary-action" type="button" data-edit-notice="${escapeHTML(n.id)}">Edit notice</button><button class="secondary-action" type="button" data-delete-notice="${escapeHTML(n.id)}">Delete</button>${n.status==='published'?`<a class="text-action" href="/notices/${escapeHTML(n.slug)}/" target="_blank" rel="noopener">View</a>`:''}</div></article>`).join(''):'<div class="notice-empty"><p>No notices yet. Add an update for your customers.</p></div>';
  }
  function openNotice(notice){
    state.noticeId=notice?.id||null;const form=$('#notice-form');form.reset();for(const key of ['title','content','status'])form.elements[key].value=notice?.[key]||(key==='status'?'draft':'');$('#notice-error').textContent='';$('#notice-editor-title').textContent=notice?'Edit notice':'New notice';$('#notice-editor').showModal();
  }
  async function saveNotice(){
    await operate(async()=>{const previous=state.notices.find(n=>n.id===state.noticeId),form=$('#notice-form'),body={title:form.elements.title.value,content:form.elements.content.value,status:form.elements.status.value,slug:previous?.slug||slugify(form.elements.title.value).slice(0,80)+'-'+Date.now(),...(previous?{version:previous.version}:{})};
      const {notice}=await api('admin/notices'+(previous?'/'+previous.id:''),body,previous?'PUT':'POST');if(previous)state.notices[state.notices.indexOf(previous)]=notice;else state.notices.unshift(notice);renderNotices();$('#notice-editor').close();showToast('Notice saved. Published updates appear on the website.');});
  }
  function applyTheme(theme) {
    document.documentElement.dataset.adminTheme = theme;
    try{localStorage.setItem(THEME_KEY, theme);}catch{}
    $('#theme-button').setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }

  function toggleTheme() {
    applyTheme(document.documentElement.dataset.adminTheme === 'dark' ? 'light' : 'dark');
  }

  async function init(){
    try{
      const session=await api('auth/session');if(!session.mfaVerified||!session.accessEnabled){location.replace('/admin/');return;}
      try{applyTheme(localStorage.getItem(THEME_KEY)||'light');}catch{applyTheme('light');}
      wireEvents();$('#vehicle-editor').inert=true;
      $('#today-label').textContent=new Intl.DateTimeFormat('en',{weekday:'long',month:'long',day:'numeric'}).format(new Date());
      await loadInventory();$('.admin-shell').hidden=false;$('#workspace-status p').innerHTML='<strong>Live inventory</strong> Saved changes appear on the customer website. Sold, draft and archived cars stay private.';
      requestAnimationFrame(()=>{$('#welcome-overlay').classList.add('is-ready');setTimeout(()=>{$('#welcome-overlay').classList.add('is-finished');setTimeout(()=>$('#welcome-overlay').remove(),250);},matchMedia('(prefers-reduced-motion: reduce)').matches?200:850);});
      document.addEventListener('keydown',event=>{if(event.key!=='Tab'||!$('#vehicle-editor').classList.contains('is-open'))return;const controls=[...$('#vehicle-editor').querySelectorAll('button,input,select')].filter(el=>!el.disabled&&el.offsetParent!==null),first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}});
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)api('auth/session').catch(()=>{});});
    }catch(error){$('#welcome-overlay').innerHTML='<h1>Workspace unavailable.</h1><p></p><a href="/admin/">Return to sign-in</a>';$('#welcome-overlay p').textContent=error.message;$('#welcome-overlay').classList.add('is-ready');}
  }
  init();
})();
