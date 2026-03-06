(function (window) {
  const SUPABASE_URL = 'https://zqwilzhwiwrqgjyptfoo.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpxd2lsemh3aXdycWdqeXB0Zm9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTk5Mzg1OTYsImV4cCI6MjAzNTUxNDU5Nn0.uWuBgX2d6PSiaveuAVBj-h6h6efHIiWIRGrsW0MH0qQ';
  const STORAGE_BUCKET = 'location-images';
  const LOGIN_URL = '/admin-login';

  function gid(id) {
    return document.getElementById(id);
  }

  function qsa(sel, root = document) {
    return root.querySelectorAll(sel);
  }

  function getSession() {
    try {
      return JSON.parse(sessionStorage.getItem('jrn_session'));
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    sessionStorage.removeItem('jrn_session');
  }

  function getAuthToken() {
    const session = getSession();
    return session?.access_token || null;
  }

  function requireSession() {
    const session = getSession();

    if (!session || !session.access_token) {
      window.location.href = LOGIN_URL;
      return false;
    }

    if (session.expires_at && Date.now() / 1000 > session.expires_at - 60) {
      clearSession();
      window.location.href = LOGIN_URL;
      return false;
    }

    return true;
  }

  function signOut() {
    clearSession();
    window.location.href = LOGIN_URL;
  }

  async function sbFetch(path, opts = {}) {
    const token = getAuthToken();

    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...opts,
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${token || SUPABASE_ANON}`,
        'Content-Type': 'application/json',
        Prefer: opts.prefer || 'return=representation',
        ...opts.headers,
      },
    });

    if (!res.ok) {
      if (res.status === 401) {
        clearSession();
        window.location.href = LOGIN_URL;
        return;
      }

      const err = await res.text();
      throw new Error(`Supabase error ${res.status}: ${err}`);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  async function uploadImage(file, folder = 'profile') {
    const token = getAuthToken();
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${token || SUPABASE_ANON}`,
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      }
    );

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Image upload failed${err ? `: ${err}` : ''}`);
    }

    return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
  }

  function generateSlug(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  function showToast(msg, type = 'success') {
    const wrap = gid('toast-wrap');
    if (!wrap) {
      console.log(`[${type}] ${msg}`);
      return;
    }

    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    wrap.appendChild(t);

    setTimeout(() => t.remove(), 3500);
  }

  function closeModal(modalId) {
    const modal = typeof modalId === 'string' ? gid(modalId) : modalId;
    if (!modal) return;

    modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  function openModal(modalId) {
    const modal = typeof modalId === 'string' ? gid(modalId) : modalId;
    if (!modal) return;

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function updateBadges(locCount, evtCount) {
    const apply = () => {
      const locBadge = gid('nav_badge');
      const evtBadge = gid('nav_badge_events');

      if (locBadge) locBadge.textContent = String(locCount ?? 0);
      if (evtBadge) evtBadge.textContent = String(evtCount ?? 0);
    };

    apply();
    setTimeout(apply, 500);
  }

  let lastActionTime = null;

  function updateLastUpdated(iso) {
    if (iso) lastActionTime = iso;

    const d = iso ? new Date(iso) : new Date();
    const ds = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const ts = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const today = d.toDateString() === new Date().toDateString();

    document.querySelectorAll('[class*="card_component"]').forEach((card) => {
      const lbl = card.querySelector('[class*="card_label"]');
      if (!lbl) return;
      if (!lbl.textContent.trim().toUpperCase().includes('LAST UPDATED')) return;

      const value = card.querySelector('[class*="card_value"]');
      const sub = card.querySelector('[class*="card_sub"]');

      if (value) value.textContent = today ? 'Today' : ds;
      if (sub) sub.textContent = today ? ts : `${ds}, ${ts}`;
    });
  }

  function getLastActionTime() {
    return lastActionTime;
  }

  window.JournezAdminCore = {
    SUPABASE_URL,
    SUPABASE_ANON,
    STORAGE_BUCKET,
    LOGIN_URL,
    gid,
    qsa,
    getSession,
    clearSession,
    getAuthToken,
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
    getLastActionTime,
  };
})(window);
