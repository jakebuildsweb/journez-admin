Project Setup Summary Platform Stack

Frontend: Webflow

Admin logic: External JavaScript file

Backend: Supabase

Code hosting: GitHub

CDN delivery: jsDelivr

The Webflow page contains:

HTML layout

modal UI

form inputs

inline onclick handlers

The application logic lives in locations.js on GitHub.

Working Script Loading Setup Webflow script tag

Placed in Before custom code.

Format used:

<script src="https://cdn.jsdelivr.net/gh/jakebuildsweb/journez-admin@COMMIT_HASH/locations.js"></script>
Example:

<script src="https://cdn.jsdelivr.net/gh/jakebuildsweb/journez-admin@a3f9c6ef1b0d4b8d2c9f4e2a9c7d1e4f6a8b3c2/locations.js"></script>
Important

Do NOT use:

raw.githubusercontent.com

or

@branch-name

because jsDelivr may cache those versions aggressively.

Use commit SHA pinning during development.

locations.js Requirements

The external JS file must contain plain JavaScript only.

Correct const SVG_CHECK = '<svg ...>'; const gid = id => document.getElementById(id); Incorrect

<script> const SVG_CHECK = ... </script>
External scripts cannot contain <script> tags.

Function Scope Requirement

Because Webflow HTML uses inline handlers like:

onclick="saveLocation()" onclick="closeModal('modal-location')"

functions must be exposed globally.

Add this at the bottom of locations.js:

window.saveLocation = saveLocation; window.closeModal = closeModal; window.openAddModal = openAddModal; window.openImportModal = openImportModal; window.toggleNewCity = toggleNewCity; window.switchImgTab = switchImgTab; window.handleProfileFile = handleProfileFile; window.handleGalleryFiles = handleGalleryFiles; window.handleImportFile = handleImportFile; window.confirmImport = confirmImport; window.resetImportModal = resetImportModal; window.downloadTemplate = downloadTemplate; window.copyMonToAll = copyMonToAll; window.setPattern = setPattern; window.onSortChange = onSortChange; window.openEditModal = openEditModal; window.deleteLocation = deleteLocation; window.removeGalleryItem = removeGalleryItem; window.toggleDay = toggleDay; window.set24 = set24; window.onTimeChange = onTimeChange; window.loadAndRenderTable = loadAndRenderTable; Supabase Configuration

Inside locations.js:

const SUPABASE_URL = 'https://zqwilzhwiwrqgjyptfoo.supabase.co'; const SUPABASE_ANON = 'YOUR_PUBLIC_ANON_KEY'; const STORAGE_BUCKET = 'location-images';

Requests use:

/rest/v1/locations /rest/v1/cities /rest/v1/categories

Authentication handled with:

sessionStorage.getItem('jrn_session') Admin Authentication Flow

Admin session stored in:

sessionStorage

Session key:

jrn_session

Redirect logic:

LOGIN_URL = '/admin-login'

Session validation runs immediately when the script loads.

UI Structure in Webflow

Webflow page provides:

Main components

Location modal

Import modal

Hours editor

Table container

Toast notifications

Important IDs used by JS toast-wrap modal-location modal-import f-name f-city f-cat f-addr f-desc f-lat f-lng f-website f-phone f-speechify f-focal gallery-grid gallery-add-btn hours-editor table-body search-input city-select

JS relies heavily on these IDs.

Major Bugs We Fixed

JavaScript syntax error
Earlier console error:

missing ) after argument list

This prevented any script execution.

Webflow 50k custom code limit
Solution:

move JS to GitHub

load externally

Chrome ORB blocking
Using:

raw.githubusercontent.com

caused:

ERR_BLOCKED_BY_ORB

Fix: use jsDelivr CDN.

jsDelivr branch caching
Branch URLs like:

@patch-1

served stale code.

Fix: Use commit hash URL.

External JS wrapped in <script> tags
The file contained:

<script> which prevented execution. Fix: remove tags. Current Verified Tests These now succeed: typeof saveLocation "function" typeof loadAndRenderTable "function" Script successfully executes. Recommended GitHub Repo Structure journez-admin │ ├─ locations.js ├─ events.js ├─ admin.css └─ README.md Webflow should only contain: HTML minimal layout CSS script loader All logic stays in GitHub. Recommended Next Improvements 1. Split large JS file Current file contains: API UI rendering CSV import image upload hours editor Better structure: locations-api.js locations-ui.js locations-hours.js locations-import.js 2. Add versioning Use: @commit-hash for production deploys. 3. Add GitHub workflow Eventually you can auto-publish builds to: Cloudflare Pages Vercel Netlify instead of jsDelivr. Current System Flow Webflow page loads ↓ locations.js loads from jsDelivr ↓ session check runs ↓ reference data fetched from Supabase ↓ table renders ↓ modal forms interact with Supabase If you'd like The next step I strongly recommend is creating a clean development workspace so you can: edit code locally push to GitHub auto-deploy JS avoid CDN cache issues keep Webflow as just the UI layer I can walk you through setting up a proper Webflow + GitHub dev workflow in about 5–10 minutes.
