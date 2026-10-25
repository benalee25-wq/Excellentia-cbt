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
  $$('.themebtn').forEach(b => b.onclick = () => { const v = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem(k, v); set(v); });
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
    (m.kind === 'video' ? `<video class="mv" controls playsinline preload="metadata" src="${esc(a.data.signedUrl)}"></video><p class="err" id="mvErr" style="display:none">This video can't be played in your browser. It was probably recorded in a format phones use (HEVC/H.265 or MOV). Tap Download to watch it, or ask your teacher to post it as an MP4 (H.264) file.</p>`
      : `<p class="mute">${m.kind === 'pdf' ? 'Tap Open to read it in a new tab, or Download to keep a copy.' : 'Tap Download, then open the file in Word or PowerPoint on your phone or computer.'}</p>`) +
    `<div class="row" style="margin-top:12px">${m.kind === 'pdf' ? `<a class="btn" target="_blank" rel="noopener noreferrer" href="${esc(a.data.signedUrl)}">Open</a>` : ''}` +
    `<a class="btn ${m.kind === 'video' ? 'alt' : ''}" href="${esc(b.data.signedUrl)}">Download</a><button class="alt" id="mvx">Close</button></div></div>`;
  document.body.append(d);
  let down = null; d.onpointerdown = e => { down = e.target; }; d.onclick = e => { if (e.target === d && down === d) d.remove(); };
  $('#mvx', d).onclick = () => d.remove();
  const vid = $('video', d);
  if (vid) {
    const showErr = () => { $('#mvErr', d).style.display = 'block'; };
    vid.addEventListener('error', showErr);
    setTimeout(() => { if (vid.isConnected && vid.readyState === 0) showErr(); }, 12000);   // never started loading
  }
}
