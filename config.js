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

const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);
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
  catch (e) { toast(e.message || String(e), true); }
  finally { busy(btn, false); }
}
function brand() {
  $$('.school').forEach(e => e.textContent = CFG.SCHOOL);
  $$('.motto').forEach(e => e.textContent = CFG.MOTTO);
  $$('.logo').forEach(e => { if (CFG.LOGO) e.innerHTML = `<img src="${CFG.LOGO}" alt="">`; else e.textContent = CFG.SCHOOL[0]; });
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
