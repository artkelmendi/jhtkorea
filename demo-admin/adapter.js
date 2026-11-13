(() => {
  'use strict';
  const key = 'jht-static-admin-demo-v1';
  const seed = window.JHTDemoFixtures;
  let state = structuredClone(seed);
  try {
    const saved = localStorage.getItem(key);
    if (saved) state = JSON.parse(saved);
  } catch {}
  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: {'Content-Type': 'application/json'}
  });
  function save(next) {
    localStorage.setItem(key, JSON.stringify(next));
    state = next;
  }
  function record(next, action, label) {
    next['admin/activity'].events.unshift({action, record:label, actor:'Demo admin', at:new Date().toISOString()});
    next['admin/activity'].events.length = Math.min(next['admin/activity'].events.length, 40);
  }
  async function photo(file) {
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw Error('Choose a JPG, PNG or WebP photo.');
    const image = await createImageBitmap(file);
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 960 / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL('image/webp', 0.72);
      if (!url.startsWith('data:image/webp;base64,') || url.length > 500000) throw Error('Choose a smaller photo for this browser demo.');
      return url;
    } finally { image.close(); }
  }
  const cell = value => {
    let text = String(value ?? '');
    if (/^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  async function request(raw, options = {}) {
    const url = new URL(raw, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return json({error:'This action is unavailable in the static demo.'}, 404);
    const route = url.pathname.slice(5), method = options.method || 'GET';
    try {
      if (route === 'auth/session' && method === 'GET') return await fetch('/api/auth/demo/session',{cache:'no-store'});
      if (route === 'auth/logout' && method === 'POST') return await fetch('/api/auth/demo/logout',{method:'POST',cache:'no-store'});
      if (route === 'admin/stock.csv' && method === 'GET') {
        const keys = ['ref','brand','model','year','price','mileage','status'];
        const csv = [keys, ...state['admin/vehicles'].vehicles.map(v => keys.map(k => v[k]))].map(row=>row.map(cell).join(',')).join('\r\n');
        return new Response('\uFEFF'+csv, {headers:{'Content-Type':'text/csv; charset=utf-8'}});
      }
      if (route === 'admin/activity' && method === 'GET') {
        const category = url.searchParams.get('category');
        const prefixes = {inventory:['vehicle.','photo.','stock.'], website:['homepage.','site.','notice.'], bidding:['auction.','bidder.','bid.']};
        const selected = prefixes[category];
        const events = state[route].events.filter(e => !selected || selected.some(prefix => e.action.startsWith(prefix)));
        return json({events,nextCursor:null});
      }
      if (method === 'GET' && Object.hasOwn(state, route)) return json(state[route]);
      if (route === 'admin/uploads' && method === 'POST') return json({path:await photo(options.body)});
      const body = JSON.parse(options.body || '{}'), next = structuredClone(state);
      const match = route.match(/^admin\/(vehicles|notices)(?:\/([a-f0-9-]+))?$/);
      if (match && ['POST','PUT','DELETE'].includes(method)) {
        const [,group,id] = match, items = next['admin/'+group][group];
        const previous = items.find(item=>item.id===id);
        if (method !== 'POST' && !previous) return json({error:'This demo item no longer exists.'}, 404);
        if (previous && previous.version !== body.version) return json({error:'Reload this demo item before saving.'}, 409);
        const label = group === 'vehicles' ? 'vehicle' : 'notice';
        if (method === 'DELETE') {
          items.splice(items.indexOf(previous), 1);
          if (group === 'vehicles') {
            const home = next['admin/homepage'];
            if (home.featured_id === id) home.featured_id = null;
            home.arrival_ids = home.arrival_ids.filter(value=>value!==id);
          }
          record(next,label+'.delete.success',previous.ref || previous.title);
          save(next);
          return json({deleted:true});
        }
        if (items.some(item=>item.slug===body.slug && item.id!==id)) return json({error:'Use a unique listing URL.'}, 409);
        const item = {...previous, ...body, id:previous?.id || crypto.randomUUID(), version:(previous?.version || 0)+1};
        if (group === 'vehicles') item.createdAt = previous?.createdAt || Date.now();
        else item.created_at = previous?.created_at || new Date().toISOString();
        if (previous) items[items.indexOf(previous)] = item;
        else items.unshift(item);
        record(next,label+(previous?'.update.success':'.create.success'),item.ref || item.title);
        save(next);
        return json({[label]:item});
      }
      if (route==='admin/homepage' && method==='PUT') {
        next[route] = body;
        record(next,'homepage.update.success','Homepage');
        save(next);
        return json({saved:true});
      }
      if (route==='admin/site' && method==='PUT') {
        if (body.version!==state[route].version) return json({error:'Reload settings before saving.'},409);
        const {version,...settings} = body;
        next[route] = {settings,version:version+1,updatedAt:new Date().toISOString()};
        record(next,'site.update.success','Website settings');
        save(next);
        return json(next[route]);
      }
      return json({error:'This action is unavailable in the static demo.'},404);
    } catch (error) {
      return json({error:error.name==='QuotaExceededError'?'Demo storage is full. Remove a sample listing or reset the demo.':error.message || 'This demo change could not be saved.'},400);
    }
  }
  async function checkSession() {
    const response = await request('/api/auth/session');
    if (response.ok && (await response.json()).demo) return;
    location.replace('/admin/');
    throw Error('Sign in again to continue.');
  }
  window.JHTStaticDemo = {request, checkSession, isLocalPhoto:value=>typeof value==='string' && /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(value) && value.length<=500000};
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('reset-static-demo').addEventListener('click', async () => {
      if (!await window.JHTUI.confirm({title:'Reset the sample data?',message:'This clears changes made in this browser demo only.',label:'Reset sample data'})) return;
      localStorage.removeItem(key);
      location.replace(location.pathname);
    });
  });
})();
