// ===== EDIT THESE =====
const CFG = {
  SUPABASE_URL: 'https://tdokuihifeihuuiaabsk.supabase.co',
  SUPABASE_KEY: 'sb_publishable_NVD6FQ6SNR0hwHm1nz_W4A_RCBiwC1r',
  SCHOOL: 'Excellentia Digital Academy',
  MOTTO: 'Test yourself. Grow.',
  LOGO: '',                 // optional: URL or file name, e.g. 'logo.png'
  GREEN: '#0b6e4f', GOLD: '#f2b134',
  EMAIL_DOMAIN: 'school.local'   // students sign in as username@school.local
};
const CLASSES = ['JSS1','JSS2','JSS3','SS1','SS2','SS3'];
document.documentElement.style.setProperty('--green', CFG.GREEN);
document.documentElement.style.setProperty('--gold', CFG.GOLD);

// Teacher page and student page keep separate saved logins, so one never signs the other out
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, {
  auth: { storageKey: /\/admin(\.html)?\/?$/.test(location.pathname) ? 'cbt-admin-auth' : 'cbt-student-auth' }
});
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Math/science notation:  x^2  x^(n+1)  H_2O  H_(2)  [3/4]  -> sup / sub / fraction
function fmt(s) {
  return esc(s)
    .replace(/\^\(([^)]+)\)|\^([A-Za-z0-9+\-]+)/g, (_, a, b) => `<sup>${a || b}</sup>`)
    .replace(/_\(([^)]+)\)|_([A-Za-z0-9]+)/g, (_, a, b) => `<sub>${a || b}</sub>`)
    .replace(/\[(\w+)\/(\w+)\]/g, '<span class="frac"><span>$1</span><span>$2</span></span>')
    .replace(/\n/g, '<br>');
}

function toast(msg, bad) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.append(t); }
  t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(t._t); t._t = setTimeout(() => t.className = '', 4200);
}
function busy(btn, on) { btn.disabled = on; btn.dataset.l = btn.dataset.l || btn.textContent; btn.textContent = on ? 'Please wait…' : btn.dataset.l; }
async function run(btn, fn) {
  try { busy(btn, true); return await fn(); }
  catch (e) { toast(friendly(e.message || String(e)), true); }
  finally { busy(btn, false); }
}
function brand() {
  $$('.school').forEach(e => e.textContent = CFG.SCHOOL);
  $$('.motto').forEach(e => e.textContent = CFG.MOTTO);
  $$('.logo').forEach(e => { if (CFG.LOGO) { const im = document.createElement('img'); im.src = CFG.LOGO; im.alt = ''; e.replaceChildren(im); } else e.textContent = CFG.SCHOOL[0]; });
  document.title = CFG.SCHOOL + ' — CBT';
}
function theme() {
  const k = 'cbt-theme'; const set = v => document.documentElement.dataset.theme = v;
  set(localStorage.getItem(k) || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'));
  try { applySkin(localStorage.getItem('cbt-skin') || 'green'); } catch (e) { applySkin('green'); }
  $$('.themebtn').forEach(b => b.onclick = lookPicker);
}
// ===== Look & feel templates =====
const SKINS = [['green', 'Classic green'], ['ocean', 'Ocean blue'], ['royal', 'Royal purple'], ['sunset', 'Sunset orange'], ['rose', 'Rose pink'], ['slate', 'Slate grey'], ['notebook', 'Exercise book'], ['graph', 'Graph paper'], ['dots', 'Soft dots'], ['aurora', 'Aurora']];
function applySkin(k) { document.documentElement.dataset.skin = SKINS.some(s => s[0] === k) ? k : 'green'; }
function lookPicker() {
  const H = document.documentElement, d = document.createElement('div'); d.className = 'modal';
  d.innerHTML = `<div style="max-width:520px"><h2>Choose a look</h2>
    <div class="row"><button class="alt" data-m="light"></button><button class="alt" data-m="dark"></button></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">${SKINS.map(([k, n]) => `<button class="alt" data-k="${k}" style="padding:8px;text-align:left"><div data-skin="${k}" style="border-radius:8px;overflow:hidden;border:1px solid var(--line);background-color:var(--bg);background-image:var(--pat,none);background-size:var(--ps,auto)"><div style="background:var(--green);height:16px"></div><div style="height:34px"></div></div><span style="display:block;margin-top:6px;font-size:.9rem">${n}</span></button>`).join('')}</div>
    <p class="mute" style="margin:10px 0 0">Your choice is saved on this device. Patterns show in light mode.</p>
    <div class="row" style="margin-top:12px"><button id="lkX">Done</button></div></div>`;
  document.body.append(d);
  const paint = () => {
    const dark = H.dataset.theme === 'dark', cur = H.dataset.skin || 'green';
    $('[data-m=light]', d).textContent = (dark ? '' : '✓ ') + '☀️ Light'; $('[data-m=dark]', d).textContent = (dark ? '✓ ' : '') + '🌙 Dark';
    $$('[data-k]', d).forEach(b => { b.style.border = b.dataset.k === cur ? '2px solid var(--green)' : ''; });
  };
  d.onclick = e => {
    const mb = e.target.closest('[data-m]'), kb = e.target.closest('[data-k]');
    if (mb) { H.dataset.theme = mb.dataset.m; try { localStorage.setItem('cbt-theme', mb.dataset.m); } catch (x) {} paint(); }
    else if (kb) { applySkin(kb.dataset.k); try { localStorage.setItem('cbt-skin', kb.dataset.k); } catch (x) {} paint(); }
    else if (e.target === d || e.target.id === 'lkX') d.remove();
  };
  paint();
}
function parseCSV(text) {            // small RFC4180 parser
  const rows = []; let r = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { r.push(f); f = ''; }
    else if (c === '\n') { r.push(f); rows.push(r); r = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || r.length) { r.push(f); rows.push(r); }
  return rows.filter(x => x.some(v => v.trim()));
}

// Show / hide password button on login forms
(() => { const b = $('#sp'), p = $('#p'); if (!b || !p) return;
  b.onclick = () => { const hide = p.type === 'password'; p.type = hide ? 'text' : 'password'; b.textContent = hide ? 'Hide' : 'Show'; p.focus(); }; })();

// Random password without look-alike characters (0/O, 1/l/I)
function genPw(n = 8) {
  const A = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let p; do { p = [...crypto.getRandomValues(new Uint32Array(n))].map(v => A[v % A.length]).join(''); } while (!/[A-Za-z]/.test(p) || !/\d/.test(p));   // always has letters and numbers
  return p;
}
// Password strength rule used for teacher-set passwords and password changes. Returns a message, or '' when OK.
const COMMON_PW = ['12345678', '123456789', '1234567890', 'password', 'password1', 'qwertyui', 'qwerty123', '11111111', 'abcd1234', 'abc12345', 'iloveyou', '00000000', '87654321', 'school123', 'student123', 'welcome1', 'excellentia1'];
function weakPw(p) {
  p = String(p || '');
  if (p.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Use both letters and numbers.';
  if (/^(.)\1+$/.test(p) || COMMON_PW.includes(p.toLowerCase())) return 'That password is too easy to guess. Choose another.';
  return '';
}

// Show our own clear messages, but hide raw database/internal error text from users
function friendly(m) {
  m = String(m || '');
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(m)) return 'Network problem. Check your internet and try again.';
  if (/^(Exam |This exam|You have already|Wrong access|No questions|Too many|Not allowed|Password must|User not found|Student not found|You cannot reset|Registration is closed|Review is not|Attempt not|Not available|Too much|The network|Timed out|Invalid login|Password should|New password|User already|Request rate|.*rate limit|Name is too short|Invalid class|Username must|That username|You signed in)/i.test(m)) return m;
  console.error(m); return 'Something went wrong. Please try again, or tell your teacher.';
}
// Stop spreadsheet formula injection: text that starts with = + - @ is shown as text
const safeCell = v => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) ? "'" + v : v;

// "JSS 1A Diamond" when a section is known, otherwise "JSS1"
const classLabel = p => (p && p.section) ? ((p.class_level || '').replace(/\d+$/, '') + ' ' + p.section).trim() : ((p && p.class_level) || '');

// Password box helpers: delete the last character, or clear the whole box
(() => { const p = $('#p'), b = $('#pwBack'), c = $('#pwClear'); if (!p) return;
  if (b) b.onclick = () => { p.value = p.value.slice(0, -1); p.focus(); };
  if (c) c.onclick = () => { p.value = ''; p.focus(); }; })();

// ===== Study materials (shared by the student and admin pages) =====
const MAX_MB = 50;   // keep equal to the bucket limit in materials.sql (Supabase free plan: 50 MB per file)
const MK = { video: ['🎬', 'Video'], pdf: ['📄', 'PDF'], ppt: ['📊', 'Slides'], word: ['📝', 'Word'], link: ['🔗', 'Link'] };
const fsize = n => !n ? '' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const clsName = c => c === 'All' ? 'All classes' : c;
async function openMaterial(m) {
  if (m.kind === 'link') { if (/^https?:\/\//i.test(m.link_url || '')) window.open(m.link_url, '_blank', 'noopener,noreferrer'); return; }
  const bk = sb.storage.from('study-materials'), ttl = m.kind === 'video' ? 3600 : 900;   // link lifetime in seconds
  const [a, b] = await Promise.all([bk.createSignedUrl(m.file_path, ttl), bk.createSignedUrl(m.file_path, ttl, { download: m.file_name || true })]);
  if (a.error || b.error) return toast('Could not open this file. Please try again.', true);
  const d = document.createElement('div'); d.className = 'modal';
  d.innerHTML = `<div style="max-width:760px"><h2>${esc(m.title)}</h2>` +
    (m.kind === 'video' ? `<video class="mv" controls playsinline preload="metadata" src="${esc(a.data.signedUrl)}"></video><div class="row" style="align-items:center;margin-top:8px"><span class="mute" style="flex:0 0 auto">Size</span><input type="range" id="mvSz" min="40" max="100" step="5" value="100" aria-label="Video size"><button class="alt sm" id="mvFs" style="flex:0 0 auto">⛶ Full screen</button></div><p class="err" id="mvErr" style="display:none">This video can't be played in your browser. It was probably recorded in a format phones use (HEVC/H.265 or MOV). Tap Download to watch it, or ask your teacher to post it as an MP4 (H.264) file.</p>`
      : `<p class="mute">${m.kind === 'pdf' ? 'Tap Open to read it in a new tab, or Download to keep a copy.' : 'Tap Download, then open the file in Word or PowerPoint on your phone or computer.'}</p>`) +
    `<div class="row" style="margin-top:12px">${m.kind === 'pdf' ? `<a class="btn" target="_blank" rel="noopener noreferrer" href="${esc(a.data.signedUrl)}">Open</a>` : ''}` +
    `<a class="btn ${m.kind === 'video' ? 'alt' : ''}" href="${esc(b.data.signedUrl)}">Download</a><button class="alt" id="mvx">Close</button></div></div>`;
  document.body.append(d);
  let down = null; d.onpointerdown = e => { down = e.target; }; d.onclick = e => { if (e.target === d && down === d) d.remove(); };
  $('#mvx', d).onclick = () => d.remove();
  const vid = $('video', d);
  if (vid) {
    const sz = $('#mvSz', d), setSz = v => { vid.style.width = v + '%'; };
    try { const sv = +localStorage.getItem('cbt-vsize'); if (sv >= 40 && sv <= 100) sz.value = sv; } catch (e) {}
    setSz(sz.value);
    sz.oninput = () => { setSz(sz.value); try { localStorage.setItem('cbt-vsize', sz.value); } catch (e) {} };
    $('#mvFs', d).onclick = () => { const f = vid.requestFullscreen || vid.webkitRequestFullscreen || vid.webkitEnterFullscreen; try { if (f) Promise.resolve(f.call(vid)).catch(() => {}); } catch (e) {} };
    const showErr = () => { $('#mvErr', d).style.display = 'block'; };
    vid.addEventListener('error', showErr);
    setTimeout(() => { if (vid.isConnected && vid.readyState === 0) showErr(); }, 12000);   // never started loading
  }
}

// ===== Who is on the platform (feeds the admin "Sign-ins" tab) =====
let presenceT = null, presenceTok = null, presenceSub = null;
async function pingPresence() { try { await sb.rpc('ping_presence'); } catch (e) {} }
const presenceOnVis = () => { if (!document.hidden) pingPresence(); };
const presenceOnHide = () => {   // a last note as the page closes, so "left at" is accurate
  if (!presenceTok) return;
  try { fetch(CFG.SUPABASE_URL + '/rest/v1/rpc/touch_presence', { method: 'POST', keepalive: true, headers: { apikey: CFG.SUPABASE_KEY, Authorization: 'Bearer ' + presenceTok, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {}); } catch (e) {}
};
function stopPresence() {
  clearInterval(presenceT); presenceT = null; presenceTok = null;
  if (presenceSub) { presenceSub.unsubscribe(); presenceSub = null; }
  document.removeEventListener('visibilitychange', presenceOnVis); removeEventListener('pagehide', presenceOnHide);
}
function startPresence() {
  stopPresence();
  sb.auth.getSession().then(({ data }) => { presenceTok = data.session?.access_token || null; });
  presenceSub = sb.auth.onAuthStateChange((_e, s) => { presenceTok = s?.access_token || null; }).data.subscription;
  pingPresence();
  presenceT = setInterval(() => { if (!document.hidden) pingPresence(); }, 120000);
  document.addEventListener('visibilitychange', presenceOnVis); addEventListener('pagehide', presenceOnHide);
}
async function signOutLogged() { stopPresence(); try { await sb.rpc('log_signout'); } catch (e) {} await sb.auth.signOut(); }
