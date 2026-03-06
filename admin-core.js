(function (window) {
  const SUPABASE_URL = 'https://zqwilzhwiwrqgjyptfoo.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpxd2lsemh3aXdycWdqeXB0Zm9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTk5Mzg1OTYsImV4cCI6MjAzNTUxNDU5Nn0.uWuBgX2d6PSiaveuAVBj-h6h6efHIiWIRGrsW0MH0qQ';
  const STORAGE_BUCKET = 'location-images';
  const LOGIN_URL = '/admin-login';

  function gid(id) {
    return document.getElementById(id);
  }

  function qsa(selector, root = document) {
    return root.querySelectorAll(selector);
  }

  function getSession() {
    try {
      return JSON.parse(sessionStorage.getItem('jrn_session'));
    } catch (err) {
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

      const errText = await res.text().catch(() => '');
      throw new Error(`Supabase error ${res.status}: ${errText}`);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  async function uploadImage(file, folder = 'profile') {
    const token = getAuthToken();
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const filePath = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${filePath}`,
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
      const errText = await res.text().catch(() => '');
      throw new Error(`Image upload failed${errText ? `: ${errText}` : ''}`);
    }

    return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${filePath}`;
  }

  function generateSlug(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  function showToast(message, type = 'success') {
    const wrap = gid('toast-wrap');

    if (!wrap) {
      console.log(`[${type}] ${message}`);
      return;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    wrap.appendChild(toast);

    setTimeout(() => toast.remove(), 3500);
  }

  function openModal(modalId) {
    const modal = typeof modalId === 'string' ? gid(modalId) : modalId;
    if (!modal) return;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(modalId) {
    const modal = typeof modalId === 'string' ? gid(modalId) : modalId;
    if (!modal) return;
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  function updateBadges(locationCount, eventCount) {
    const apply = () => {
      const locationBadge = gid('nav_badge');
      const eventBadge = gid('nav_badge_events');

      if (locationBadge) locationBadge.textContent = String(locationCount ?? 0);
      if (eventBadge) eventBadge.textContent = String(eventCount ?? 0);
    };

    apply();
    setTimeout(apply, 500);
  }

  let lastActionTime = null;

  function updateLastUpdated(isoString) {
    if (isoString) lastActionTime = isoString;

    const date = isoString ? new Date(isoString) : new Date();
    const dateText = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const timeText = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
    const isToday = date.toDateString() === new Date().toDateString();

    document.querySelectorAll('[class*="card_component"]').forEach((card) => {
      const label = card.querySelector('[class*="card_label"]');
      if (!label) return;
      if (!label.textContent.trim().toUpperCase().includes('LAST UPDATED')) return;

      const value = card.querySelector('[class*="card_value"]');
      const sub = card.querySelector('[class*="card_sub"]');

      if (value) value.textContent = isToday ? 'Today' : dateText;
      if (sub) sub.textContent = isToday ? timeText : `${dateText}, ${timeText}`;
    });
  }

  function getLastActionTime() {
    return lastActionTime;
  }

  window.JournezAdminCore = {
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
