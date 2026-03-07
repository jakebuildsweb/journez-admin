/* ========================================
   Shared icons / helpers from admin-core
======================================== */

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

/* Require an active admin session before anything else runs */
requireSession();

/* ========================================
   Page state
======================================== */

let CITIES_DATA = [];          // cached cities for selects / filters
let CATEGORIES_DATA = [];      // cached categories for form + table display
let profileImageUrl = null;    // profile image URL for current form
let galleryImageUrls = [];     // gallery images for current form
let editingId = null;          // current location being edited
let _sortKey = 'name';         // current table sort key
let _sortDir = 'asc';          // current table sort direction

/* ========================================
   Day / hours helpers
======================================== */

const DAY_SHORT_TO_FULL = {
  mon: 'monday',
  tue: 'tuesday',
  wed: 'wednesday',
  thu: 'thursday',
  fri: 'friday',
  sat: 'saturday',
  sun: 'sunday'
};

const DAY_FULL_TO_SHORT = Object.fromEntries(
  Object.entries(DAY_SHORT_TO_FULL).map(([k, v]) => [v, k])
);

const DAYS_LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/* Category color styles used in the table */
const CAT_COLORS = {
  'Events': { bg: '#fdf4ff', color: '#9333ea' },
  'Focal Point': { bg: '#f2f2f0', color: '#5a5a54' },
  'Things To Do': { bg: '#fff1f2', color: '#dc2626' },
  'What to Eat': { bg: '#eff4ff', color: '#2563eb' },
  'Where to Stay': { bg: '#fff7ed', color: '#ea580c' }
};

/* Canonical list of days used by the hours editor */
const DAYS = [
  { id: 'mon', label: 'Monday' },
  { id: 'tue', label: 'Tuesday' },
  { id: 'wed', label: 'Wednesday' },
  { id: 'thu', label: 'Thursday' },
  { id: 'fri', label: 'Friday' },
  { id: 'sat', label: 'Saturday' },
  { id: 'sun', label: 'Sunday' }
];

/* ========================================
   Reference data
   Load cities + categories into selects
======================================== */

async function loadReferenceData() {
  const [cities, cats] = await Promise.all([
    sbFetch('cities?select=id,name&order=name'),
    sbFetch('categories?select=id,name&order=name')
  ]);

  CITIES_DATA = cities || [];
  CATEGORIES_DATA = cats || [];

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

  const catSel = gid('f-cat');
  if (catSel) {
    const placeholder = catSel.options[0];
    catSel.innerHTML = '';
    catSel.appendChild(placeholder);

    CATEGORIES_DATA.forEach(c => {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.name;
      catSel.appendChild(o);
    });
  }

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

/* ========================================
   Hours parsing / formatting
======================================== */

/* Convert various time strings into normalized 24h format */
function parseHourStr(str) {
  if (!str || str.toLowerCase() === 'closed' || str.trim() === '') return null;
  if (/^\d{1,2}:\d{2}$/.test(str.trim())) return str.trim().padStart(5, '0');

  const m = str.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;

  let h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = m[3].toUpperCase();

  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;

  return `${String(h).padStart(2, '0')}:${min}`;
}

/* Normalize stored hours object into short-day format used by UI */
function normalizeHours(raw) {
  if (!raw) return {};
  const out = {};

  for (const [key, val] of Object.entries(raw)) {
    const shortKey = DAY_FULL_TO_SHORT[key] || (DAY_SHORT_TO_FULL[key] ? key : null);
    if (!shortKey) continue;

    const openStr = parseHourStr(val.open);
    const closeStr = parseHourStr(val.close);

    if (openStr && closeStr) {
      out[shortKey] = { open: openStr, close: closeStr };
    }
  }

  return out;
}

/* Format time for display */
function formatTime(t) {
  if (!t) return '';
  if (t === 'Closed' || t === 'Open 24 Hours') return t;
  if (t.includes('AM') || t.includes('PM')) return t;

  const [h, m] = t.split(':');
  const hr = parseInt(h, 10);
  const ampm = hr >= 12 ? 'PM' : 'AM';
  const h12 = hr % 12 || 12;

  return m === '00' ? `${h12}${ampm}` : `${h12}:${m}${ampm}`;
}

/* ========================================
   Lookup helpers
======================================== */

function getCityName(cityId) {
  const c = CITIES_DATA.find(c => c.id === cityId);
  return c ? c.name : '—';
}

function getCatName(catId) {
  const c = CATEGORIES_DATA.find(c => c.id === catId);
  return c ? c.name : null;
}

/* Find existing city by name, or create it if needed */
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

/* ========================================
   Main table loader
   Fetches locations + event count, then:
   - renders rows
   - updates stat cards
   - updates sidebar badges
   - updates "last updated"
======================================== */

async function loadAndRenderTable() {
  const tbody = gid('table-body');
  if (!tbody) return;

  tbody.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><div class="loading-text">Loading...</div></div>';

  try {
    const [locations, eventData] = await Promise.all([
      sbFetch('locations?select=id,name,address,latitude,longitude,city_id,category_id,profile_image,audio_file_link,is_focal_point,operating_hours,slug,updated_at&order=name'),
      sbFetch('events?select=id')
    ]);

    const locs = locations || [];
    const locCount = locs.length;
    const evtCount = (eventData || []).length;
    const cityCount = [...new Set(locs.map(l => l.city_id).filter(Boolean))].length;

    renderTable(locs);

    const _st = gid('stat-total');
    if (_st) {
      _st.textContent = locCount;
      const _ss = _st.closest('[class*="card_component"]')?.querySelector('[class*="card_sub"]');
      if (_ss) _ss.textContent = `Across ${cityCount} cit${cityCount === 1 ? 'y' : 'ies'}`;
    }

    const _sc = gid('stat-cities');
    if (_sc) {
      _sc.textContent = cityCount;
      const _scs = _sc.closest('[class*="card_component"]')?.querySelector('[class*="card_sub"]');
      if (_scs) _scs.textContent = 'Active in app';
    }

    updateBadges(locCount, evtCount);

    const effective = [
      locs.map(l => l.updated_at).filter(Boolean).sort().reverse()[0],
      getLastActionTime()
    ].filter(Boolean).sort().reverse()[0];

    if (effective) updateLastUpdated(effective);
  } catch (e) {
    tbody.innerHTML = `<div class="empty-state"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg><div class="empty-title">Failed to load</div><div class="empty-sub">${e.message}</div></div>`;
  }
}

/* ========================================
   Table rendering
======================================== */

function renderTable(locations) {
  const tbody = gid('table-body');
  const filtered = applySortFilter(locations);

  if (filtered.length === 0) {
    tbody.innerHTML = `<div class="empty-state"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg><div class="empty-title">No locations found</div><div class="empty-sub">Try adjusting filters.</div></div>`;
    return;
  }

  tbody.innerHTML = filtered.map(l => {
    const cityName = getCityName(l.city_id);
    const catName = getCatName(l.category_id);
    const cc = CAT_COLORS[catName] || { bg: 'var(--gray-100)', color: 'var(--gray-600)' };

    const catTag = catName
      ? `<span class="city-tag" style="background:${cc.bg};color:${cc.color};border-color:transparent">${catName}</span>`
      : `<span style="font-size:12px;color:var(--gray-300);font-style:italic">—</span>`;

    const hours = normalizeHours(l.operating_hours);
    const hasHours = Object.keys(hours).length > 0;
    const dotKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    const dotsHtml = dotKeys.map((d, i) => {
      const day = hours[d];
      const is24 = day && day.open === '00:00' && day.close === '23:59';
      const cls = !day ? 'closed' : is24 ? 'allday' : 'open';
      return `<div class="day-dot ${cls}">${DAYS_LETTER[i]}</div>`;
    }).join('');

    const hoursHtml = hasHours
      ? `<div class="hours-days">${dotsHtml}</div>`
      : `<div class="hours-none">Not provided</div>`;

    const audioIcon = l.audio_file_link
      ? `<span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:#fdf4ff;color:#9333ea;flex-shrink:0"><svg width="8" height="8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zm-1 18.93V22h2v-2.07A8.001 8.001 0 0020 12h-2a6 6 0 01-12 0H4a8.001 8.001 0 007 7.93z"/></svg></span>`
      : '';

    const focalDot = (l.is_focal_point === true || l.is_focal_point === 'true')
      ? `<span style="width:7px;height:7px;border-radius:50%;background:#2563eb;display:inline-block;flex-shrink:0;margin-top:1px"></span>`
      : '';

    return `<div class="table-row" onclick="openEditModal('${l.id}')"><div><div style="display:flex;align-items:center;gap:6px"><div class="loc-name">${l.name}</div>${focalDot}${audioIcon}</div><div class="loc-addr">${l.address || '—'}</div></div><div><span class="city-tag">${cityName}</span></div><div>${catTag}</div><div>${hoursHtml}</div><div class="row-actions"><button class="icon-btn" onclick="event.stopPropagation();openEditModal('${l.id}')"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.4-9.4a2 2 0 112.8 2.8L11.8 15H9v-2.8l8.6-8.6z"/></svg></button><button class="icon-btn danger" onclick="event.stopPropagation();deleteLocation('${l.id}')"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button></div></div>`;
  }).join('');

  /* Keep full data available for rerendering during filter/sort */
  window._allLocations = locations;
}

/* ========================================
   Table sorting / filtering
======================================== */

function onSortChange(v) {
  [_sortKey, _sortDir] = v.split('-');
  filterTable();
}

function applySortFilter(locs) {
  const s = (gid('search-input')?.value || '').toLowerCase();
  const cf = gid('city-select')?.value || '';

  const filtered = locs.filter(l => {
    const matchesCity = !cf || l.city_id === cf;
    const cityName = getCityName(l.city_id).toLowerCase();

    return matchesCity && (
      !s ||
      l.name?.toLowerCase().includes(s) ||
      l.address?.toLowerCase().includes(s) ||
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
    } else if (_sortKey === 'category') {
      av = getCatName(a.category_id)?.toLowerCase() || '';
      bv = getCatName(b.category_id)?.toLowerCase() || '';
    } else if (_sortKey === 'updated') {
      av = a.updated_at || '';
      bv = b.updated_at || '';
    }

    return av < bv ? (_sortDir === 'asc' ? -1 : 1) : av > bv ? (_sortDir === 'asc' ? 1 : -1) : 0;
  });

  return filtered;
}

function filterTable() {
  if (window._allLocations) renderTable(window._allLocations);
}

/* ========================================
   Delete location
======================================== */

async function deleteLocation(id) {
  if (!confirm('Delete this location? ')) return;

  try {
    await sbFetch(`locations?id=eq.${id}`, {
      method: 'DELETE',
      prefer: 'return=minimal'
    });

    showToast('Location deleted.');
    updateLastUpdated(new Date().toISOString());
    loadAndRenderTable();
  } catch (e) {
    showToast('Delete failed: ' + e.message, 'error');
  }
}

/* ========================================
   Image handling
======================================== */

/* Switch between upload tab and URL tab */
function switchImgTab(field, mode, btn) {
  const tabs = btn.closest('.img-tabs').querySelectorAll('.img-tab');
  tabs.forEach(t => t.classList.remove('active'));
  btn.classList.add('active');

  gid(`${field}-upload-panel`).style.display = mode === 'upload' ? '' : 'none';
  gid(`${field}-url-panel`).style.display = mode === 'url' ? '' : 'none';
}

/* Upload a single profile image */
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

/* Upload one or more gallery images */
async function handleGalleryFiles(files) {
  for (const file of files) {
    try {
      const url = await uploadImage(file, 'gallery');
      addGalleryItem(url, file.name);
    } catch (e) {
      showToast(`Failed to upload ${file.name}`, 'error');
    }
  }
}

/* Add a gallery item to UI + local state */
function addGalleryItem(url, label) {
  if (galleryImageUrls.includes(url)) return;

  galleryImageUrls.push(url);

  const grid = gid('gallery-grid');
  const addBtn = gid('gallery-add-btn');
  const item = document.createElement('div');

  item.className = 'gallery-item';
  item.dataset.url = url;
  item.innerHTML = `<img src="${url}" alt="${label || ''}"><button class="gallery-item-remove" onclick="removeGalleryItem(this,'${url}')"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12"/></svg></button>`;

  grid.insertBefore(item, addBtn);
}

/* Remove one gallery item from UI + local state */
function removeGalleryItem(btn, url) {
  galleryImageUrls = galleryImageUrls.filter(u => u !== url);
  btn.closest('.gallery-item').remove();
}

/* Reset all image UI and image-related state */
function resetImageState() {
  profileImageUrl = null;
  galleryImageUrls = [];
  clearProfileImage();

  const grid = gid('gallery-grid');
  const addBtn = gid('gallery-add-btn');
  grid.innerHTML = '';
  grid.appendChild(addBtn);

  gid('f-profile-url').value = '';
  gid('f-gallery-url').value = '';

  qsa('#modal-location .img-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  gid('profile-upload-panel').style.display = '';
  gid('profile-url-panel').style.display = 'none';
}

/* ========================================
   Hours editor UI
======================================== */

/* Build the weekly hours editor markup */
function buildHoursEditor() {
  gid('hours-editor').innerHTML = DAYS.map(d => `
<div class="hours-row"><div class="hours-day">${d.label}</div><div class="hours-controls"><label class="toggle"><input type="checkbox" id="tog-${d.id}" onchange="toggleDay('${d.id}',this.checked)"><span class="toggle-track"></span></label><div class="hours-time-group" id="times-${d.id}" style="display:none"><input type="time" class="time-input" id="open-${d.id}" value="09:00" onchange="onTimeChange('${d.id}')"><span class="time-sep">to</span><input type="time" class="time-input" id="close-${d.id}" value="17:00" onchange="onTimeChange('${d.id}')"><button class="chip" id="chip24-${d.id}" onclick="set24('${d.id}')">24 hrs</button></div><div class="hours-closed-label" id="closed-${d.id}">Closed</div></div></div>`).join('');
}

/* Turn a day on/off */
function toggleDay(day, isOpen) {
  gid('times-' + day).style.display = isOpen ? 'flex' : 'none';
  gid('closed-' + day).style.display = isOpen ? 'none' : 'flex';
  updateDot(day);
}

/* Set selected day to 24-hour schedule */
function set24(day) {
  gid('open-' + day).value = '00:00';
  gid('close-' + day).value = '23:59';
  gid('chip24-' + day).classList.add('active');
  updateDot(day);
}

/* Remove 24-hour chip state when times change manually */
function onTimeChange(day) {
  gid('chip24-' + day).classList.remove('active');
  updateDot(day);
}

/* Update preview dot color for a day */
function updateDot(day) {
  const tog = gid('tog-' + day);
  const open = gid('open-' + day);
  const close = gid('close-' + day);
  const dot = gid('pd-' + day);

  if (!dot) return;

  if (!tog.checked) {
    dot.style.background = 'var(--gray-100)';
    dot.style.color = 'var(--gray-400)';
  } else if (open.value === '00:00' && close.value === '23:59') {
    dot.style.background = 'var(--accent-light)';
    dot.style.color = 'var(--accent)';
  } else {
    dot.style.background = 'var(--success-light)';
    dot.style.color = 'var(--success)';
  }
}

/* Set full state for one day */
function setDayState(day, isOpen, openVal, closeVal) {
  gid('tog-' + day).checked = isOpen;
  if (openVal) gid('open-' + day).value = openVal;
  if (closeVal) gid('close-' + day).value = closeVal;
  toggleDay(day, isOpen);

  const chip = gid('chip24-' + day);
  if (chip) chip.classList.toggle('active', isOpen && openVal === '00:00' && closeVal === '23:59');
}

/* Copy Monday hours to other checked days */
function copyMonToAll() {
  const o = gid('open-mon').value;
  const c = gid('close-mon').value;

  DAYS.forEach(d => {
    if (d.id !== 'mon' && gid('tog-' + d.id).checked) {
      gid('open-' + d.id).value = o;
      gid('close-' + d.id).value = c;
      gid('chip24-' + d.id).classList.remove('active');
      updateDot(d.id);
    }
  });
}

/* Quick-fill common open patterns */
function setPattern(pattern) {
  const wkd = ['mon', 'tue', 'wed', 'thu', 'fri'];
  const wkn = ['sat', 'sun'];

  DAYS.forEach(d => {
    const isOpen = pattern === 'all7'
      ? true
      : pattern === 'weekdays'
      ? wkd.includes(d.id)
      : pattern === 'weekend'
      ? wkn.includes(d.id)
      : false;

    setDayState(d.id, isOpen, '09:00', '17:00');
  });
}

/* Collect hours from editor into DB-ready format */
function collectHours() {
  const hours = {};

  DAYS.forEach(d => {
    if (gid('tog-' + d.id).checked) {
      const fullDay = DAY_SHORT_TO_FULL[d.id];
      hours[fullDay] = {
        open: gid('open-' + d.id).value,
        close: gid('close-' + d.id).value
      };
    }
  });

  return Object.keys(hours).length > 0 ? hours : null;
}

/* Populate hours editor from stored DB value */
function populateHours(raw) {
  const hours = normalizeHours(raw);
  DAYS.forEach(d => {
    const day = hours[d.id];
    setDayState(d.id, !!day, day ? day.open : '09:00', day ? day.close : '17:00');
  });
}

/* ========================================
   Form helpers
======================================== */

/* Show/hide "new city" input if needed */
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

/* ========================================
   Location modal
   Add / edit modal open + populate
======================================== */

function openAddModal() {
  editingId = null;
  buildHoursEditor();

  gid('modal-title').textContent = 'Add Location';
  gid('f-name').value = '';
  gid('f-addr').value = '';
  gid('f-desc').value = '';
  gid('f-lat').value = '';
  gid('f-lng').value = '';
  gid('f-city').value = '';

  if (gid('f-new-city')) {
    gid('f-new-city').value = '';
    gid('f-new-city').style.display = 'none';
  }

  gid('f-cat').value = '';
  gid('f-website').value = '';
  gid('f-phone').value = '';
  gid('f-speechify').value = '';
  gid('f-focal').checked = false;

  resetImageState();
  setPattern('none');
  openModal('modal-location');
}

/* Show current profile image in edit mode */
function setProfilePreview(url) {
  profileImageUrl = url;
  gid('profile-drop-zone').style.display = 'none';
  gid('profile-preview').style.display = '';
  gid('profile-preview').innerHTML = `<div class="img-preview"><img src="${url}" alt="Profile"><span class="img-preview-name">Current profile image</span><button class="img-preview-remove" onclick="clearProfileImage()"><svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12"/></svg></button></div>`;
}

async function openEditModal(id) {
  try {
    const [loc] = await sbFetch(`locations?id=eq.${id}&select=*`);
    if (!loc) return;

    editingId = id;
    buildHoursEditor();

    gid('modal-title').textContent = 'Edit Location';
    gid('f-name').value = loc.name || '';
    gid('f-addr').value = loc.address || '';
    gid('f-desc').value = loc.description || '';
    gid('f-lat').value = loc.latitude != null ? loc.latitude : '';
    gid('f-lng').value = loc.longitude != null ? loc.longitude : '';
    gid('f-city').value = loc.city_id || '';
    gid('f-cat').value = loc.category_id || '';
    gid('f-website').value = loc.website || '';
    gid('f-phone').value = loc.phone || '';
    gid('f-speechify').value = loc.audio_file_link || '';
    gid('f-focal').checked = !!loc.is_focal_point;

    resetImageState();

    if (loc.profile_image) setProfilePreview(loc.profile_image);
    if (loc.images && loc.images.length) loc.images.forEach(url => addGalleryItem(url, ''));

    populateHours(loc.operating_hours);
    openModal('modal-location');
  } catch (e) {
    showToast('Could not load location: ' + e.message, 'error');
  }
}

/* ========================================
   Import modal / CSV parsing
======================================== */

function openImportModal() {
  resetImportModal();

  const hint = gid('import-city-hint');
  if (hint && CITIES_DATA.length) {
    hint.textContent = CITIES_DATA.map(c => c.name).join(', ');
  }

  openModal('modal-import');
}

function resetImportModal() {
  gid('import-step-upload').style.display = '';
  gid('import-step-preview').style.display = 'none';
  gid('btn-import-confirm').style.display = 'none';
  gid('import-file-input').value = '';
  gid('import-preview-content').innerHTML = '';
  window._importRows = null;
}

/* Basic CSV parser that handles quoted values */
function parseCSV(text) {
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

/* CSV columns used for weekly hours import */
const CSV_DAY_COLS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/* Build operating_hours object from CSV row values */
function hoursFromCSVRow(row) {
  const hours = {};

  CSV_DAY_COLS.forEach(day => {
    const val = (row[`hours_${day}`] || '').trim();
    if (!val || val.toLowerCase() === 'closed' || val === '') return;

    const parts = val.split(/\s*[-–]\s*/);
    if (parts.length === 2) {
      const open = parseHourStr(parts[0].trim());
      const close = parseHourStr(parts[1].trim());
      if (open && close) hours[day] = { open, close };
    }
  });

  return Object.keys(hours).length > 0 ? hours : null;
}

/* Read CSV, validate rows, and build import preview */
async function handleImportFile(file) {
  if (!file) return;

  const text = await file.text();
  const { headers, rows } = parseCSV(text);

  if (!headers.includes('name') || !headers.includes('latitude') || !headers.includes('longitude') || !headers.includes('city')) {
    showToast('CSV missing required columns: name, city, latitude, longitude', 'error');
    return;
  }

  if (rows.length > 500) {
    showToast('Max 500 rows per import.', 'error');
    return;
  }

  const existing = await sbFetch('locations?select=name,city_id');
  const existingSet = new Set((existing || []).map(l => `${l.city_id}||${l.name.toLowerCase()}`));

  const processed = rows.map((row, i) => {
    const rowNum = i + 2;
    const name = row.name || '';
    const cityName = row.city || '';
    const lat = parseFloat(row.latitude);
    const lng = parseFloat(row.longitude);
    const errors = [];

    if (!name) errors.push('Missing name');
    if (!cityName) errors.push('Missing city');
    if (isNaN(lat)) errors.push('Invalid latitude');
    if (isNaN(lng)) errors.push('Invalid longitude');

    const cityObj = CITIES_DATA.find(c => c.name.toLowerCase() === cityName.toLowerCase());
    const catName = row.category || '';
    const catObj = catName ? CATEGORIES_DATA.find(c => c.name.toLowerCase() === catName.toLowerCase()) : null;

    if (catName && !catObj) errors.push(`Unknown category "${catName}"`);
    if (errors.length) return { rowNum, name, cityName, status: 'error', errors, row };

    const isDupe = cityObj && existingSet.has(`${cityObj.id}||${name.toLowerCase()}`);
    if (isDupe) return { rowNum, name, cityName, status: 'skip', reason: 'Already exists', row };

    return {
      rowNum,
      name,
      cityName,
      cityId: cityObj?.id || null,
      catId: catObj?.id || null,
      status: 'add',
      row
    };
  });

  window._importRows = processed;
  showImportPreview(processed, file.name);
}

/* Render import preview before final confirm */
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

    const errorHint = r.errors?.length
      ? `<div class="import-error-hint">${r.errors.join(', ')}</div>`
      : '';

    return `<div class="import-preview-row will-${r.status}"><div class="import-row-num">${r.rowNum}</div><div><div class="import-row-name">${r.name || '—'}</div>${errorHint}</div><div class="import-row-city">${r.cityName || '—'}</div><div class="import-row-status">${statusPill}</div></div>`;
  }).join('');

  gid('import-preview-content').innerHTML = summaryHtml + `<div class="import-preview-table">${headerHtml}${rowsHtml}</div>`;
  gid('import-step-upload').style.display = 'none';
  gid('import-step-preview').style.display = '';

  if (addCount > 0) {
    gid('btn-import-confirm').style.display = '';
    gid('btn-import-label').textContent = `Import ${addCount} location${addCount !== 1 ? 's' : ''}`;
  } else {
    gid('btn-import-confirm').style.display = 'none';
  }
}

/* Final import step: insert valid rows into Supabase */
async function confirmImport() {
  const rows = (window._importRows || []).filter(r => r.status === 'add');
  if (!rows.length) return;

  const btn = gid('btn-import-confirm');
  btn.disabled = true;
  gid('btn-import-label').textContent = 'Importing...';

  let added = 0;
  let failed = 0;

  for (const r of rows) {
    try {
      const now = new Date().toISOString();
      const cityId = r.cityId || await getOrCreateCity(r.cityName, +r.row.latitude, +r.row.longitude);
      const rr = r.row;

      const payload = {
        name: r.name,
        slug: generateSlug(r.name),
        city_id: cityId,
        category_id: r.catId || null,
        address: rr.address || null,
        description: rr.description || null,
        latitude: parseFloat(rr.latitude),
        longitude: parseFloat(rr.longitude),
        website: rr.website || null,
        phone: rr.phone || null,
        profile_image: rr.profile_image || null,
        audio_file_link: rr.audio_file_link || null,
        is_focal_point: (rr.is_focal_point || '').toUpperCase() === 'TRUE',
        operating_hours: hoursFromCSVRow(rr),
        created_at: now,
        updated_at: now
      };

      await sbFetch('locations', {
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
      ? `${added} location${added !== 1 ? 's' : ''} imported successfully.`
      : `${added} imported, ${failed} failed.`,
    failed > 0 ? 'error' : 'success'
  );
}

/* Download a ready-to-fill CSV template */
function downloadTemplate() {
  const headers = 'name,city,latitude,longitude,category,address,description,website,phone,profile_image,audio_file_link,is_focal_point,hours_monday,hours_tuesday,hours_wednesday,hours_thursday,hours_friday,hours_saturday,hours_sunday'.split(',');
  const exampleCityName = CITIES_DATA[0]?.name || 'Ocean Springs';
  const exampleCatName = CATEGORIES_DATA.find(c => c.name.includes('Eat'))?.name || 'Dining';

  const exampleRow = [
    'Example Cafe',
    exampleCityName,
    '30.4121',
    '-88.8269',
    exampleCatName,
    '123 Main St',
    'A local spot.',
    '',
    '',
    '',
    '',
    'FALSE',
    '9:00 AM-5:00 PM',
    '9:00 AM-5:00 PM',
    '9:00 AM-5:00 PM',
    '9:00 AM-5:00 PM',
    '9:00 AM-5:00 PM',
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
  a.download = 'journez_template.csv';
  a.click();

  URL.revokeObjectURL(url);
}

/* ========================================
   Save location
   Handles both add and edit
======================================== */

async function saveLocation() {
  const name = gid('f-name').value.trim();
  const citySel = gid('f-city');
  const cityVal = citySel.value;
  const newCityInput = gid('f-new-city')?.value.trim();
  const lat = parseFloat(gid('f-lat').value);
  const lng = parseFloat(gid('f-lng').value);

  if (!name) {
    showToast('Location name is required.', 'error');
    return;
  }

  if (!cityVal && !newCityInput) {
    showToast('Please select or enter a city.', 'error');
    return;
  }

  if (isNaN(lat) || isNaN(lng)) {
    showToast('Valid coordinates are required.', 'error');
    return;
  }

  const resolvedCityId = newCityInput ? await getOrCreateCity(newCityInput, lat, lng) : cityVal;

  let finalProfileUrl = profileImageUrl;
  const profileUrlInput = gid('f-profile-url').value.trim();
  if (!finalProfileUrl && profileUrlInput) finalProfileUrl = profileUrlInput;

  const galleryUrlInput = gid('f-gallery-url').value.trim();
  if (galleryUrlInput && !galleryImageUrls.includes(galleryUrlInput)) {
    galleryImageUrls.push(galleryUrlInput);
  }

  const payload = {
    name,
    slug: generateSlug(name),
    description: gid('f-desc').value.trim() || null,
    address: gid('f-addr').value.trim() || null,
    latitude: lat,
    longitude: lng,
    city_id: resolvedCityId,
    category_id: gid('f-cat').value || null,
    website: gid('f-website').value.trim() || null,
    phone: gid('f-phone').value.trim() || null,
    audio_file_link: gid('f-speechify').value.trim() || null,
    is_focal_point: gid('f-focal').checked,
    profile_image: finalProfileUrl || null,
    images: galleryImageUrls.length ? galleryImageUrls : [],
    operating_hours: collectHours(),
    updated_at: new Date().toISOString()
  };

  const btn = gid('btn-save-location');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    if (editingId) {
      await sbFetch(`locations?id=eq.${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      showToast('Location updated.');
      updateLastUpdated(new Date().toISOString());
    } else {
      payload.created_at = new Date().toISOString();
      await sbFetch('locations', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('Location added.');
      updateLastUpdated(new Date().toISOString());
    }

    closeModal('modal-location');
    loadAndRenderTable();
  } catch (e) {
    showToast('Save failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = SVG_CHECK + ' Save Location';
  }
}

/* ========================================
   Close modals when clicking backdrop
======================================== */

['modal-location', 'modal-import'].forEach(id => {
  gid(id)?.addEventListener('click', e => {
    if (e.target === gid(id)) closeModal(id);
  });
});

/* ========================================
   Page boot
   Builds page controls and wires events
======================================== */

document.addEventListener('DOMContentLoaded', async function () {
  /* Sidebar logo */
  const logoEl = document.querySelector('[class*="sidebar_logo-icon"]');
  if (logoEl) {
    logoEl.style.background = 'none';
    logoEl.innerHTML = '<img src="https://cdn.prod.website-files.com/63e53396a34018da90230c8e/66b1545192b2665e1e65817d_Journez%20Logo.svg" style="width:32px;height:32px">';
  }

  /* Build search / filter / sort controls */
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
          <option value="name-asc">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
          <option value="city-asc">City A–Z</option>
          <option value="city-desc">City Z–A</option>
          <option value="category-asc">Category A–Z</option>
          <option value="category-desc">Category Z–A</option>
          <option value="updated-desc">Updated ↓</option>
          <option value="updated-asc">Updated ↑</option>
        </select>
      </div>`;
    sectionHeader.appendChild(controls);

    gid('search-input')?.setAttribute('placeholder', 'Search locations');
    gid('search-input').addEventListener('input', filterTable);
    gid('city-select').addEventListener('change', filterTable);
  }

  /* Sign out button in top bar */
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

  /* Ensure table body exists */
  const tableWrap = gid('table-wrap');
  if (tableWrap && !gid('table-body')) {
    const tbody = document.createElement('div');
    tbody.id = 'table-body';
    tableWrap.appendChild(tbody);
  }

  /* Allow pressing Enter in gallery URL field to add image */
  gid('f-gallery-url')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const url = e.target.value.trim();
      if (url) {
        addGalleryItem(url, url);
        e.target.value = '';
      }
    }
  });

  /* Top actions */
  gid('btn-add-top')?.addEventListener('click', e => {
    e.preventDefault();
    openAddModal();
  });

  gid('btn-import')?.addEventListener('click', e => {
    e.preventDefault();
    openImportModal();
  });

  /* Final startup */
  await loadReferenceData();
  loadAndRenderTable();
});

/* ========================================
   Expose needed functions to inline HTML
======================================== */

window.signOut = signOut;
window.saveLocation = saveLocation;
window.closeModal = closeModal;
window.openAddModal = openAddModal;
window.openImportModal = openImportModal;
window.toggleNewCity = toggleNewCity;
window.switchImgTab = switchImgTab;
window.handleProfileFile = handleProfileFile;
window.handleGalleryFiles = handleGalleryFiles;
window.handleImportFile = handleImportFile;
window.confirmImport = confirmImport;
window.resetImportModal = resetImportModal;
window.downloadTemplate = downloadTemplate;
window.copyMonToAll = copyMonToAll;
window.setPattern = setPattern;
window.onSortChange = onSortChange;
window.openEditModal = openEditModal;
window.deleteLocation = deleteLocation;
window.removeGalleryItem = removeGalleryItem;
window.toggleDay = toggleDay;
window.set24 = set24;
window.onTimeChange = onTimeChange;
window.loadAndRenderTable = loadAndRenderTable;
window.clearProfileImage = clearProfileImage;
