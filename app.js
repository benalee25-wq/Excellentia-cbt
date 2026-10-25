let me = null, ex = null, tick = null, saveT = null, tabs = 0;
const TOK_KEY = 'cbt-token';
const tok = () => localStorage.getItem(TOK_KEY);
const show = id => { ['vLogin', 'vApp'].forEach(x => $('#' + x).classList.toggle('hide', x !== id)); };
brand(); theme();

// ---------- auth ----------
$('#bLogin').onclick = e => run(e.target, async () => {
  $('#lerr').textContent = '';
  const email = $('#u').value.trim().toLowerCase() + '@' + CFG.EMAIL_DOMAIN;
  const pw = $('#p').value;
  let { error } = await sb.auth.signInWithPassword({ email, password: pw });
  if (error && pw !== pw.trim()) ({ error } = await sb.auth.signInWithPassword({ email, password: pw.trim() }));   // stray space copied with the password
  if (error) {
    const creds = /invalid login credentials/i.test(error.message) || error.code === 'invalid_credentials';
    $('#lerr').textContent = creds ? 'Wrong username or password. Check and try again.' : `Sign-in problem: ${error.message}. Please tell your teacher.`;
    if (creds) { $('#p').value = ''; $('#p').focus(); }
    return;
  }
  await boot(true);
});
$('#p').addEventListener('keydown', e => { if (e.key === 'Enter') $('#bLogin').click(); });   // no return value, so Backspace and other keys are never blocked
$('#bForgot').onclick = () => { $('#fp').classList.toggle('hide'); $('#fu').value = $('#u').value; };
$('#bReq').onclick = e => run(e.target, async () => {
  const u = $('#fu').value.trim(); if (!u) return toast('Type your username first.', true);
  const { error } = await sb.rpc('request_reset', { uname: u }); if (error) throw error;
  $('#fmsg').textContent = 'Request sent. Tell your teacher your name so they can give you a new password.';
});
$('#bOut').onclick = async () => { if (ex && !(await askYes('Leave the exam?', 'Your answers are saved and you can resume.', 'Sign out', 'Stay'))) return; clearInterval(tick); ex = null; localStorage.removeItem(TOK_KEY); await sb.auth.signOut(); show('vLogin'); };

async function boot(fresh) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return show('vLogin');
  const { data: p } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  if (!p) { toast('Profile missing. Ask your teacher.', true); return show('vLogin'); }
  if (p.role === 'admin') { await sb.auth.signOut(); show('vLogin'); $('#lerr').textContent = 'This is a teacher account. Teachers sign in on the admin page.'; return; }
  me = p;
  if (fresh || !tok()) { localStorage.setItem(TOK_KEY, crypto.randomUUID()); await sb.rpc('claim_session', { tok: tok() }); }
  $('#who').textContent = `${p.full_name} · ${classLabel(p)}`;
  show('vApp'); dash();
}

// ---------- dashboard ----------
async function dash() {
  await sb.rpc('finalize_mine');   // an exam whose time ran out is marked now, with the answers already saved
  $('#main').innerHTML = '<p class="mute">Loading exams…</p>';
  const { data, error } = await sb.rpc('list_exams');
  if (error) return $('#main').innerHTML = `<p class="err">${esc(error.message)}</p>`;
  const now = Date.now(), fm = d => d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const done = data.filter(x => x.submitted_at);
  const open = data.filter(x => !x.submitted_at && (!x.start_at || new Date(x.start_at) <= now) && (!x.end_at || new Date(x.end_at) >= now));
  const soon = data.filter(x => !x.submitted_at && x.start_at && new Date(x.start_at) > now);
  const missed = data.filter(x => !x.submitted_at && x.end_at && new Date(x.end_at) < now);
  const card = (x, body) => `<div class="card"><h3>${esc(x.title)}</h3><p class="mute">${esc(x.subject)}${x.term ? ' · ' + esc(x.term) : ''} · ${x.duration_min} min · ${x.num_questions} questions</p>${body}</div>`;
  let h = `<p style="text-align:right;margin:0"><button class="alt sm" id="bPw">Change password</button></p><h2>Ready to take</h2>`;
  h += open.map(x => card(x, `${x.attempt_id ? '<span class="badge gold">In progress</span> ' : ''}${x.end_at ? `<p class="mute">Closes ${fm(x.end_at)}</p>` : ''}<button data-go="${x.id}" data-code="${x.has_code}">${x.attempt_id ? 'Resume exam' : 'Start exam'}</button>`)).join('') || '<p class="mute">No exam is open right now.</p>';
  if (soon.length) h += `<h2>Upcoming</h2>` + soon.map(x => card(x, `<p>Opens ${fm(x.start_at)}</p>`)).join('');
  if (done.length) h += `<h2>Completed</h2>` + done.map(x => { const pc = x.total ? Math.round(x.score / x.total * 100) : 0; return card(x, `<p><b>${x.score}/${x.total}</b> (${pc}%) <span class="badge ${pc >= x.pass_mark ? 'ok' : 'bad'}">${pc >= x.pass_mark ? 'Passed' : 'Not passed'}</span></p>${x.show_review ? `<button class="alt sm" data-rev="${x.attempt_id}">Review answers</button>` : ''}`); }).join('');
  if (missed.length) h += `<h2>Missed</h2>` + missed.map(x => card(x, `<p class="mute">Closed ${fm(x.end_at)}</p>`)).join('');
  $('#main').innerHTML = h;
  $('#bPw').onclick = changePw;
  $$('[data-go]').forEach(b => b.onclick = () => begin(b, b.dataset.go, b.dataset.code === 'true' && !data.find(x => x.id === b.dataset.go).attempt_id));
  $$('[data-rev]').forEach(b => b.onclick = () => review(b.dataset.rev));
}

function changePw() {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div><h2>Change password</h2><label for="np0">Current password</label><input id="np0" type="password" autocomplete="current-password">
  <label for="np1">New password (8 or more characters)</label><input id="np1" type="password" autocomplete="new-password">
  <label for="np2">Type the new password again</label><input id="np2" type="password" autocomplete="new-password">
  <div class="row" style="margin-top:12px"><button id="npok">Save</button><button class="alt" id="npx">Cancel</button></div></div>`;
  document.body.append(m); $('#npx').onclick = () => m.remove();
  $('#npok').onclick = e => run(e.target, async () => {
    const n = $('#np1').value; if (n.length < 8) return toast('Use at least 8 characters.', true);
    if (n !== $('#np2').value) return toast('The two new passwords do not match.', true);
    const { data: { user } } = await sb.auth.getUser();
    const { error: e0 } = await sb.auth.signInWithPassword({ email: user.email, password: $('#np0').value });
    if (e0) return toast('Your current password is not correct.', true);
    const { error } = await sb.auth.updateUser({ password: n, current_password: $('#np0').value });   // works whether or not Supabase requires the current password if (error) return toast(friendly(error.message), true);
    m.remove(); toast('Password changed.');
  });
}

// ---------- exam ----------
// In-page question boxes (phone browsers can silently block the built-in confirm/prompt pop-ups)
function askYes(title, body, yes = 'Yes', no = 'Go back') {
  return new Promise(res => {
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div><h2>${esc(title)}</h2><p style="white-space:pre-line">${esc(body)}</p><div class="row" style="margin-top:12px"><button id="aY">${esc(yes)}</button><button class="alt" id="aN">${esc(no)}</button></div></div>`;
    document.body.append(m);
    const done = v => { m.remove(); res(v); };
    $('#aY', m).onclick = () => done(true); $('#aN', m).onclick = () => done(false);
  });
}
function askCode() {
  return new Promise(res => {
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div><h2>Access code</h2><p class="mute">Type the access code from your teacher.</p><input id="aC" autocapitalize="none" autocomplete="off"><div class="row" style="margin-top:12px"><button id="aY">Start</button><button class="alt" id="aN">Cancel</button></div></div>`;
    document.body.append(m); $('#aC', m).focus();
    const done = v => { m.remove(); res(v); };
    $('#aY', m).onclick = () => done($('#aC', m).value.trim());
    $('#aN', m).onclick = () => done(null);
    $('#aC', m).addEventListener('keydown', e => { if (e.key === 'Enter') $('#aY', m).click(); });
  });
}
async function begin(btn, id, needCode) {
  let code = '';
  if (needCode) { code = await askCode(); if (code === null) return; }
  await run(btn, async () => {
    const { data, error } = await sb.rpc('start_exam', { eid: id, code, tok: tok() });
    if (error) return toast(friendly(error.message.replace('SESSION_REPLACED: ', '')), true);
    if (data.error) return toast(data.error, true);
    if (data.expired) { toast('Time was up, so your exam was submitted.'); return dash(); }
    ex = { ...data, cur: 0, tabs: 0, skew: new Date(data.now) - Date.now(), flags: new Set(data.flags || []), ans: data.answers || {} };
    ex.qs = data.questions;
    ex.shuf = ex.qs.map(q => seeded(ex.attempt_id + q.id)); // per-student option order
    renderExam(); startTimer();
  });
}
function seeded(seed) {      // deterministic shuffle of ['a','b','c','d'] by seed
  let h = 2166136261; for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  const r = () => (h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 4294967296;
  const a = ['a', 'b', 'c', 'd']; for (let i = 3; i > 0; i--) { const j = Math.floor(r() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a;
}
function renderExam() {
  const q = ex.qs[ex.cur], L = ['A', 'B', 'C', 'D'];
  const opts = ex.shuf[ex.cur].filter(k => q[k]);
  $('#main').innerHTML = `
  <div class="card" style="position:sticky;top:58px;z-index:4"><div class="row" style="align-items:center"><b>${esc(ex.title)}</b><span class="timer" id="tm" style="flex:none;min-width:0"></span></div></div>
  <div class="card">
    <p class="mute">Question ${ex.cur + 1} of ${ex.qs.length} · ${q.marks} mark${q.marks > 1 ? 's' : ''}</p>
    ${q.image ? `<img class="qimg" src="${esc(q.image)}" alt="Diagram for question ${ex.cur + 1}">` : ''}
    <div class="qtext">${fmt(q.question)}</div>
    ${opts.map((k, i) => `<button class="opt ${ex.ans[q.id] === k.toUpperCase() ? 'sel' : ''}" data-k="${k.toUpperCase()}"><i>${L[i]}</i><span>${fmt(q[k])}</span></button>`).join('')}
    <button class="alt sm" id="bFlag">${ex.flags.has(q.id) ? '⚑ Flagged — tap to unflag' : '⚐ Flag for review'}</button>
  </div>
  <div class="bar"><button class="alt" id="bPrev" ${ex.cur === 0 ? 'disabled' : ''}>Previous</button>
    ${ex.cur < ex.qs.length - 1 ? '<button id="bNext">Next</button>' : '<button class="gold" id="bSub">Submit exam</button>'}</div>
  <div class="card"><h3>Questions <span class="mute" id="cnt"></span></h3><div class="nav">${ex.qs.map((x, i) => `<button data-i="${i}" class="${ex.ans[x.id] ? 'done' : ''} ${ex.flags.has(x.id) ? 'flag' : ''} ${i === ex.cur ? 'cur' : ''}">${i + 1}</button>`).join('')}</div>
  <p class="mute">Green = answered · Gold ring = flagged · Plain = not answered</p></div>`;
  $('#cnt').textContent = `(${Object.keys(ex.ans).length} of ${ex.qs.length} answered)`;
  $$('.opt').forEach(b => b.onclick = () => { ex.ans[q.id] = b.dataset.k; persist(); renderExam(); });
  $('#bFlag').onclick = () => { ex.flags.has(q.id) ? ex.flags.delete(q.id) : ex.flags.add(q.id); persist(); renderExam(); };
  $('#bPrev').onclick = () => { ex.cur--; renderExam(); scrollTo(0, 0); };
  if ($('#bNext')) $('#bNext').onclick = () => { ex.cur++; renderExam(); scrollTo(0, 0); };
  if ($('#bSub')) $('#bSub').onclick = async () => {
    const un = ex.qs.length - Object.keys(ex.ans).length, fl = ex.flags.size;
    if (await askYes('Submit your exam?', `${un ? un + ' question(s) unanswered.\n' : ''}${fl ? fl + ' flagged.\n' : ''}You cannot retake this exam.`, 'Yes, submit', 'Go back')) submit();
  };
  $$('.nav button').forEach(b => b.onclick = () => { ex.cur = +b.dataset.i; renderExam(); scrollTo(0, 0); });
  tickUI();
}
function persist() {          // autosave: local copy instantly, server shortly after
  clearTimeout(saveT); saveT = setTimeout(sync, 600);
}
async function sync() {
  if (!ex) return;
  const { error } = await sb.rpc('save_progress', { aid: ex.attempt_id, ans: ex.ans, flg: [...ex.flags], tabs: ex.tabs, tok: tok() });
  if (error) { if (/SESSION_REPLACED/.test(error.message)) kicked(); else { toast('Offline — answers saved on this phone, retrying…', true); setTimeout(sync, 5000); } }
}
function kicked() { clearInterval(tick); ex = null; sb.auth.signOut().then(() => { show('vLogin'); $('#lerr').textContent = 'You signed in on another device, so this session ended. Sign in again, tap Resume exam, then submit.'; }); }
function startTimer() { clearInterval(tick); tick = setInterval(tickUI, 1000); }
function tickUI() {
  if (!ex) return;
  const left = Math.floor((new Date(ex.ends_at) - (Date.now() + ex.skew)) / 1000), t = $('#tm');
  if (left <= 0) { clearInterval(tick); toast('Time is up. Submitting…'); return submit(true); }
  if (t) { const m = Math.floor(left / 60), s = left % 60; t.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; t.classList.toggle('low', left <= 300); }
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const slow = (p, ms = 20000) => Promise.race([p, wait(ms).then(() => ({ data: null, error: { message: 'The network is slow or offline.' } }))]);
async function submit(auto) {
  if (!ex || ex.submitting) return; ex.submitting = true; clearInterval(tick); clearTimeout(saveT);
  const aid = ex.attempt_id;
  $('#main').innerHTML = `<div class="card"><h2>Submitting your answers…</h2><p class="mute">${auto ? 'Time is up. ' : ''}Please keep this page open.</p></div>`;
  scrollTo(0, 0);
  let msg = '';
  for (let i = 0; i < 3; i++) {
    await slow(sb.rpc('save_progress', { aid, ans: ex.ans, flg: [...ex.flags], tabs: ex.tabs, tok: tok() }));
    const { data, error } = await slow(sb.rpc('submit_attempt', { aid, tok: tok() }));
    if (!error) return showScore(data, auto, aid);
    msg = error.message; if (/SESSION_REPLACED/.test(msg)) break;
    await wait(1500 * (i + 1));
  }
  if (/SESSION_REPLACED/.test(msg)) { clearInterval(tick); ex = null; return $('#main').innerHTML = `<div class="card"><h2>Sign in again to submit</h2><p>This phone was signed out because the same login was used on another device. Your answers are saved.</p><p>Tap the button, sign in, then tap <b>Resume exam</b> and <b>Submit exam</b>.</p><button id="bRe" style="width:100%">Sign in again</button></div>`, $('#bRe').onclick = () => { localStorage.removeItem(TOK_KEY); sb.auth.signOut().then(() => show('vLogin')); }; }
  $('#main').innerHTML = `<div class="card"><h2>Could not submit yet</h2><p class="err">${esc(msg)}</p><p>Your answers are saved on this phone. Check your internet, then tap Try again.</p><button id="bRetry" style="width:100%">Try again</button></div>`;
  $('#bRetry').onclick = () => { ex.submitting = false; submit(auto); };
}
function showScore(data, auto, aid) {
  localStorage.removeItem('cbt-' + aid); ex = null;
  $('#main').innerHTML = `<div class="card"><p class="mute" style="text-align:center">${auto ? 'Time ran out — your exam was submitted.' : 'Exam submitted.'}</p>
   <p class="score">${data.score}/${data.total}</p><p style="text-align:center;font-size:1.3rem">${data.percent}% · <span class="badge ${data.passed ? 'ok' : 'bad'}">${data.passed ? 'Passed' : 'Not passed'}</span></p>
   <div class="row"><button id="bHome">Back to exams</button>${data.show_review ? '<button class="alt" id="bRev">Review answers</button>' : ''}</div></div>`;
  $('#bHome').onclick = dash; if ($('#bRev')) $('#bRev').onclick = () => review(aid);
}
async function review(aid) {
  const { data, error } = await sb.rpc('get_review', { aid });
  if (error) return toast(friendly(error.message), true);
  $('#main').innerHTML = `<button class="alt sm" id="bBack">← Back</button>` + data.map((q, i) => `<div class="card"><p class="mute">Question ${i + 1}</p><div class="qtext">${fmt(q.question)}</div>
   ${['a', 'b', 'c', 'd'].filter(k => q[k]).map(k => { const K = k.toUpperCase(); return `<div class="opt ${K === q.correct ? 'right' : K === q.chosen ? 'wrong' : ''}"><i>${K}</i><span>${fmt(q[k])} ${K === q.correct ? '✓' : K === q.chosen ? '✗ your answer' : ''}</span></div>`; }).join('')}
   ${q.chosen ? '' : '<p class="err">You did not answer this question.</p>'}${q.explanation ? `<p><b>Why:</b> ${fmt(q.explanation)}</p>` : ''}</div>`).join('');
  $('#bBack').onclick = dash;
}

// ---------- integrity: log tab switches / leaving ----------
document.addEventListener('visibilitychange', () => { if (ex && document.hidden) { ex.tabs++; sync(); } else if (ex && !document.hidden) tickUI(); });   // coming back to the page: check the time straight away
addEventListener('blur', () => { if (ex && !document.hidden) { ex.tabs++; toast('Warning: leaving the exam screen is recorded.', true); } });
addEventListener('beforeunload', e => { if (ex) { e.preventDefault(); e.returnValue = ''; } });
addEventListener('online', () => ex && sync());
document.addEventListener('contextmenu', e => ex && e.preventDefault());

boot(false);
