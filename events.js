const SVG_CHECK = '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M5 13l4 4L19 7"/></svg>';

const {
  gid,
  qsa,
  requireSession,
  signOut,
  sbFetch,
  uploadImage,
  generateSlug,
  showToast,
  openModal,
  closeModal,
  updateBadges,
  updateLastUpdated,
  getLastActionTime
} = window.JournezAdminCore;

requireSession();

let CITIES_DATA = [];
let editingId = null;
let profileImageUrl = null;
let _sortKey = 'date';
let _sortDir = 'asc';

async function loadReferenceData() {
  const cities = await sbFetch('cities?select=id,name&order=name');
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
    const newOpt = document.createElement('option');
    newOpt.value = '__new__';
    newOpt.textContent = '+ Add new city…';
    sel.appendChild(newOpt);
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

async function getOrCreateCity(name, lat, lng) {
  if (!name || name === '__new__') return null;

  const ex = CITIES_DATA.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (ex) return ex.id;

  const res = await sbFetch('cities', {
    method: 'POST',
    body: JSON.stringify({
      name: name.trim(),
      slug: generateSlug(name),
      latitude: lat || 0,
      longitude: lng || 0
    })
  });

  const city = Array.isArray(res) ? res[0] : res;

  if (city?.id) {
    CITIES_DATA.push(city);

    ['f-city', 'city-select'].forEach(id => {
      const s = gid(id);
      if (!s) return;
      const o = document.createElement('option');
      o.value = city.id;
      o.textContent = city.name;
      s.appendChild(o);
    });

    return city.id;
  }

  return null;
}

function formatTime(t) {
  if (!t) return '';
  if (t.includes('AM') || t.includes('PM')) return t;

  const [h, m] = t.split(':');
  const hr = parseInt(h, 10);
  const ampm = hr >= 12 ? 'PM' : 'AM';
  const h12 = hr % 12 || 12;

  return m === '00' ? `${h12}${ampm}` : `${h12}:${m}${ampm}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function updateEventsStatCards(evts) {
  const evtCount = evts.length;
  const cityCount = [...new Set(evts.map(e => e.city_id).filter(Boolean))].length;

  const now = new Date();
  const currentMonthCount = evts.filter(e => {
    if (!e.start_date) return false;
    const d = new Date(`${e.start_date}T00:00:00`);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;

  const labels = [...document.querySelectorAll('[class*="card_label"]')];

  function setCardByLabel(labelText, value, subtext) {
    const labelEl = labels.find(el => el.textContent.trim() === labelText);
    if (!labelEl) return;

    const card = labelEl.closest('[class*="card_component"]');
    if (!card) return;

    const valueEl = card.querySelector('[class*="card_value"]');
    const subEl = card.querySelector('[class*="card_sub"]');

    if (valueEl) valueEl.textContent = String(value);
    if (subEl) subEl.textContent = subtext;
  }

  setCardByLabel(
    'Total Events',
    evtCount,
    `Across ${cityCount} cit${cityCount === 1 ? 'y' : 'ies'}`
  );

  setCardByLabel(
    'Upcoming Events',
    currentMonthCount,
    'This current month'
  );
}

async function loadAndRenderTable() {
  const tbody = gid('table-body');
  if (!tbody) return;

  tbody.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><div class="loading-text">Loading...</div></div>';

  try {
    const [events, locData] = await Promise.all([
      sbFetch('events?select=id,name,address,city_id,profile_image,speechify_link,start_date,end_date,start_time,end_time,website,latitude,longitude,slug,updated_at&order=start_date'),
      sbFetch('locations?select=id')
    ]);

    const evts = events || [];
    const locCount = (locData || []).length;
   const evtCount = evts.length;

renderTable(evts);
updateEventsStatCards(evts);

    const _sc = gid('stat-cities');
    if (_sc) {
      _sc.textContent = cityCount;
      const _scs = _sc.closest('[class*="card_component"]')?.querySelector('[class*="card_sub"]');
      if (_scs) _scs.textContent = 'Active in app';
    }

    updateBadges(locCount, evtCount);

    const effective = [
      evts.map(e => e.updated_at).filter(Boolean).sort().reverse()[0],
      getLastActionTime()
    ].filter(Boolean).sort().reverse()[0];

    if (effective) updateLastUpdated(effective);
  } catch (e) {
    tbody.innerHTML = `<div class="empty-state"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg><div class="empty-title">Failed to load</div><div class="empty-sub">${e.message}</div></div>`;
  }
}

function renderTable(events) {
  const tbody = gid('table-body');
  const filtered = applySortFilter(events);

  if (filtered.length === 0) {
    tbody.innerHTML = `<div class="empty-state"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg><div class="empty-title">No events found</div><div class="empty-sub">Try adjusting filters.</div></div>`;
    return;
  }

  tbody.innerHTML = filtered.map(e => {
    const cityName = getCityName(e.city_id);
    const startDate = formatDate(e.start_date);
    const endDate = e.end_date ? formatDate(e.end_date) : null;
    const dateText = endDate && endDate !== startDate ? `${startDate} – ${endDate}` : startDate;

    const timeText =
      e.start_time && e.end_time
        ? `${formatTime(e.start_time)} – ${formatTime(e.end_time)}`
        : e.start_time
        ? formatTime(e.start_time)
        : '—';

    const audioIcon = e.speechify_link
      ? `<span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:#fdf4ff;color:#9333ea;flex-shrink:0"><svg width="8" height="8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zm-1 18.93V22h2v-2.07A8.001 8.001 0 0020 12h-2a6 6 0 01-12 0H4a8.001 8.001 0 007 7.93z"/></svg></span>`
      : '';

    return `<div class="table-row" onclick="openEditModal('${e.id}')"><div><div style="display:flex;align-items:center;gap:6px"><div class="loc-name">${e.name}</div>${audioIcon}</div><div class="loc-addr">${e.address || '—'}</div></div><div><span class="city-tag">${cityName}</span></div><div><div style="font-size:12.5px;color:var(--gray-800);font-weight:500">${dateText}</div><div style="font-size:12px;color:var(--gray-400);margin-top:2px">${timeText}</div></div><div><a href="${e.website || '#'}" target="_blank" ${e.website ? '' : 'onclick="event.preventDefault()"'} style="font-size:12px;color:${e.website ? 'var(--accent)' : 'var(--gray-300)'};text-decoration:none">${e.website ? 'Visit site' : '—'}</a></div><div class="row-actions"><button class="icon-btn" onclick="event.stopPropagation();openEditModal('${e.id}')"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.4-9.4a2 2 0 112.8 2.8L11.8 15H9v-2.8l8.6-8.6z"/></svg></button><button class="icon-btn danger" onclick="event.stopPropagation();deleteEvent('${e.id}')"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button></div></div>`;
  }).join('');

  window._allEvents = events;
}

function onSortChange(v) {
  [_sortKey, _sortDir] = v.split('-');
  filterTable();
}

function applySortFilter(evts) {
  const s = (gid('search-input')?.value || '').toLowerCase();
  const cf = gid('city-select')?.value || '';

  const filtered = evts.filter(e => {
    const matchesCity = !cf || e.city_id === cf;
    const cityName = getCityName(e.city_id).toLowerCase();

    return matchesCity && (
      !s ||
      e.name?.toLowerCase().includes(s) ||
      e.address?.toLowerCase().includes(s) ||
      cityName.includes(s)
    );
  });

  filtered.sort((a, b) => {
    let av = '';
    let bv = '';

    if (_sortKey === 'name') {
      av = a.name?.toLowerCase() || '';
      bv = b.name?.toLowerCase() || '';
    } else if (_sortKey === 'city') {
      av = getCityName(a.city_id).toLowerCase();
      bv = getCityName(b.city_id).toLowerCase();
    } else if (_sortKey === 'updated') {
      av = a.updated_at || '';
      bv = b.updated_at || '';
    } else if (_sortKey === 'date') {
      av = a.start_date || '';
      bv = b.start_date || '';
    }

    return av < bv ? (_sortDir === 'asc' ? -1 : 1) : av > bv ? (_sortDir === 'asc' ? 1 : -1) : 0;
  });

  return filtered;
}

function filterTable() {
  if (window._allEvents) renderTable(window._allEvents);
}

function toggleNewCity(sel) {
  const n = gid('f-new-city');
  if (!n) return;

  if (sel.value === '__new__') {
    n.style.display = '';
    n.focus();
  } else {
    n.style.display = 'none';
    n.value = '';
  }
}

function switchImgTab(field, mode, btn) {
  const tabs = btn.closest('.img-tabs').querySelectorAll('.img-tab');
  tabs.forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  gid(`${field}-upload-panel`).style.display = mode === 'upload' ? '' : 'none';
  gid(`${field}-url-panel`).style.display = mode === 'url' ? '' : 'none';
}

async function handleProfileFile(file) {
  if (!file) return;

  const preview = gid('profile-preview');
  const dropZone = gid('profile-drop-zone');

  preview.innerHTML = `<div class="img-uploading"><div class="loading-spinner"></div>Uploading...</div>`;
  preview.style.display = '';
  dropZone.style.display = 'none';

  try {
    profileImageUrl = await uploadImage(file, 'profile');
    preview.innerHTML = `<div class="img-preview"><img src="${profileImageUrl}" alt="Profile"><span class="img-preview-name">${file.name}</span><button class="img-preview-remove" onclick="clearProfileImage()"><svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12"/></svg></button></div>`;
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
  qsa('#modal-event .img-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  gid('profile-upload-panel').style.display = '';
  gid('profile-url-panel').style.display = 'none';
}

function openAddModal() {
  editingId = null;

  gid('modal-title').textContent = 'Add Event';
  gid('f-name').value = '';
  gid('f-city').value = '';
  gid('f-addr').value = '';
  gid('f-desc').value = '';
  gid('f-start-date').value = '';
  gid('f-end-date').value = '';
  gid('f-start-time').value = '';
  gid('f-end-time').value = '';
  gid('f-lat').value = '';
  gid('f-lng').value = '';
  gid('f-website').value = '';
  gid('f-speechify').value = '';
  if (gid('f-new-city')) {
    gid('f-new-city').value = '';
    gid('f-new-city').style.display = 'none';
  }

  resetImageState();
  openModal('modal-event');
}

function setProfilePreview(url) {
  profileImageUrl = url;
  gid('profile-drop-zone').style.display = 'none';
  gid('profile-preview').style.display = '';
  gid('profile-preview').innerHTML = `<div class="img-preview"><img src="${url}" alt="Profile"><span class="img-preview-name">Current profile image</span><button class="img-preview-remove" onclick="clearProfileImage()"><svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12"/></svg></button></div>`;
}

async function openEditModal(id) {
  try {
    const [evt] = await sbFetch(`events?id=eq.${id}&select=*`);
    if (!evt) return;

    editingId = id;

    gid('modal-title').textContent = 'Edit Event';
    gid('f-name').value = evt.name || '';
    gid('f-city').value = evt.city_id || '';
    gid('f-addr').value = evt.address || '';
    gid('f-desc').value = evt.description || '';
    gid('f-start-date').value = evt.start_date || '';
    gid('f-end-date').value = evt.end_date || '';
    gid('f-start-time').value = evt.start_time || '';
    gid('f-end-time').value = evt.end_time || '';
    gid('f-lat').value = evt.latitude != null ? evt.latitude : '';
    gid('f-lng').value = evt.longitude != null ? evt.longitude : '';
    gid('f-website').value = evt.website || '';
    gid('f-speechify').value = evt.speechify_link || '';

    if (gid('f-new-city')) {
      gid('f-new-city').value = '';
      gid('f-new-city').style.display = 'none';
    }

    resetImageState();
    if (evt.profile_image) setProfilePreview(evt.profile_image);

    openModal('modal-event');
  } catch (e) {
    showToast('Could not load event: ' + e.message, 'error');
  }
}

async function deleteEvent(id) {
  if (!confirm('Delete this event? ')) return;

  try {
    await sbFetch(`events?id=eq.${id}`, {
      method: 'DELETE',
      prefer: 'return=minimal'
    });
    showToast('Event deleted.');
    updateLastUpdated(new Date().toISOString());
    loadAndRenderTable();
  } catch (e) {
    showToast('Delete failed: ' + e.message, 'error');
  }
}

function parseImportCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const nonEmpty = lines.filter(l => l.trim());
  if (nonEmpty.length < 2) return { headers: [], rows: [] };

  function splitRow(line) {
    const cols = [];
    let cur = '';
    let inQuote = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && !inQuote) inQuote = true;
      else if (ch === '"' && inQuote && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"' && inQuote) inQuote = false;
      else if (ch === ',' && !inQuote) {
        cols.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }

    cols.push(cur.trim());
    return cols;
  }

  const headers = splitRow(nonEmpty[0]).map(h => h.toLowerCase().trim());
  const rows = nonEmpty.slice(1).map(line => {
    const vals = splitRow(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (vals[i] || '').trim();
    });
    return row;
  });

  return { headers, rows };
}

function resetImportModal() {
  gid('imp-upload').style.display = '';
  gid('imp-preview').style.display = 'none';
  gid('btn-imp-ok').style.display = 'none';
  gid('imp-file').value = '';
  gid('imp-content').innerHTML = '';
  window._importRows = null;
}

function openImportModal() {
  resetImportModal();

  const hint = gid('city-hint');
  if (hint && CITIES_DATA.length) {
    hint.textContent = CITIES_DATA.map(c => c.name).join(', ');
  }

  openModal('modal-import');
}

async function handleImportFile(file) {
  if (!file) return;

  const text = await file.text();
  const { headers, rows } = parseImportCSV(text);

  if (!headers.includes('name') || !headers.includes('city') || !headers.includes('start_date')) {
    showToast('CSV missing required columns: name, city, start_date', 'error');
    return;
  }

  if (rows.length > 500) {
    showToast('Max 500 rows per import.', 'error');
    return;
  }

  const existing = await sbFetch('events?select=name,city_id,start_date');
  const existingSet = new Set((existing || []).map(e => `${e.city_id}||${e.name.toLowerCase()}||${e.start_date || ''}`));

  const processed = rows.map((row, i) => {
    const rowNum = i + 2;
    const name = row.name || '';
    const cityName = row.city || '';
    const startDate = row.start_date || '';
    const errors = [];

    if (!name) errors.push('Missing name');
    if (!cityName) errors.push('Missing city');
    if (!startDate) errors.push('Missing start date');

    const cityObj = CITIES_DATA.find(c => c.name.toLowerCase() === cityName.toLowerCase());

    if (errors.length) return { rowNum, name, cityName, status: 'error', errors, row };

    const isDupe = cityObj && existingSet.has(`${cityObj.id}||${name.toLowerCase()}||${startDate}`);
    if (isDupe) return { rowNum, name, cityName, status: 'skip', reason: 'Already exists', row };

    return {
      rowNum,
      name,
      cityName,
      cityId: cityObj?.id || null,
      status: 'add',
      row
    };
  });

  window._importRows = processed;
  showImportPreview(processed, file.name);
}

function showImportPreview(rows, filename) {
  const addCount = rows.filter(r => r.status === 'add').length;
  const skipCount = rows.filter(r => r.status === 'skip').length;
  const errorCount = rows.filter(r => r.status === 'error').length;

  const summaryHtml = `<div class="import-preview-summary"><div style="font-size:13px;font-weight:600;color:var(--gray-800);flex:1">${filename}</div><span class="import-badge add">+${addCount} to add</span>${skipCount ? `<span class="import-badge skip">${skipCount} skipped</span>` : ''}${errorCount ? `<span class="import-badge error">${errorCount} errors</span>` : ''}</div>`;
  const headerHtml = `<div class="import-preview-row header"><div>#</div><div>Name</div><div>City</div><div>Status</div></div>`;

  const rowsHtml = rows.map(r => {
    const statusPill = r.status === 'add'
      ? `<span class="import-status-pill add">Add</span>`
      : r.status === 'skip'
      ? `<span class="import-status-pill skip">Skip</span>`
      : `<span class="import-status-pill error">Error</span>`;

    const errorHint = r.errors?.length ? `<div class="import-error-hint">${r.errors.join(', ')}</div>` : '';

    return `<div class="import-preview-row will-${r.status}"><div class="import-row-num">${r.rowNum}</div><div><div class="import-row-name">${r.name || '—'}</div>${errorHint}</div><div class="import-row-city">${r.cityName || '—'}</div><div class="import-row-status">${statusPill}</div></div>`;
  }).join('');

  gid('imp-content').innerHTML = summaryHtml + `<div class="import-preview-table">${headerHtml}${rowsHtml}</div>`;
  gid('imp-upload').style.display = 'none';
  gid('imp-preview').style.display = '';

  if (addCount > 0) {
    gid('btn-imp-ok').style.display = '';
    gid('btn-imp-lbl').textContent = `Import ${addCount} event${addCount !== 1 ? 's' : ''}`;
  } else {
    gid('btn-imp-ok').style.display = 'none';
  }
}

async function confirmImport() {
  const rows = (window._importRows || []).filter(r => r.status === 'add');
  if (!rows.length) return;

  const btn = gid('btn-imp-ok');
  btn.disabled = true;
  gid('btn-imp-lbl').textContent = 'Importing...';

  let added = 0;
  let failed = 0;

  for (const r of rows) {
    try {
      const rr = r.row;
      const lat = rr.latitude ? parseFloat(rr.latitude) : null;
      const lng = rr.longitude ? parseFloat(rr.longitude) : null;
      const cityId = r.cityId || await getOrCreateCity(r.cityName, lat, lng);
      const now = new Date().toISOString();

      const payload = {
        name: r.name,
        slug: generateSlug(r.name),
        city_id: cityId,
        address: rr.address || null,
        description: rr.description || null,
        start_date: rr.start_date || null,
        end_date: rr.end_date || null,
        start_time: rr.start_time || null,
        end_time: rr.end_time || null,
        website: rr.website || null,
        profile_image: rr.profile_image || null,
        speechify_link: rr.speechify_link || null,
        latitude: rr.latitude ? parseFloat(rr.latitude) : null,
        longitude: rr.longitude ? parseFloat(rr.longitude) : null,
        created_at: now,
        updated_at: now
      };

      await sbFetch('events', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      added++;
    } catch (e) {
      failed++;
    }
  }

  btn.disabled = false;
  closeModal('modal-import');
  loadAndRenderTable();

  showToast(
    failed === 0
      ? `${added} event${added !== 1 ? 's' : ''} imported successfully.`
      : `${added} imported, ${failed} failed.`,
    failed > 0 ? 'error' : 'success'
  );
}

function downloadTemplate() {
  const headers = 'name,city,start_date,end_date,start_time,end_time,address,description,website,profile_image,speechify_link,latitude,longitude'.split(',');
  const exampleCityName = CITIES_DATA[0]?.name || 'Ocean Springs';
  const exampleRow = [
    'Example Festival',
    exampleCityName,
    '2026-04-12',
    '',
    '18:00',
    '21:00',
    '123 Main St',
    'A sample event.',
    '',
    '',
    '',
    '',
    ''
  ];

  const csv = [
    headers.join(','),
    exampleRow.map(v => v.includes(',') ? `"${v}"` : v).join(',')
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'journez_events_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

async function saveEvent() {
  const name = gid('f-name').value.trim();
  const citySel = gid('f-city');
  const cityVal = citySel.value;
  const newCityInput = gid('f-new-city')?.value.trim();
  const latRaw = gid('f-lat').value.trim();
  const lngRaw = gid('f-lng').value.trim();

  if (!name) {
    showToast('Event name is required.', 'error');
    return;
  }

  if (!cityVal && !newCityInput) {
    showToast('Please select or enter a city.', 'error');
    return;
  }

  if (!gid('f-start-date').value) {
    showToast('Start date is required.', 'error');
    return;
  }

  const lat = latRaw ? parseFloat(latRaw) : null;
  const lng = lngRaw ? parseFloat(lngRaw) : null;

  if ((latRaw && isNaN(lat)) || (lngRaw && isNaN(lng))) {
    showToast('Coordinates must be valid numbers.', 'error');
    return;
  }

  const resolvedCityId = newCityInput ? await getOrCreateCity(newCityInput, lat, lng) : cityVal;

  let finalProfileUrl = profileImageUrl;
  const profileUrlInput = gid('f-profile-url').value.trim();
  if (!finalProfileUrl && profileUrlInput) finalProfileUrl = profileUrlInput;

  const payload = {
    name,
    slug: generateSlug(name),
    city_id: resolvedCityId,
    address: gid('f-addr').value.trim() || null,
    description: gid('f-desc').value.trim() || null,
    start_date: gid('f-start-date').value || null,
    end_date: gid('f-end-date').value || null,
    start_time: gid('f-start-time').value || null,
    end_time: gid('f-end-time').value || null,
    website: gid('f-website').value.trim() || null,
    profile_image: finalProfileUrl || null,
    speechify_link: gid('f-speechify').value.trim() || null,
    latitude: lat,
    longitude: lng,
    updated_at: new Date().toISOString()
  };

  const btn = gid('btn-save-event');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    if (editingId) {
      await sbFetch(`events?id=eq.${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      showToast('Event updated.');
      updateLastUpdated(new Date().toISOString());
    } else {
      payload.created_at = new Date().toISOString();
      await sbFetch('events', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
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

['modal-event', 'modal-import'].forEach(id => {
  gid(id)?.addEventListener('click', e => {
    if (e.target === gid(id)) closeModal(id);
  });
});

document.addEventListener('DOMContentLoaded', async function () {
  const logoEl = document.querySelector('[class*="sidebar_logo-icon"]');
  if (logoEl) {
    logoEl.style.background = 'none';
    logoEl.innerHTML = '<img src="https://cdn.prod.website-files.com/63e53396a34018da90230c8e/66b1545192b2665e1e65817d_Journez%20Logo.svg" style="width:32px;height:32px">';
  }

  const sectionHeader = gid('section-header');
  if (sectionHeader) {
    const controls = document.createElement('div');
    controls.className = 'section-right';
    controls.innerHTML = `
      <div class="search-bar">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="text" id="search-input">
      </div>
      <div class="city-filter">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>
        <select id="city-select"><option value="">All Cities</option></select>
      </div>
      <div class="city-filter">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M3 6h18M7 12h10M11 18h2"/></svg>
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
    gid('search-input')?.setAttribute('placeholder', 'Search events');
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

window.signOut = signOut;
window.saveEvent = saveEvent;
window.closeModal = closeModal;
window.openAddModal = openAddModal;
window.openImportModal = openImportModal;
window.toggleNewCity = toggleNewCity;
window.switchImgTab = switchImgTab;
window.handleProfileFile = handleProfileFile;
window.handleImportFile = handleImportFile;
window.confirmImport = confirmImport;
window.resetImportModal = resetImportModal;
window.downloadTemplate = downloadTemplate;
window.onSortChange = onSortChange;
window.openEditModal = openEditModal;
window.deleteEvent = deleteEvent;
window.loadAndRenderTable = loadAndRenderTable;
window.clearProfileImage = clearProfileImage;
