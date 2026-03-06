<script>
const SVG_CHECK=`<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path d="M5 13l4 4L19 7"/></svg>`;
const gid=id=>document.getElementById(id);
const qsa=sel=>document.querySelectorAll(sel);
const SUPABASE_URL  = 'https://zqwilzhwiwrqgjyptfoo.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpxd2lsemh3aXdycWdqeXB0Zm9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTk5Mzg1OTYsImV4cCI6MjAzNTUxNDU5Nn0.uWuBgX2d6PSiaveuAVBj-h6h6efHIiWIRGrsW0MH0qQ';
const STORAGE_BUCKET = 'location-images';
const LOGIN_URL='/admin-login',LOCATIONS_URL='/admin-locations';
function getSession(){try{return JSON.parse(sessionStorage.getItem('jrn_session'));}catch(e){return null;}}
function clearSession(){sessionStorage.removeItem('jrn_session');}
function getAuthToken(){const s=getSession();return s?.access_token||null;}
function signOut(){clearSession();window.location.href=LOGIN_URL;}
(function(){const s=getSession();if(!s||!s.access_token){window.location.href=LOGIN_URL;return;}if(s.expires_at&&Date.now()/1000>s.expires_at-60){clearSession();window.location.href=LOGIN_URL;}})();
async function sbFetch(path, opts = {}) {
  const token=getAuthToken();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      'apikey': SUPABASE_ANON,
      'Authorization': `Bearer ${token||SUPABASE_ANON}`,
      'Content-Type': 'application/json',
      'Prefer': opts.prefer || 'return=representation',
      ...opts.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 401) { clearSession(); window.location.href = LOGIN_URL; return; }
    const err = await res.text();
    throw new Error(`Supabase error ${res.status}: ${err}`);
  }
  if (res.status === 204) return null;
  return res.json();
}
async function uploadImage(file, folder = 'profile') {
  const token=getAuthToken();
  const ext=file.name.split('.').pop();
  const path=`${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const res  = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON,
      'Authorization': `Bearer ${token||SUPABASE_ANON}`,
      'Content-Type': file.type,
    },
    body: file,
  });
  if (!res.ok) throw new Error('Image upload failed');
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}
function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}
function showToast(msg, type = 'success') {
  const wrap = gid('toast-wrap');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icon = type === 'success'
    ? '<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path d="M5 13l4 4L19 7"/></svg>'
    : '<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"/></svg>';
  t.innerHTML = `${icon}<span>${msg}</span>`;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
let CITIES_DATA = [];
function updateBadges(locCount, evtCount) {
  const b=document.getElementById('nav_badge');if(b)b.textContent=locCount;
  const e=document.getElementById('nav_badge_events');if(e)e.textContent=evtCount;
}
let _lastActionTime=null;
function updateLastUpdated(iso){if(iso)_lastActionTime=iso;const d=iso?new Date(iso):new Date();
const ds=d.toLocaleDateString('en-US',{month:'short',day:'numeric'});const ts=d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});const today=d.toDateString()===new Date().toDateString();document.querySelectorAll('[class*="card_component"]').forEach(card=>{const lbl=card.querySelector('[class*="card_label"]');if(lbl&&lbl.textContent.trim().toUpperCase().includes('LAST UPDATED')){const v=card.querySelector('[class*="card_value"]');const s=card.querySelector('[class*="card_sub"]');if(v)v.textContent=today?'Today':ds;if(s)s.textContent=today?ts:`${ds}, ${ts}`;}});}
async function loadReferenceData() {
  const [cities] = await Promise.all([
    sbFetch('cities?select=id,name&order=name'),
  ]);
  CITIES_DATA = cities || [];
  const citySelects = ['f-city'];
  citySelects.forEach(id => {
    const sel = gid(id);
    if (!sel) return;
    const placeholder = sel.options[0];
    sel.innerHTML = '';
    sel.appendChild(placeholder);
    CITIES_DATA.forEach(c => {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.name;
      sel.appendChild(o);
    });
  });
  const cityFilter = gid('city-select');
  if (cityFilter) {
    const allOpt = cityFilter.options[0];
    cityFilter.innerHTML = '';
    cityFilter.appendChild(allOpt);
    CITIES_DATA.forEach(c => {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.name;
      cityFilter.appendChild(o);
    });
  }
}
function getCityName(cityId) {
  const c = CITIES_DATA.find(c => c.id === cityId);
  return c ? c.name : '—';
}
async function getOrCreateCity(name,lat,lng){if(!name||name==='__new__')return null;const ex=CITIES_DATA.find(c=>c.name.toLowerCase()===name.toLowerCase());if(ex)return ex.id;const res=await sbFetch('cities',{method:'POST',body:JSON.stringify({name:name.trim(),slug:generateSlug(name),latitude:lat||0,longitude:lng||0})});const city=Array.isArray(res)?res[0]:res;if(city?.id){CITIES_DATA.push(city);['f-city','city-select'].forEach(id=>{const s=gid(id);if(!s)return;const o=document.createElement('option');o.value=city.id;o.textContent=city.name;s.appendChild(o);});return city.id;}return null;}
function formatDateRange(startDate, endDate) {
  if (!startDate) return '—';
  const fmt = d => {
    const [y,m,day] = d.split('-');
    return new Date(+y,+m-1,+day).toLocaleDateString('en-US',{month:'short',day:'numeric'});
  };
  if (!endDate || endDate === startDate) return fmt(startDate);
  const s=new Date(startDate.split('-')[0],+startDate.split('-')[1]-1,+startDate.split('-')[2]);
  const e=new Date(endDate.split('-')[0],+endDate.split('-')[1]-1,+endDate.split('-')[2]);
  if(s.getMonth()===e.getMonth()) return `${fmt(startDate)}–${+endDate.split('-')[2]}`;
  return `${fmt(startDate)}–${fmt(endDate)}`;
}
function isUpcoming(startDate) {
  if (!startDate) return false;
  const [y,m,d] = startDate.split('-');
  const start = new Date(+y,+m-1,+d);
  const today = new Date(); today.setHours(0,0,0,0);
  return start >= today;
}
async function loadAndRenderTable() {
  const tbody = gid('table-body');
  if (!tbody) return;
  tbody.innerHTML='<div class="ld-state"><div class="ld-spin"></div><div class="ld-txt">Loading...</div></div>';
  try {
    const [events, locData] = await Promise.all([
      sbFetch('events?select=id,name,address,city_id,profile_image,speechify_link,start_date,end_date,start_time,end_time,slug,updated_at&order=start_date'),
      sbFetch('locations?select=id'),
    ]);
    const evts = events || [];
    const locCount = (locData||[]).length;
    const evtCount = evts.length;
    const upcomingCount = evts.filter(e=>{
    if(!e.start_date)return false;
    const now=new Date(),d=new Date(e.start_date);
    return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();
  }).length;
    renderTable(evts);
    const _st=gid('stat-total');if(_st){_st.textContent=evtCount;const _ss=_st.closest('[class*="card_component"]')?.querySelector('[class*="card_sub"]');if(_ss)_ss.textContent='Total Events';}
    const _sc=gid('stat-cities');if(_sc){_sc.textContent=upcomingCount;const _scs=_sc.closest('[class*="card_component"]')?.querySelector('[class*="card_sub"]');if(_scs)_scs.textContent='Upcoming this month';}
    updateBadges(locCount, evtCount);
    const effective=[evts.map(e=>e.updated_at).filter(Boolean).sort().reverse()[0],_lastActionTime].filter(Boolean).sort().reverse()[0];
    if(effective)updateLastUpdated(effective);
  } catch (e) {
    tbody.innerHTML = `<div class="empty-state"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg><div class="empty-title">Failed to load</div><div class="empty-sub">${e.message}</div></div>`;
  }
}
function renderTable(events) {
  const tbody    = gid('table-body');
  const filtered = applySortFilter(events);
  const _tot=_AL?.length||events.length;
  if (filtered.length === 0) {
    tbody.innerHTML = `<div class="empty-state"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg><div class="empty-title">No results</div><div class="empty-sub"></div></div>`;
    return;
  }
  tbody.innerHTML = filtered.map(e => {
    const cityName=getCityName(e.city_id);
    const dateStr=formatDateRange(e.start_date,e.end_date);
    const upcoming=isUpcoming(e.start_date);
    const dateBadge=upcoming
      ?`<span class="city-tag" style="background:#f0fdf4;color:#16a34a;border-color:transparent">${dateStr}</span>`
      :`<span class="city-tag" style="background:var(--gray-100);color:var(--gray-400);border-color:transparent">${dateStr}</span>`;
    const audioIcon=e.speechify_link
      ? `<span title="Audio" class="audio-icon">
           <svg width="8" height="8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zm-1 16.93V22h2v-2.07A7 7 0 0019 13h-2a5 5 0 01-10 0H5a7 7 0 006 6.93z"/></svg>
         </span>` : '';
    return `<div class="table-row" onclick="openEditModal('${e.id}')"><div><div style="display:flex;align-items:center;gap:6px"><div class="loc-name">${e.name}</div>${audioIcon}
        </div><div class="loc-addr">${e.address || '—'}</div></div><div>${dateBadge}</div><div><span class="city-tag">${cityName}</span></div><div class="row-actions"><button class="icon-btn" onclick="event.stopPropagation();openEditModal('${e.id}')"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.4-9.4a2 2 0 112.8 2.8L11.8 15H9v-2.8l8.6-8.6z"/></svg></button><button class="icon-btn danger" onclick="event.stopPropagation();deleteEvent('${e.id}')"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button></div></div>`;
  }).join('');
  _AL=events;
}
let _AL=null;let _sortKey='start_date',_sortDir='asc';
function onSortChange(v){[_sortKey,_sortDir]=v.split('-');filterTable();}
function applySortFilter(evts){
  const s=(gid('search-input')?.value||'').toLowerCase();
  const cf=gid('city-select')?.value||'';
  let f=evts.filter(e=>{
    const mc=!cf||e.city_id===cf;
    const cn=getCityName(e.city_id).toLowerCase();
    return mc&&(!s||e.name?.toLowerCase().includes(s)||e.address?.toLowerCase().includes(s)||cn.includes(s));
  });
  f.sort((a,b)=>{
    let av='',bv='';
    if(_sortKey==='name'){av=a.name?.toLowerCase()||'';bv=b.name?.toLowerCase()||'';}
    else if(_sortKey==='city'){av=getCityName(a.city_id).toLowerCase();bv=getCityName(b.city_id).toLowerCase();}
    else if(_sortKey==='date'){av=a.start_date||'';bv=b.start_date||'';}
    else if(_sortKey==='updated'){av=a.updated_at||'';bv=b.updated_at||'';}
    return av<bv?(_sortDir==='asc'?-1:1):av>bv?(_sortDir==='asc'?1:-1):0;
  });
  return f;
}
function filterTable(){_AL&&renderTable(_AL);}
async function deleteEvent(id) {
  if(!confirm('Delete this event? This cannot be undone.'))return;
  try {
    await sbFetch(`events?id=eq.${id}`, {method:'DELETE',prefer:'return=minimal'});
    showToast('Event deleted.');
    updateLastUpdated(new Date().toISOString());
    loadAndRenderTable();
  }catch(e){showToast('Delete failed: '+e.message,'error');}
}
let profileImageUrl=null;
function switchImgTab(field, mode, btn) {
  const tabs   = btn.closest('.img-tabs').querySelectorAll('.img-tab');
  tabs.forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  gid(`${field}-upload-panel`).style.display = mode === 'upload' ? '' : 'none';
  gid(`${field}-url-panel`).style.display    = mode === 'url'    ? '' : 'none';
}
async function handleProfileFile(file) {
  if (!file) return;
  const preview = gid('profile-preview');
  const dropZone = gid('profile-drop-zone');
  preview.innerHTML = `<div class="img-uploading"><div class="ld-spin"></div>Uploading...</div>`;
  preview.style.display = '';
  dropZone.style.display = 'none';
  try {
    profileImageUrl = await uploadImage(file, 'profile');
    preview.innerHTML = `<div class="img-preview">
      <img src="${profileImageUrl}" alt="Profile">
      <span class="img-preview-name">${file.name}</span>
      <button class="img-preview-remove" onclick="clearProfileImage()">
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>`;
  } catch (e) {
    showToast('Image upload failed: ' + e.message, 'error');
    preview.style.display = 'none';
    dropZone.style.display = '';
    profileImageUrl = null;
  }
}
function clearProfileImage() {
  profileImageUrl = null;
  gid('profile-preview').style.display = 'none';
  gid('profile-preview').innerHTML = '';
  gid('profile-drop-zone').style.display = '';
  gid('profile-file-input').value = '';
}
function resetImageState() {
  profileImageUrl = null;
  clearProfileImage();
  gid('f-profile-url').value = '';
  qsa('#modal-event .img-tab').forEach((t,i) => t.classList.toggle('active', i===0));
  gid('profile-upload-panel').style.display = '';
  gid('profile-url-panel').style.display    = 'none';
}
let editingId = null;
function toggleNewCity(sel){const n=gid('f-new-city');if(!n)return;if(sel.value==='__new__'){n.style.display='';n.focus();}else{n.style.display='none';n.value='';}}
function openAddModal() {
  editingId = null;
  gid('modal-title').textContent = 'Add Event';
  gid('f-name').value      = '';
  gid('f-addr').value      = '';
  gid('f-desc').value      = '';
  gid('f-start-date').value= '';
  gid('f-end-date').value  = '';
  gid('f-start-time').value= '';
  gid('f-end-time').value  = '';
  gid('f-lat').value       = '';
  gid('f-lng').value       = '';
  gid('f-city').value      = '';
  if(gid('f-new-city')){gid('f-new-city').value='';gid('f-new-city').style.display='none';}
  gid('f-website').value   = '';
  gid('f-speechify').value = '';
  resetImageState();
  gid('modal-event').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function setProfilePreview(url) {
  profileImageUrl = url;
  gid('profile-drop-zone').style.display = 'none';
  gid('profile-preview').style.display = '';
  gid('profile-preview').innerHTML = `<div class="img-preview"><img src="${url}" alt="Profile"><span class="img-preview-name">Current image</span><button class="img-preview-remove" onclick="clearProfileImage()"><svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"/></svg></button></div>`;
}
async function openEditModal(id) {
  try {
    const [evt] = await sbFetch(`events?id=eq.${id}&select=*`);
    if (!evt) return;
    editingId = id;
    gid('modal-title').textContent  = 'Edit Event';
    gid('f-name').value             = evt.name    || '';
    gid('f-addr').value             = evt.address || '';
    gid('f-desc').value             = evt.description || '';
    gid('f-start-date').value       = evt.start_date || '';
    gid('f-end-date').value         = evt.end_date   || '';
    gid('f-start-time').value       = evt.start_time ? evt.start_time.slice(0,5) : '';
    gid('f-end-time').value         = evt.end_time   ? evt.end_time.slice(0,5)   : '';
    gid('f-lat').value              = evt.latitude  != null ? evt.latitude  : '';
    gid('f-lng').value              = evt.longitude != null ? evt.longitude : '';
    gid('f-city').value             = evt.city_id   || '';
    gid('f-website').value          = evt.website   || '';
    gid('f-speechify').value        = evt.speechify_link || '';
    resetImageState();
    if (evt.profile_image) setProfilePreview(evt.profile_image);
    gid('modal-event').classList.add('open');
    document.body.style.overflow = 'hidden';
  } catch (e) {
    showToast('Load error: ' + e.message, 'error');
  }
}
function openImportModal() {
  resetImportModal();
  const hint = gid('city-hint');
  if (hint && CITIES_DATA.length) {
    hint.textContent = CITIES_DATA.map(c => c.name).join(', ');
  }
  gid('modal-import').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function resetImportModal() {
  gid('imp-upload').style.display  = '';
  gid('imp-preview').style.display = 'none';
  gid('btn-imp-ok').style.display  = 'none';
  gid('imp-file').value = '';
  gid('imp-content').innerHTML  = '';
  window._importRows = null;
}
function parseCSV(text) {
  const lines  = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const nonEmpty = lines.filter(l => l.trim());
  if (nonEmpty.length < 2) return { headers: [], rows: [] };
  function splitRow(line) {
    const cols = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && !inQuote) { inQuote = true; }
      else if (ch === '"' && inQuote && line[i+1] === '"') { cur += '"'; i++; }
      else if (ch === '"' && inQuote) { inQuote = false; }
      else if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur.trim());
    return cols;
  }
  const headers = splitRow(nonEmpty[0]).map(h => h.toLowerCase().trim());
  const rows    = nonEmpty.slice(1).map(line => {
    const vals = splitRow(line);
    const row  = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || '').trim(); });
    return row;
  });
  return { headers, rows };
}
async function handleImportFile(file) {
  if (!file) return;
  const text = await file.text();
  const { headers, rows } = parseCSV(text);
  if (!headers.includes('name') || !headers.includes('city') || !headers.includes('start_date')) {
    showToast('CSV missing required columns: name, city, start_date', 'error');
    return;
  }
  if (rows.length > 500) { showToast('Max 500 per import.', 'error'); return; }
  const existing = await sbFetch('events?select=name,city_id');
  const existingSet = new Set((existing || []).map(e => `${e.city_id}||${e.name.toLowerCase()}`));
  const processed = rows.map((row, i) => {
    const rowNum = i + 2;
    const name     = row['name'] || '';
    const cityName = row['city'] || '';
    const startDate= row['start_date'] || '';
    const errors = [];
    if (!name)      errors.push('Missing name');
    if (!cityName)  errors.push('Missing city');
    if (!startDate) errors.push('Missing start_date');
    const cityObj = CITIES_DATA.find(c => c.name.toLowerCase() === cityName.toLowerCase());
    if (errors.length) return { rowNum, name, cityName, status: 'error', errors, row };
    const isDupe = cityObj && existingSet.has(`${cityObj.id}||${name.toLowerCase()}`);
    if (isDupe) return { rowNum, name, cityName, status: 'skip', reason: 'Already exists', row };
    return { rowNum, name, cityName, cityId: cityObj?.id || null, status: 'add', row };
  });
  window._importRows = processed;
  showImportPreview(processed, file.name);
}
function showImportPreview(rows, filename) {
  const addCount=rows.filter(r=>r.status==='add').length;
  const skipCount=rows.filter(r=>r.status==='skip').length;
  const errorCount=rows.filter(r=>r.status==='error').length;
  const summaryHtml=`<div class="imp-summary"><div style="font-size:13px;font-weight:600;color:var(--gray-800);flex:1">${filename}</div><span class="imp-bdg add">+${addCount} to add</span>${skipCount?`<span class="imp-bdg skip">${skipCount} skipped</span>`:''}${errorCount?`<span class="imp-bdg error">${errorCount} errors</span>`:''}</div>`;
  const headerHtml=`<div class="imp-row header"><div>#</div><div>Name</div><div>City</div><div>Status</div></div>`;
  const rowsHtml = rows.map(r => {
    const statusPill = r.status === 'add'
      ? `<span class="imp-pill add">Add</span>`
      : r.status === 'skip'
      ? `<span class="imp-pill skip">Skip</span>`
      : `<span class="imp-pill error">Error</span>`;
    const errorHint = r.errors?.length ? `<div class="imp-err">${r.errors.join(', ')}</div>` : '';
    return `<div class="imp-row will-${r.status}"><div class="imp-num">${r.rowNum}</div><div><div class="imp-name">${r.name || '—'}</div>${errorHint}</div><div class="imp-city">${r.cityName || '—'}</div><div class="imp-status">${statusPill}</div></div>`;
  }).join('');
  gid('imp-content').innerHTML = summaryHtml + `<div class="imp-table">${headerHtml}${rowsHtml}</div>`;
  gid('imp-upload').style.display  = 'none';
  gid('imp-preview').style.display = '';
  if (addCount > 0) {
    gid('btn-imp-ok').style.display='';
    gid('btn-imp-lbl').textContent = `Import ${addCount} event${addCount !== 1?'s':''}`;
  } else {
    gid('btn-imp-ok').style.display='none';
  }
}
async function confirmImport() {
  const rows = (window._importRows || []).filter(r => r.status === 'add');
  if (!rows.length) return;
  const btn = gid('btn-imp-ok');
  btn.disabled = true;
  gid('btn-imp-lbl').textContent='Importing...';
  let added=0,failed=0;
  for(const r of rows){try{
    const now=new Date().toISOString();
    const cityId=r.cityId||await getOrCreateCity(r.cityName,0,0);
    const rr=r.row;
    const payload={name:r.name,slug:generateSlug(r.name),city_id:cityId,address:rr['address']||null,description:rr['description']||null,website:rr['website']||null,profile_image:rr['profile_image']||null,speechify_link:rr['speechify_link']||null,latitude:rr['latitude']?parseFloat(rr['latitude']):null,longitude:rr['longitude']?parseFloat(rr['longitude']):null,start_date:rr['start_date'],end_date:rr['end_date']||null,start_time:rr['start_time']||null,end_time:rr['end_time']||null,created_at:now,updated_at:now};
    await sbFetch('events',{method:'POST',body:JSON.stringify(payload)});
    added++;
  }catch(e){failed++;}}
  btn.disabled=false;
  closeModal('modal-import');
  loadAndRenderTable();
  showToast(failed===0?`${added} event${added!==1?'s':''} imported successfully.`:`${added} imported, ${failed} failed.`,failed>0?'error':'success');
}
function downloadTemplate() {
  const headers='name,city,start_date,end_date,start_time,end_time,address,description,website,profile_image,speechify_link,latitude,longitude'.split(',');
  const exampleCityName=CITIES_DATA[0]?.name||'Ocean Springs';
  const exampleRow=['Example Event',exampleCityName,'2025-06-15','2025-06-16','10:00','17:00','123 Main St','A fun event.','','','','',''];
  const csv=[headers.join(','),exampleRow.map(v=>v.includes(',')?`"${v}"`:v).join(',')].join('\n');
  const blob=new Blob([csv],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='journez_events_template.csv';a.click();URL.revokeObjectURL(url);
}
function closeModal(id) {
  gid(id).classList.remove('open');
  document.body.style.overflow = '';
}
async function saveEvent() {
  const name         = gid('f-name').value.trim();
  const citySel      = gid('f-city');
  const cityVal      = citySel.value;
  const newCityInput = gid('f-new-city')?.value.trim();
  const startDate    = gid('f-start-date').value;
  if (!name)      { showToast('Event name is required.', 'error'); return; }
  if (!cityVal && !newCityInput) { showToast('City required', 'error'); return; }
  if (!startDate) { showToast('Start date is required.', 'error'); return; }
  const resolvedCityId = newCityInput ? await getOrCreateCity(newCityInput) : cityVal;
  let finalProfileUrl = profileImageUrl;
  const profileUrlInput = gid('f-profile-url').value.trim();
  if (!finalProfileUrl && profileUrlInput) finalProfileUrl = profileUrlInput;
  const latVal = gid('f-lat').value.trim();
  const lngVal = gid('f-lng').value.trim();
  const payload = {
    name,
    slug:          generateSlug(name),
    description:   gid('f-desc').value.trim()    || null,
    address:       gid('f-addr').value.trim()     || null,
    city_id:       resolvedCityId,
    website:       gid('f-website').value.trim()  || null,
    speechify_link:gid('f-speechify').value.trim()|| null,
    profile_image: finalProfileUrl || null,
    start_date:    startDate,
    end_date:      gid('f-end-date').value        || null,
    start_time:    gid('f-start-time').value      || null,
    end_time:      gid('f-end-time').value        || null,
    latitude:      latVal ? parseFloat(latVal)    : null,
    longitude:     lngVal ? parseFloat(lngVal)    : null,
    updated_at:    new Date().toISOString(),
  };
  const btn = gid('btn-save-event');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    if (editingId) {
      await sbFetch(`events?id=eq.${editingId}`, {method:'PATCH',body:JSON.stringify(payload)});
      showToast('Event updated.');
      updateLastUpdated(new Date().toISOString());
    } else {
      payload.created_at = new Date().toISOString();
      await sbFetch('events', {method:'POST',body:JSON.stringify(payload)});
      showToast('Event added.');
      updateLastUpdated(new Date().toISOString());
    }
    closeModal('modal-event');
    loadAndRenderTable();
  } catch (e) {
    showToast('Save failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = SVG_CHECK + ' Save Event';
  }
}
['modal-event','modal-import'].forEach(id => {
  gid(id)?.addEventListener('click', e => {
    if (e.target === gid(id)) closeModal(id);
  });
});
document.addEventListener('DOMContentLoaded', async function () {
  const _logoEl = document.querySelector('[class*="sidebar_logo-icon"]');
  if (_logoEl) {
    _logoEl.style.background = 'none';
    _logoEl.innerHTML = '<img src="https://cdn.prod.website-files.com/63e53396a34018da90230c8e/66b1545192b2665e1e65817d_Journez%20Logo.svg" style="width:32px;height:32px">';
  }

  if (typeof buildNav === 'function') {
    buildNav();
  }

  const sectionHeader = gid('section-header');
  if (sectionHeader && !gid('search-input')) {
    const controls = document.createElement('div');
    controls.className = 'section-right';
    controls.innerHTML = `
      <div class="search-bar">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="text" id="search-input" placeholder="Search events…">
      </div>
      <div class="city-filter">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>
        <select id="city-select"><option value="">All Cities</option></select>
      </div>
      <div class="city-filter">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M3 6h18M7 12h10M11 18h2"/></svg>
        <select id="sort-select" onchange="onSortChange(this.value)">
          <option value="date-asc">Date ↑</option>
          <option value="date-desc">Date ↓</option>
          <option value="name-asc">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
          <option value="city-asc">City A–Z</option>
          <option value="city-desc">City Z–A</option>
          <option value="updated-desc">Updated ↓</option>
          <option value="updated-asc">Updated ↑</option>
        </select>
      </div>`;
    sectionHeader.appendChild(controls);

    const _st = document.querySelector('[class*="section_title"]');
    if (_st && !gid('loc-counter')) {
      const _b = document.createElement('span');
      _b.id = 'loc-counter';
      _b.className = 'loc-counter-badge';
      _st.insertAdjacentElement('afterend', _b);
    }

    gid('search-input').addEventListener('input', filterTable);
    gid('city-select').addEventListener('change', filterTable);
  }

  const pageHeader = document.querySelector('[class*="topbar_right"]');
  if (pageHeader && !gid('btn-signout')) {
    const signoutBtn = document.createElement('button');
    Object.assign(signoutBtn, {
      id: 'btn-signout',
      className: 'btn btn-secondary',
      textContent: 'Sign out',
      onclick: signOut
    });
    pageHeader.appendChild(signoutBtn);
  }

  const tableWrap = gid('table-wrap');
  if (tableWrap && !gid('table-body')) {
    const tbody = document.createElement('div');
    tbody.id = 'table-body';
    tableWrap.appendChild(tbody);
  }

  gid('btn-add-top')?.addEventListener('click', e => {
    e.preventDefault();
    openAddModal();
  });

  gid('btn-import')?.addEventListener('click', e => {
    e.preventDefault();
    openImportModal();
  });

  await loadReferenceData();
  loadAndRenderTable();
});
</script>
