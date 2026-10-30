const show = id => ['vLogin', 'vApp'].forEach(x => $('#' + x).classList.toggle('hide', x !== id));
const opts = (arr, sel) => arr.map(x => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');
const dl = (name, text, type = 'text/csv') => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); };
const csvCell = v => { v = safeCell(v); return /[",\n]/.test(v ?? '') ? '"' + String(v).replace(/"/g, '""') + '"' : (v ?? ''); };
const loc = d => { if (!d) return ''; const t = new Date(d); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); return t.toISOString().slice(0, 16); };
let tab = 'bank';
brand(); theme();

// ---------- auth ----------
$('#bLogin').onclick = e => run(e.target, async () => {
  const v = $('#u').value.trim().toLowerCase();
  const email = v.includes('@') ? v : v + '@' + CFG.EMAIL_DOMAIN, pw = $('#p').value;
  let { error } = await sb.auth.signInWithPassword({ email, password: pw });
  if (error && pw !== pw.trim()) ({ error } = await sb.auth.signInWithPassword({ email, password: pw.trim() }));
  if (error) {
    const creds = /invalid login credentials/i.test(error.message) || error.code === 'invalid_credentials';
    $('#lerr').textContent = creds ? 'Wrong username or password.' : `Sign-in problem: ${error.message}`;
    if (creds) { $('#p').value = ''; $('#p').focus(); }
    return;
  }
  boot();
});
$('#p').addEventListener('keydown', e => { if (e.key === 'Enter') $('#bLogin').click(); });   // no return value, so Backspace and other keys are never blocked
$('#bOut').onclick = async () => { await signOutLogged(); hist.length = 0; show('vLogin'); };
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return show('vLogin');
  const { data: p, error: pe } = await sb.from('profiles').select('role').eq('id', session.user.id).single();
  if (pe) { await sb.auth.signOut(); show('vLogin'); return $('#lerr').textContent = 'Database error: ' + pe.message; }
  if (!p || p.role !== 'admin') { await sb.auth.signOut(); show('vLogin'); return $('#lerr').textContent = 'This account is not a teacher/admin account.'; }
  show('vApp'); go(tab); startPresence();
}
$$('#tabs button').forEach(b => b.onclick = () => go(b.dataset.t));
const hist = [];                                  // tabs visited, for the back arrow and the phone's Back button
function go(t, pop) {
  tab = t; $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  if (!pop && hist[hist.length - 1] !== t) { hist.push(t); history[hist.length === 1 ? 'replaceState' : 'pushState']({ t }, '', '#' + t); }
  $('#bBack').classList.toggle('hide', hist.length < 2);
  ({ bank, upload, exams, students, results, materials, activity, messages, backup })[t]();
}
$('#bBack').onclick = () => history.back();
window.addEventListener('popstate', () => {
  if ($('#vApp').classList.contains('hide')) return;
  $$('.modal').forEach(m => m.remove());
  if (hist.length > 1) { hist.pop(); go(hist[hist.length - 1], true); }
});

// ================= QUESTION BANK =================
async function bank() {
  $('#main').innerHTML = `<div class="card"><div class="row">
    <div><label>Class</label><select id="fc"><option value="">All</option>${opts(CLASSES)}</select></div>
    <div><label>Subject</label><input id="fs" placeholder="e.g. Mathematics"></div>
    <div><label>Topic</label><input id="ft"></div>
    <div><label>Difficulty</label><select id="fd"><option value="">All</option><option>Easy</option><option>Medium</option><option>Hard</option></select></div></div>
    <div class="row" style="margin-top:10px"><button id="bFind">Search</button><button class="gold" id="bAdd">+ Add question</button></div></div><div id="chips" style="margin:8px 0"></div><div id="list"></div>`;
  $('#bFind').onclick = loadBank; $('#bAdd').onclick = () => qForm();
  Promise.all(CLASSES.map(c => sb.from('questions').select('id', { count: 'exact', head: true }).eq('class_level', c))).then(rs => {
    $('#chips').innerHTML = '<span class="mute">Show only: </span>' + ['', ...CLASSES].map((c, i) => `<button class="alt sm" data-ch="${c}" style="margin:2px">${c || 'All'}${i ? ' (' + (rs[i - 1].count ?? 0) + ')' : ''}</button>`).join('');
    $$('[data-ch]').forEach(b => b.onclick = () => { $('#fc').value = b.dataset.ch; loadBank(); });
  });
  loadBank();
}
async function loadBank() {
  let q = sb.from('questions').select('*').order('created_at', { ascending: false }).limit(300);
  if ($('#fc').value) q = q.eq('class_level', $('#fc').value);
  if ($('#fs').value.trim()) q = q.ilike('subject', '%' + $('#fs').value.trim() + '%');
  if ($('#ft').value.trim()) q = q.ilike('topic', '%' + $('#ft').value.trim() + '%');
  if ($('#fd').value) q = q.eq('difficulty', $('#fd').value);
  const { data, error } = await q; if (error) return toast(friendly(error.message), true);
  $('#list').innerHTML = `<p class="mute">${data.length} question(s)${data.length === 300 ? ' (showing first 300 — narrow the filters)' : ''}</p>` +
    (data.map(x => `<div class="card"><span class="badge">${esc(x.class_level)}</span> <span class="badge">${esc(x.subject)}</span> <span class="badge">${esc(x.topic || 'No topic')}</span> <span class="badge gold">${esc(x.difficulty)}</span>
    <div class="qtext" style="font-size:1.05rem">${fmt(x.question)}</div>${x.image_url ? `<img class="qimg" style="max-height:120px" src="${esc(x.image_url)}" alt="">` : ''}
    <p class="mute">A. ${fmt(x.opt_a)} · B. ${fmt(x.opt_b)}${x.opt_c ? ' · C. ' + fmt(x.opt_c) : ''}${x.opt_d ? ' · D. ' + fmt(x.opt_d) : ''}<br><b>Answer: ${x.correct}</b> · ${x.marks} mark(s)</p>
    <button class="alt sm" data-e="${x.id}">Edit</button> <button class="alt sm" data-d="${x.id}">Delete</button></div>`).join('') || '<div class="card">No questions yet. Add one or use the Upload tab.</div>');
  $$('[data-e]').forEach(b => b.onclick = () => qForm(data.find(x => x.id === b.dataset.e)));
  $$('[data-d]').forEach(b => b.onclick = async () => { if (!confirm('Delete this question?')) return; const { error } = await sb.from('questions').delete().eq('id', b.dataset.d); error ? toast(friendly(error.message), true) : (toast('Deleted'), loadBank()); });
}
function modal(html) { const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = '<div>' + html + '</div>'; let down = null; m.onpointerdown = e => { down = e.target; }; m.onclick = e => { if (e.target === m && down === m) m.remove(); }; document.body.append(m); return m; }
function qForm(x = {}) {
  const m = modal(`<h2>${x.id ? 'Edit' : 'Add'} question</h2>
  <div class="row"><div><label>Class</label><select id="qc">${opts(CLASSES, x.class_level)}</select></div><div><label>Subject</label><input id="qs" value="${esc(x.subject)}"></div></div>
  <label>Topic</label><input id="qt" value="${esc(x.topic)}">
  <label>Question <span class="mute">(use x^2, H_2O, [3/4] for notation)</span></label><textarea id="qq" rows="3">${esc(x.question)}</textarea>
  ${['a', 'b', 'c', 'd'].map(k => `<label>Option ${k.toUpperCase()}</label><input id="o${k}" value="${esc(x['opt_' + k])}">`).join('')}
  <div class="row"><div><label>Correct answer</label><select id="qa">${opts(['A', 'B', 'C', 'D'], x.correct)}</select></div><div><label>Marks</label><input id="qm" type="number" step="0.5" value="${x.marks ?? 1}"></div>
  <div><label>Difficulty</label><select id="qd">${opts(['Easy', 'Medium', 'Hard'], x.difficulty || 'Medium')}</select></div></div>
  <label>Explanation (shown in review)</label><textarea id="qe" rows="2">${esc(x.explanation)}</textarea>
  <label>Image (diagram or chart)</label><input id="qi" type="file" accept="image/*"><p class="mute" id="qin">${x.image_url ? 'Current image kept unless you choose a new one.' : ''}</p>
  <div class="row"><button id="qsave">Save question</button><button class="alt" id="qx">Cancel</button></div>`);
  $('#qx', m).onclick = () => m.remove();
  $('#qsave', m).onclick = e => run(e.target, async () => {
    const r = { class_level: $('#qc', m).value, subject: $('#qs', m).value.trim(), topic: $('#qt', m).value.trim(), question: $('#qq', m).value.trim(),
      opt_a: $('#oa', m).value.trim(), opt_b: $('#ob', m).value.trim(), opt_c: $('#oc', m).value.trim() || null, opt_d: $('#od', m).value.trim() || null,
      correct: $('#qa', m).value, marks: +$('#qm', m).value || 1, difficulty: $('#qd', m).value, explanation: $('#qe', m).value.trim() || null, image_url: x.image_url || null };
    if (!r.subject || !r.question || !r.opt_a || !r.opt_b) return toast('Subject, question and options A and B are required.', true);
    if (!r['opt_' + r.correct.toLowerCase()]) return toast('The correct answer points to an empty option.', true);
    const f = $('#qi', m).files[0];
    if (f) { const path = `${Date.now()}-${f.name.replace(/[^\w.]/g, '_')}`; const { error } = await sb.storage.from('question-images').upload(path, f); if (error) return toast('Image upload failed: ' + error.message, true); r.image_url = sb.storage.from('question-images').getPublicUrl(path).data.publicUrl; }
    const { error } = x.id ? await sb.from('questions').update(r).eq('id', x.id) : await sb.from('questions').insert(r);
    if (error) return toast(friendly(error.message), true); m.remove(); toast('Saved'); loadBank();
  });
}

// ================= BULK UPLOAD (paste or file) =================
const store = k => localStorage.getItem('cbt-' + k) || '';
let parsed = [];
function upload() {
  $('#main').innerHTML = `<div class="card"><h2>Add questions</h2>
  <div class="row"><div><label>Class (choose it every time)</label><select id="uc"><option value="">Choose the class…</option>${opts(CLASSES)}</select></div>
  <div><label>Subject</label><input id="us" value="${esc(store('us'))}" placeholder="e.g. Mathematics"></div>
  <div><label>Topic (optional)</label><input id="ut"></div></div>
  <label>Paste your questions here (from Word, PDF or WhatsApp)</label>
  <textarea id="ptxt" rows="9" placeholder="1. What is 2 + 3?&#10;A. 4&#10;B. 5&#10;C. 6&#10;D. 7&#10;Answer: B&#10;&#10;2. Water boils at what temperature?&#10;A. 50&#10;B. 100*&#10;C. 0&#10;D. 10"></textarea>
  <button id="bRead" style="width:100%;margin-top:10px">Check questions</button>
  <p class="mute" style="text-align:center">or choose a Word, Excel or CSV file</p>
  <input type="file" id="file" accept=".csv,.xlsx,.xls,.docx">
  <details style="margin-top:12px"><summary>Tips and templates</summary>
  <p class="mute">Show the right answer with a line "Answer: B" under the question, or put * after the correct option. For powers, subscripts and fractions write x^2, H_2O and [3/4].<br>Excel/CSV columns: Question, A, B, C, D, Answer. Optional extra columns: Class, Subject, Topic, Marks, Difficulty, Explanation.</p>
  <button class="alt sm" id="tCsv">CSV template</button> <button class="alt sm" id="tXlsx">Excel template</button></details></div><div id="prev"></div>`;
  const H = ['Question', 'A', 'B', 'C', 'D', 'Answer'], ex = [['What is [1/2] + [1/4]?', '[3/4]', '[2/6]', '[1/8]', '1', 'A']];
  $('#tCsv').onclick = () => dl('questions-template.csv', [H, ...ex].map(r => r.map(csvCell).join(',')).join('\n'));
  $('#tXlsx').onclick = () => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([H, ...ex]), 'Questions'); XLSX.writeFile(wb, 'questions-template.xlsx'); };
  $('#bRead').onclick = e => run(e.target, async () => {
    const t = $('#ptxt').value.trim(); if (!t) return toast('Paste your questions first, or choose a file.', true);
    await finish(parseText(t));
  });
  $('#file').onchange = async e => { try { if (e.target.files[0]) await readFile(e.target.files[0]); } catch (er) { toast('Could not read the file: ' + er.message, true); } };
}
const norm = s => String(s).toLowerCase().replace(/[^a-z]/g, '');
async function readFile(f) {
  const ext = f.name.split('.').pop().toLowerCase(); let objs = [];
  if (ext === 'csv') { const rows = parseCSV(await f.text()); const h = rows.shift().map(norm); objs = rows.map(r => Object.fromEntries(h.map((k, i) => [k, r[i] ?? '']))); }
  else if (ext === 'xlsx' || ext === 'xls') { const wb = XLSX.read(await f.arrayBuffer()); objs = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }).map(o => Object.fromEntries(Object.entries(o).map(([k, v]) => [norm(k), v]))); }
  else if (ext === 'docx') objs = parseText((await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })).value);
  else return toast('Use a Word (.docx), Excel (.xlsx) or CSV file.', true);
  await finish(objs);
}
async function finish(objs) {
  if (!objs.length) return toast('No questions found. Each question needs its options (A, B, C, D) and an answer.', true);
  localStorage.setItem('cbt-us', $('#us').value.trim());   // the class is never remembered, so one class can't be saved into another by mistake
  const { data: old } = await sb.from('questions').select('class_level,subject,question').limit(5000);
  const seen = new Set((old || []).map(o => key(o.class_level, o.subject, o.question)));
  parsed = objs.map(o => check(o, seen)); preview();
  $('#prev').scrollIntoView({ behavior: 'smooth' });
}
const key = (c, s, q) => [c, s, q].map(v => String(v).toLowerCase().replace(/\s+/g, ' ').trim()).join('|');

// Reads plain text: numbered or unnumbered questions, options A-D (A. / A) / (A)),
// answer from "Answer: B" or a * / ✓ after the right option.
function parseText(text) {
  const out = []; let cur = null, def = {};
  const OPT = /^\(?([A-Da-d])\s*[.):]\s*(.*)$/, ANS = /^(?:answer|ans|correct(?:\s*answer)?)\s*[:\-=.]?\s*\(?([A-Da-d])\b/i,
    QST = /^(?:q(?:uestion)?\s*)?\d+\s*[.):]\s+(.+)$/i, QLB = /^q(?:uestion)?\s*[:.]\s*(.+)$/i,
    META = /^(class|subject|topic|explanation|marks|difficulty)\s*:\s*(.*)$/i, MARK = /\s*(\*|✓|✔|\(correct\))\s*$/i;
  const flush = () => { if (cur && cur.question) { delete cur._last; out.push(cur); } cur = null; };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue; let m;
    if ((m = line.match(META))) { const k = m[1].toLowerCase(); if (['class', 'subject', 'topic'].includes(k)) def[k] = m[2].trim(); else if (cur) cur[k] = m[2].trim(); continue; }
    if (cur && (m = line.match(ANS))) { cur.correctanswer = m[1].toUpperCase(); continue; }
    if (cur && (m = line.match(OPT))) { let t = m[2].trim(); const k = m[1].toLowerCase(); if (MARK.test(t)) { cur.correctanswer = k.toUpperCase(); t = t.replace(MARK, ''); } cur['option' + k] = t; cur._last = 'option' + k; continue; }
    if ((m = line.match(QLB) || line.match(QST))) { flush(); cur = { ...def, question: m[1].trim() }; continue; }
    if (cur && (cur.optiond !== undefined || cur.correctanswer)) { flush(); cur = { ...def, question: line }; }
    else if (cur && cur._last) cur[cur._last] += ' ' + line;
    else if (cur) cur.question += '\n' + line;
    else cur = { ...def, question: line };
  }
  flush(); return out;
}
function check(o, seen) {
  const e = [], L = ['a', 'b', 'c', 'd'];
  const chosen = $('#uc').value, fcls = String(o.class || '').toUpperCase().replace(/\s+/g, ''), cls = chosen || fcls;
  if (!cls) e.push('Choose the class above (or add a Class column to the file)');
  else if (!CLASSES.includes(cls)) e.push('Class must be one of ' + CLASSES.join(', '));
  else if (chosen && fcls && fcls !== chosen) e.push(`The file says ${fcls} but you chose ${chosen}`);
  const r = { class_level: cls, subject: String(o.subject || $('#us').value || '').trim(), topic: String(o.topic ?? $('#ut').value ?? '').trim(), question: String(o.question || '').trim(),
    explanation: String(o.explanation || '').trim() || null, difficulty: ['Easy', 'Medium', 'Hard'].find(d => d.toLowerCase() === String(o.difficulty || 'Medium').trim().toLowerCase()) || 'Medium', marks: parseFloat(o.marks) || 1 };
  L.forEach(k => r['opt_' + k] = String(o['option' + k] ?? o[k] ?? '').trim() || null);
  if (!r.subject) e.push('Missing subject'); if (!r.question) e.push('Missing question'); if (!r.opt_a || !r.opt_b) e.push('Need at least options A and B');
  const a = String(o.correctanswer ?? o.answer ?? '').trim(); let c = /^\(?[A-Da-d]\)?[.)]?$/.test(a) ? a.replace(/[^A-Da-d]/g, '').toUpperCase() : '';
  if (!c && a) { const i = L.findIndex(k => r['opt_' + k] && r['opt_' + k].toLowerCase() === a.toLowerCase()); c = i >= 0 ? 'ABCD'[i] : ''; }
  r.correct = c; if (!c) e.push('Missing or invalid correct answer'); else if (!r['opt_' + c.toLowerCase()]) e.push('Correct answer points to an empty option');
  const k = key(r.class_level, r.subject, r.question); if (r.question && seen.has(k)) e.push('Duplicate question'); else seen.add(k);
  return { r, e };
}
function preview() {
  const ok = parsed.filter(p => !p.e.length), bad = parsed.length - ok.length;
  $('#prev').innerHTML = `<div class="card"><h3>${parsed.length} question(s) found · ${ok.length} ready${bad ? ` · <span class="err">${bad} need attention</span>` : ''}</h3>
  <p class="mute">${bad ? 'Where the answer is missing, choose it in the Answer box. Red rows are skipped when you save.' : 'Everything looks good.'}</p>
  <p style="margin:6px 0"><b>Will be saved to:</b> ${Object.entries(ok.reduce((d, p) => { const k = p.r.class_level + ' · ' + p.r.subject; d[k] = (d[k] || 0) + 1; return d; }, {})).map(([k, n]) => `<span class="badge gold">${esc(k)}: ${n}</span>`).join(' ') || 'nothing yet'}</p>
  <button id="bSave" ${ok.length ? '' : 'disabled'} style="width:100%">Save ${ok.length} question(s)</button>
  <div class="scroll"><table><tr><th>#</th><th>Question and options</th><th>Answer</th></tr>
  ${parsed.map((p, i) => `<tr class="${p.e.length ? 'errrow' : ''}"><td>${i + 1}</td><td><span class="badge">${esc(p.r.class_level || '?')}</span> ${fmt(p.r.question).slice(0, 160)}<br><span class="mute">${['a', 'b', 'c', 'd'].filter(k => p.r['opt_' + k]).map(k => k.toUpperCase() + '. ' + fmt(p.r['opt_' + k])).join(' · ')}</span>${p.e.length ? '<br><span class="err">' + esc(p.e.join('; ')) + '</span>' : ''}</td>
  <td><select data-i="${i}" style="width:72px"><option value="">?</option>${[...'ABCD'].map(c => `<option ${p.r.correct === c ? 'selected' : ''}>${c}</option>`).join('')}</select></td></tr>`).join('')}</table></div></div>`;
  $$('#prev select').forEach(s => s.onchange = () => {
    const p = parsed[+s.dataset.i]; p.r.correct = s.value; p.e = p.e.filter(x => !/correct answer/i.test(x));
    if (!s.value) p.e.push('Missing or invalid correct answer'); else if (!p.r['opt_' + s.value.toLowerCase()]) p.e.push('Correct answer points to an empty option');
    preview();
  });
  $('#bSave').onclick = e => run(e.target, async () => {
    for (let i = 0; i < ok.length; i += 200) { const { error } = await sb.from('questions').insert(ok.slice(i, i + 200).map(p => p.r)); if (error) return toast(friendly(error.message), true); }
    toast(`${ok.length} questions saved`); parsed = []; $('#prev').innerHTML = ''; $('#ptxt').value = ''; $('#file').value = '';
  });
}

// ================= EXAMS =================
async function exams() {
  const { data, error } = await sb.from('exams').select('*').order('created_at', { ascending: false });
  if (error) return toast(friendly(error.message), true);
  $('#main').innerHTML = `<button class="gold" id="bNew">+ Create exam</button><div style="margin-top:12px">` + (data.map(x => `<div class="card"><h3>${esc(x.title)} <span class="badge ${x.published ? 'ok' : ''}">${x.published ? 'Published' : 'Draft'}</span>${x.passage_path ? ' <span class="badge gold">📖 Passage</span>' : ''}</h3>
   <p class="mute">${esc(x.class_level)} · ${esc(x.subject)}${x.term ? ' · ' + esc(x.term) : ''} · ${x.duration_min} min · ${x.question_ids ? x.question_ids.length + ' chosen' : x.num_questions + ' random'} questions · pass ${x.pass_mark}%${x.access_code ? ' · code ' + esc(x.access_code) : ''}<br>${x.start_at ? new Date(x.start_at).toLocaleString() : 'Open now'} → ${x.end_at ? new Date(x.end_at).toLocaleString() : 'no end'} · Review: ${x.show_review ? 'on' : 'off'}</p>
   <button class="sm" data-p="${x.id}">${x.published ? 'Unpublish' : 'Publish'}</button> <button class="alt sm" data-r="${x.id}">${x.show_review ? 'Hide' : 'Allow'} review</button> ${x.passage_path ? `<button class="alt sm" data-pv="${x.id}">📖 Preview passage</button> ` : ''}<button class="alt sm" data-e="${x.id}">Edit</button> <button class="alt sm" data-d="${x.id}">Delete</button></div>`).join('') || '<div class="card">No exams yet.</div>') + '</div>';
  $('#bNew').onclick = () => eForm();
  const upd = (id, v) => sb.from('exams').update(v).eq('id', id).then(({ error }) => error ? toast(friendly(error.message), true) : exams());
  $$('[data-p]').forEach(b => b.onclick = () => upd(b.dataset.p, { published: !data.find(x => x.id === b.dataset.p).published }));
  $$('[data-r]').forEach(b => b.onclick = () => upd(b.dataset.r, { show_review: !data.find(x => x.id === b.dataset.r).show_review }));
  $$('[data-e]').forEach(b => b.onclick = () => eForm(data.find(x => x.id === b.dataset.e)));
  $$('[data-pv]').forEach(b => b.onclick = () => { const x = data.find(v => v.id === b.dataset.pv); openPassage({ path: x.passage_path, title: x.passage_title || x.title }); });
  $$('[data-d]').forEach(b => b.onclick = async () => {
    const x = data.find(v => v.id === b.dataset.d);
    if (!(await askYes('Delete this exam?', `“${x.title}”\n\nAll student results for this exam are deleted too. This cannot be undone.`, 'Yes, delete', 'Keep it'))) return;
    const { data: gone, error } = await sb.from('exams').delete().eq('id', x.id).select('id');
    if (error) return toast(friendly(error.message), true);
    if (!gone || !gone.length) return toast('Could not delete it. Refresh and try again.', true);
    if (x.passage_path) await sb.storage.from('exam-passages').remove([x.passage_path]);
    toast('Deleted'); exams();
  });
}

// ---- Date and time pickers made of simple drop-down lists (they work on every phone) ----
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PH = { d: 'Day', m: 'Month', y: 'Year', h: 'Hour', n: 'Min', a: 'AM/PM' };
const rng = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
function dtField(id, label, iso) {
  const d = iso ? new Date(iso) : null, y0 = new Date().getFullYear(), pad = n => String(n).padStart(2, '0');
  const sel = (s, list, cur) => `<select id="${id}${s}" style="min-width:0"><option value="">${PH[s]}</option>${list.map(([v, t]) => `<option value="${v}" ${cur !== '' && String(cur) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  return `<label>${label}</label><div class="row" style="gap:6px">${sel('d', rng(1, 31).map(v => [v, v]), d ? d.getDate() : '')}${sel('m', MONTHS.map((t, i) => [i + 1, t]), d ? d.getMonth() + 1 : '')}${sel('y', [y0, y0 + 1].map(v => [v, v]), d ? d.getFullYear() : '')}</div>
  <div class="row" style="gap:6px;margin-top:6px">${sel('h', rng(1, 12).map(v => [v, v]), d ? d.getHours() % 12 || 12 : '')}${sel('n', rng(0, 59).map(v => [v, pad(v)]), d ? d.getMinutes() : '')}${sel('a', [['AM', 'AM'], ['PM', 'PM']], d ? (d.getHours() >= 12 ? 'PM' : 'AM') : '')}</div>`;
}
function readDt(id, m, name) {
  const g = s => $('#' + id + s, m).value;
  if (!['d', 'm', 'y', 'h', 'n', 'a'].some(s => g(s))) return { iso: null };
  if (!g('d') || !g('m') || !g('y') || !g('h') || g('n') === '' || !g('a')) return { err: `${name}: choose the day, month, year, hour, minute and AM/PM, or tap Clear.` };
  const dt = new Date(+g('y'), +g('m') - 1, +g('d'), (+g('h') % 12) + (g('a') === 'PM' ? 12 : 0), +g('n'));
  if (dt.getMonth() !== +g('m') - 1) return { err: `${name}: that date does not exist. Check the day and month.` };
  return { iso: dt.toISOString(), dt };
}
function setDt(id, m, d) {
  const set = (s, v) => { $('#' + id + s, m).value = v; };
  if (!d) return ['d', 'm', 'y', 'h', 'n', 'a'].forEach(s => set(s, ''));
  set('d', d.getDate()); set('m', d.getMonth() + 1); set('y', d.getFullYear()); set('h', d.getHours() % 12 || 12); set('n', d.getMinutes()); set('a', d.getHours() >= 12 ? 'PM' : 'AM');
}
const dtBtns = (id, extra) => `<div class="row" style="gap:6px;margin-top:6px">${extra}<button type="button" class="alt sm" id="${id}Clr">Clear</button></div>`;
function eForm(x = {}) {
  const m = modal(`<h2>${x.id ? 'Edit' : 'Create'} exam</h2>
  <label>Title</label><input id="et" value="${esc(x.title)}">
  <div class="row"><div><label>Class</label><select id="ec">${opts(CLASSES, x.class_level)}</select></div><div><label>Subject (same spelling as the bank)</label><input id="es" value="${esc(x.subject)}"></div></div>
  <div class="row"><div><label>Term</label><select id="etm">${opts(['First Term', 'Second Term', 'Third Term'], x.term)}</select></div><div><label>Duration (minutes)</label><input id="ed" type="number" value="${x.duration_min || 30}"></div>
  <div><label>Pass mark (%)</label><input id="ep" type="number" value="${x.pass_mark ?? 50}"></div></div>
  <div style="margin-top:6px">${dtField('ds', 'Starts (optional)', x.start_at)}${dtBtns('ds', '<button type="button" class="alt sm" id="dsNow">Set to now</button>')}</div>
  <div style="margin-top:8px">${dtField('de', 'Ends (optional)', x.end_at)}${dtBtns('de', '<button type="button" class="alt sm" id="dePlus">Start + 2 hours</button>')}</div>
  <p class="mute" style="margin:6px 0 0">Times use this phone's clock. Leave both empty for no limit.</p>
  <div class="row"><div><label>Access code (optional)</label><input id="eac" value="${esc(x.access_code)}"></div><div><label>Question source</label><select id="emode"><option value="r">Random from bank</option><option value="m" ${x.question_ids ? 'selected' : ''}>Pick manually</option></select></div></div>
  <div id="rnd" class="row"><div><label>Number of questions</label><input id="en" type="number" value="${x.num_questions || 20}"></div><div><label>Only this topic (optional)</label><input id="etp" value="${esc(x.topic_filter)}"></div></div>
  <div id="man" class="hide"><p id="mc" class="mute"></p><div id="mlist" class="scroll" style="max-height:240px"></div></div>
  <div class="card" style="margin:10px 0"><b>📖 Reading passage (optional)</b>
    <p class="mute">Upload a PDF that students read on screen while they answer the questions. They can open it only during the exam.</p>
    <input id="epf" type="file" accept=".pdf,application/pdf">
    <label>Passage title (optional)</label><input id="ept" value="${esc(x.passage_title)}" placeholder="e.g. The Lost Boy">
    ${x.passage_path ? `<p class="mute">Current file: ${esc(x.passage_name || 'passage.pdf')}. Choosing a new file replaces it.</p><label><input type="checkbox" id="epr" style="width:auto;min-height:0"> Remove the current passage</label>` : ''}
    <label><input type="checkbox" id="ekeep" style="width:auto;min-height:0" ${x.keep_order ? 'checked' : ''}> Keep the questions in the order they were uploaded (do not shuffle)</label>
    <p class="mute">For a 50-question passage exam: upload your 50 questions in order with the Topic set to the passage name. Then set "Question source" to Random from bank, "Only this topic" to that name, and "Number of questions" to 50.</p></div>
  <label>Instructions</label><textarea id="ei" rows="3">${esc(x.instructions)}</textarea>
  <label><input type="checkbox" id="erv" style="width:auto;min-height:0" ${x.show_review ? 'checked' : ''}> Let students review answers after submitting</label>
  <label><input type="checkbox" id="epb" style="width:auto;min-height:0" ${x.published ? 'checked' : ''}> Publish now</label>
  <div class="row"><button id="esave">Save exam</button><button class="alt" id="ex">Cancel</button></div>`);
  let chosen = new Set(x.question_ids || []);
  const mode = () => { const man = $('#emode', m).value === 'm'; $('#rnd', m).classList.toggle('hide', man); $('#man', m).classList.toggle('hide', !man); if (man) loadPick(); };
  async function loadPick() {
    const { data } = await sb.from('questions').select('id,question,topic,difficulty').eq('class_level', $('#ec', m).value).ilike('subject', $('#es', m).value.trim() || '%').limit(400);
    $('#mlist', m).innerHTML = (data || []).map(q => `<label style="display:flex;gap:8px;color:var(--ink)"><input type="checkbox" style="width:auto;min-height:0" value="${q.id}" ${chosen.has(q.id) ? 'checked' : ''}><span>${fmt(q.question).slice(0, 110)} <span class="mute">(${esc(q.topic || '-')}, ${esc(q.difficulty)})</span></span></label>`).join('') || '<p class="mute">No questions for this class and subject.</p>';
    $$('#mlist input', m).forEach(c => c.onchange = () => { c.checked ? chosen.add(c.value) : chosen.delete(c.value); $('#mc', m).textContent = chosen.size + ' selected'; });
    $('#mc', m).textContent = chosen.size + ' selected';
  }
  $('#emode', m).onchange = mode; $('#ec', m).onchange = $('#es', m).onchange = () => $('#emode', m).value === 'm' && loadPick(); mode();
  $('#ex', m).onclick = () => m.remove();
  const roundUp = () => { const t = new Date(); t.setSeconds(0, 0); t.setMinutes(Math.ceil((t.getMinutes() + 1) / 5) * 5); return t; };
  $('#dsNow', m).onclick = () => setDt('ds', m, roundUp());
  $('#dsClr', m).onclick = () => setDt('ds', m, null);
  $('#deClr', m).onclick = () => setDt('de', m, null);
  $('#dePlus', m).onclick = () => { const s = readDt('ds', m, 'Starts'); if (s.err || !s.dt) return toast(s.err || 'Set the start time first.', true); setDt('de', m, new Date(s.dt.getTime() + 2 * 3600 * 1000)); };
  $('#esave', m).onclick = e => run(e.target, async () => {
    const man = $('#emode', m).value === 'm';
    const S = readDt('ds', m, 'Starts'), E = readDt('de', m, 'Ends');
    if (S.err || E.err) return toast(S.err || E.err, true);
    if (S.dt && E.dt && E.dt <= S.dt) return toast('The end time must be after the start time.', true);
    if (E.dt && E.dt <= new Date() && !confirm('The end time has already passed, so students cannot start this exam. Save anyway?')) return;
    const r = { title: $('#et', m).value.trim(), class_level: $('#ec', m).value, subject: $('#es', m).value.trim(), term: $('#etm', m).value, duration_min: +$('#ed', m).value || 30, pass_mark: +$('#ep', m).value || 50,
      start_at: S.iso, end_at: E.iso,
      access_code: $('#eac', m).value.trim() || null, instructions: $('#ei', m).value.trim() || null, show_review: $('#erv', m).checked, published: $('#epb', m).checked,
      question_ids: man ? [...chosen] : null, num_questions: man ? chosen.size : (+$('#en', m).value || 20), topic_filter: man ? null : ($('#etp', m).value.trim() || null) };
    if (!r.title || !r.subject) return toast('Title and subject are required.', true);
    if (S.dt && E.dt && E.dt - S.dt < r.duration_min * 60000 && !confirm(`The window between start and end is shorter than the ${r.duration_min}-minute duration. Save anyway?`)) return;
    if (man && !chosen.size) return toast('Pick at least one question.', true);
    if (!man) {
      let q = sb.from('questions').select('id', { count: 'exact', head: true }).eq('class_level', r.class_level).eq('subject', r.subject);
      if (r.topic_filter) q = q.eq('topic', r.topic_filter);
      const { count } = await q;
      if (count !== null && count < r.num_questions * 1.3 && !confirm(`Only ${count} question(s) in the bank for ${r.class_level} ${r.subject}. Students will see almost the same questions, so answers can be shared. Save anyway?`)) return;
    }
    const pf = $('#epf', m).files[0], rmP = $('#epr', m) && $('#epr', m).checked; let up = null;
    if (pf) {
      if (!/\.pdf$/i.test(pf.name)) return toast('The passage must be a PDF file.', true);
      if (pf.size > 20 * 1048576) return toast(`That PDF is ${fsize(pf.size)}. The limit is 20 MB. Compress it or remove large pictures.`, true);
      if ((await pf.slice(0, 5).text()) !== '%PDF-') return toast('That file is not a real PDF.', true);
      const path = crypto.randomUUID() + '.pdf', { error: ue } = await sb.storage.from('exam-passages').upload(path, pf, { contentType: 'application/pdf' });
      if (ue) return toast('Upload failed: ' + ue.message, true);
      up = path; Object.assign(r, { passage_path: path, passage_name: pf.name });
    } else if (rmP) Object.assign(r, { passage_path: null, passage_name: null });
    r.passage_title = $('#ept', m).value.trim() || null; r.keep_order = $('#ekeep', m).checked;
    const { error } = x.id ? await sb.from('exams').update(r).eq('id', x.id) : await sb.from('exams').insert(r);
    if (error) { if (up) await sb.storage.from('exam-passages').remove([up]); return toast(friendly(error.message), true); }
    if (x.passage_path && (up || rmP) && x.passage_path !== up) await sb.storage.from('exam-passages').remove([x.passage_path]);
    m.remove(); toast('Exam saved'); exams();
  });
}

// ================= STUDENTS =================
async function students() {
  $('#main').innerHTML = `<div id="rq"></div><div class="card"><h3>Login sheet</h3><p class="mute">Gives every student in the chosen class a NEW random password, then lets you download or print all the logins. Old passwords stop working.</p>
  <div class="row"><select id="bc"><option value="">All classes</option>${opts(CLASSES)}</select><select id="bs"><option value="">All sections</option></select><button class="gold" id="bBulk">Generate logins</button></div><div id="bulkOut"></div></div><div class="card"><h2>Register students in bulk</h2><p>CSV columns: <b>Username, Full Name, Password, Class</b>, and optional <b>Section</b> (like 1A Diamond). Leave Password empty to auto-generate a safe one (or use 8+ characters).</p>
  <label>Class for this file (recommended: one class per file)</label><select id="sUpC"><option value="">Choose class, or use the Class column</option>${opts(CLASSES)}</select>
  <p class="mute">If you choose a class, every row goes into it, and any row whose Class column says something different is rejected, so classes cannot get mixed. Usernames are shared by the whole school: two students cannot both be ade001, so add the class, like jss2.ade001.</p>
  <div class="row"><button class="alt" id="sTpl">Download CSV template</button></div><label>Upload CSV</label><input type="file" id="sFile" accept=".csv"><div id="sOut"></div></div>
  <div class="card"><div class="row"><select id="sc"><option value="">All classes</option>${opts(CLASSES)}</select><select id="ss"><option value="">All sections</option></select></div><div class="scroll" id="sList"></div></div>`;
  $('#sTpl').onclick = () => dl('students-template.csv', 'Username,Full Name,Password,Class,Section\nade001,Ade Bello,,JSS1,1A Diamond\nchi002,Chioma Okoro,,SS2,2B');
  $('#sFile').onchange = e => regStudents(e.target.files[0]);
  $('#sc').onchange = listStudents; $('#ss').onchange = listStudents; listStudents(); loadReq(); loadSections();
  $('#bBulk').onclick = e => run(e.target, bulkReset);
}
async function loadSections() {
  const { data } = await sb.from('profiles').select('section').eq('role', 'student').not('section', 'is', null).limit(2000);
  const secs = [...new Set((data || []).map(x => x.section))].sort();
  $$('#bs, #ss').forEach(s => s.innerHTML = '<option value="">All sections</option>' + secs.map(x => `<option>${esc(x)}</option>`).join(''));
}
async function listStudents() {
  let q = sb.from('profiles').select('username,full_name,class_level,section').eq('role', 'student').order('class_level').order('section').order('full_name').limit(1000); if ($('#sc').value) q = q.eq('class_level', $('#sc').value); if ($('#ss').value) q = q.eq('section', $('#ss').value);
  const { data } = await q; $('#sList').innerHTML = `<p class="mute">${(data || []).length} student(s)</p><table><tr><th>Username</th><th>Name</th><th>Class</th><th></th></tr>${(() => { let last = null; const n = {}; (data || []).forEach(s => n[s.class_level] = (n[s.class_level] || 0) + 1); return (data || []).map(s => { const h = s.class_level !== last ? (last = s.class_level, `<tr><td colspan="4" style="background:var(--line)"><b>${esc(s.class_level || 'No class')}</b> · ${n[s.class_level]} student(s)</td></tr>`) : ''; return h + `<tr><td>${esc(s.username)}</td><td>${esc(s.full_name)}</td><td>${esc(classLabel(s))}</td><td><button class="alt sm" data-ed="${esc(s.username)}">Edit</button> <button class="alt sm" data-rs="${esc(s.username)}">Reset password</button> <button class="bad sm" data-del="${esc(s.username)}">Delete</button></td></tr>`; }).join(''); })()}</table>`;
  $$('[data-ed]').forEach(b => b.onclick = () => editStudent(data.find(x => x.username === b.dataset.ed)));
  $$('[data-rs]').forEach(b => b.onclick = () => resetPw(b.dataset.rs));
  $$('[data-del]').forEach(b => b.onclick = () => delStudent(b.dataset.del));
}
async function bulkReset() {
  const cls = $('#bc').value;
  let q = sb.from('profiles').select('username,full_name,class_level,section').eq('role', 'student').order('section').order('full_name').limit(1000);
  const secSel = $('#bs').value; if (cls) q = q.eq('class_level', cls); if (secSel) q = q.eq('section', secSel);
  const { data, error } = await q; if (error) return toast(friendly(error.message), true);
  if (!data.length) return toast('No students found.', true);
  if (!confirm(`This gives ${data.length} student(s)${cls ? ' in ' + cls : ''}${secSel ? ' (' + secSel + ')' : ''} NEW passwords. Their old passwords stop working. Continue?`)) return;
  const out = [], bad = [];
  for (const [i, s] of data.entries()) {
    const pw = genPw(), { error: e } = await sb.rpc('admin_reset_password', { uname: s.username, newpass: pw });
    if (e) bad.push(`${s.username}: ${e.message}`); else out.push([s.username, s.full_name, pw, s.class_level || '', s.section || '']);
    $('#bulkOut').innerHTML = `<p class="mute">Working… ${i + 1} of ${data.length}</p>`;
  }
  $('#bulkOut').innerHTML = `<p><b>${out.length}</b> new login(s) ready.</p>${out.length ? '<div class="row"><button class="gold" id="bDl">Download login sheet (CSV)</button><button class="alt" id="bPr">Print login slips</button></div><p class="mute">Passwords are shown only now. Give each student only their own details, then delete the file or slips.</p>' : ''}${bad.length ? `<p class="err">${bad.length} problem(s):</p><ul>${bad.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}`;
  if (!out.length) return;
  const site = location.origin + location.pathname.replace(/admin\.html$/, '').replace(/\/admin\/?$/, '/');
  const now = new Date(), pad = x => String(x).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const when = now.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  $('#bDl').onclick = () => dl(`student-logins-${stamp}.csv`, ['Username,Full Name,Password,Class,Section', ...out.map(r => r.map(csvCell).join(','))].join('\n'));
  $('#bPr').onclick = () => {
    let html = `<h3>${esc(CFG.SCHOOL)}: student logins (issued ${esc(when)})</h3>`, lastSec = null;
    out.forEach(r => {
      const lab = classLabel({ class_level: r[3], section: r[4] });
      if (r[4] !== lastSec) { html += `<h3 style="margin:12px 0 6px;${lastSec !== null ? 'break-before:page;' : ''}">${esc(lab)}</h3>`; lastSec = r[4]; }
      html += `<div class="lslip"><b>${esc(CFG.SCHOOL)}</b><br><b>Name:</b> ${esc(r[1])}<br><b>Class:</b> ${esc(lab)}<br><b>Username:</b> ${esc(r[0])}<br><b>Password:</b> ${esc(r[2])}<br><b>Sign in at:</b> ${esc(site)}<br><b>Issued:</b> ${esc(when)}</div>`;
    });
    printOut(html);
  };
}
function editStudent(s) {
  if (!s) return;
  const m = modal(`<h2>Edit student</h2><label>Full name (check the spelling)</label><input id="sedn" value="${esc(s.full_name)}" maxlength="80">
  <div class="row"><div><label>Class</label><select id="sedc">${opts(CLASSES, s.class_level)}</select></div><div><label>Section (optional)</label><input id="seds" value="${esc(s.section || '')}" maxlength="40" placeholder="e.g. 1A Diamond"></div></div>
  <label>Username (what the student types to sign in)</label><input id="sedu" value="${esc(s.username)}" maxlength="30" autocapitalize="none" autocomplete="off">
  <p class="mute" style="margin:4px 0 0">If you change the username, tell the student the new one. The password stays the same. Small letters, numbers, dots, dashes and underscores only.</p>
  <div class="row" style="margin-top:12px"><button id="sedv">Save changes</button><button class="alt" id="sedx">Cancel</button></div>`);
  $('#sedx', m).onclick = () => m.remove();
  $('#sedv', m).onclick = e => run(e.target, async () => {
    const name = $('#sedn', m).value.trim().replace(/\s+/g, ' ');
    if (name.length < 2) return toast("Type the student's full name.", true);
    const nu = $('#sedu', m).value.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(nu)) return toast('Username: 3 to 30 small letters, numbers, dots, dashes or underscores, no spaces.', true);
    if (nu !== s.username && !confirm(`Change the username from ${s.username} to ${nu}?\nThe student must sign in with the new username from now on. The password stays the same.`)) return;
    const { error } = await sb.rpc('admin_edit_student', { uname: s.username, new_name: name, new_class: $('#sedc', m).value, new_section: $('#seds', m).value.trim(), new_username: nu });
    if (error) return toast(friendly(error.message), true);
    m.remove(); toast(nu !== s.username ? `Updated. New username: ${nu}` : 'Student updated'); listStudents(); loadSections();
  });
}
async function delStudent(u) {
  if (!confirm(`Delete ${u}?\nTheir account and ALL their exam results will be removed. This cannot be undone.\nExport the results to Excel first if you need them.`)) return;
  let { error } = await sb.rpc('admin_delete_student', { uname: u, force: false });
  if (error && /exam results/i.test(error.message)) {
    if (!confirm(`${u} has submitted exam results.\nDeleting this student removes those results too, so the number of students who submitted will go down.\n\nDelete anyway?`)) return;
    ({ error } = await sb.rpc('admin_delete_student', { uname: u, force: true }));
  }
  if (error) return toast(friendly(error.message), true);
  toast(`${u} deleted`); listStudents(); loadReq();
}
async function resetPw(u) {
  let np = prompt(`New password for ${u}.\nLeave empty to generate a random one (recommended):`); if (np === null) return;
  np = np.trim() || genPw(); const wk = weakPw(np); if (wk) return toast(wk, true);
  const { error } = await sb.rpc('admin_reset_password', { uname: u, newpass: np });
  if (error) return toast(friendly(error.message), true);
  alert(`Done. ${u} can now sign in with the password:\n\n${np}\n\nGive it to the student privately and ask them to change it (Change password button).`); loadReq();
}
async function loadReq() {
  const { data } = await sb.from('reset_requests').select('*').eq('done', false).order('created_at');
  $('#rq').innerHTML = data && data.length ? `<div class="card"><h3>Password requests (${data.length})</h3><p class="mute">Confirm who is asking before you give out a new password.</p>${data.map(r => `<p><b>${esc(r.username)}</b> <button class="sm" data-rq="${esc(r.username)}">Set new password</button> <button class="alt sm" data-dm="${esc(r.username)}">Dismiss</button></p>`).join('')}</div>` : '';
  $$('[data-rq]').forEach(b => b.onclick = () => resetPw(b.dataset.rq));
  $$('[data-dm]').forEach(b => b.onclick = async () => { const { error } = await sb.from('reset_requests').update({ done: true }).eq('username', b.dataset.dm); if (error) return toast(friendly(error.message), true); loadReq(); });
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const isLimit = e => !!e && (e.status === 429 || /rate limit|too many/i.test(e.message || '') || /rate_limit/i.test(e.code || ''));
async function regStudents(f) {
  if (!f) return; const out = $('#sOut'); let ok = 0, skipped = 0; const bad = [], creds = [];
  out.innerHTML = '<p class="mute">Reading file…</p>';
  try {
    const rows = parseCSV((await f.text()).replace(/^\uFEFF/, ''));
    const head = (rows.shift() || []).map(h => h.toLowerCase().replace(/[^a-z]/g, ''));
    const iU = head.findIndex(h => h.includes('user')), iP = head.findIndex(h => h.includes('pass')), iC = head.findIndex(h => h.includes('class')), iS = head.findIndex(h => h.includes('section'));
    let iN = head.findIndex(h => h.includes('fullname')); if (iN < 0) iN = head.findIndex(h => h.includes('name') && !h.includes('user'));
    const chosen = $('#sUpC').value;
    if (iU < 0 || iN < 0 || (iC < 0 && !chosen)) { out.innerHTML = '<p class="err">The first row must have the headings Username, Full Name, Password and Class. Tap "Download CSV template" and use it.</p>'; return; }
    if (!rows.length) { out.innerHTML = '<p class="err">The file has no students under the headings.</p>'; return; }
    const { data: key, error: ke } = await sb.rpc('new_reg_key');
    if (ke || !key) { out.innerHTML = `<p class="err">Could not start registration: ${esc(ke ? ke.message : 'no key')}. Have you run the security SQL?</p>`; return; }
    const { data: have } = await sb.from('profiles').select('username,full_name,class_level').limit(5000);
    const exist = new Map((have || []).map(p => [p.username, p]));      // already registered
    const regClient = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    let lock = null; try { lock = await navigator.wakeLock.request('screen'); } catch (e) { }   // keep the screen awake
    try {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i], u0 = (r[iU] || '').trim(), u = u0.toLowerCase(), n = (r[iN] || '').trim(), p0 = iP >= 0 ? (r[iP] || '').trim() : '', fcls = iC >= 0 ? (r[iC] || '').toUpperCase().replace(/\s+/g, '') : '', cls = chosen || fcls, pw = p0 || genPw(), sec = iS >= 0 ? (r[iS] || '').trim().slice(0, 40) : '';
        if (!/^[a-z0-9._-]{3,30}$/.test(u) || !n || weakPw(pw) || !CLASSES.includes(cls)) { bad.push(`Row ${i + 2} (${u0 || 'blank'}): needs a username (3-30 letters or numbers, no spaces), a name, a class like JSS1, and a password of 8+ characters with letters and numbers that is not easy to guess (or leave it empty)`); continue; }
        if (chosen && fcls && fcls !== chosen) { bad.push(`Row ${i + 2} (${u}): the Class column says ${fcls} but you chose ${chosen}. Not registered.`); continue; }
        const ex0 = exist.get(u);
        if (ex0) {   // the same person registered before = skip; someone else using this username = a problem to fix, never silently skipped
          if (ex0.class_level === cls && String(ex0.full_name).trim().toLowerCase() === n.toLowerCase()) skipped++;
          else bad.push(`Row ${i + 2} (${u}): this username already belongs to ${ex0.full_name} (${ex0.class_level || 'no class'}). Use a different username for ${n}.`);
          continue;
        }
        let error = null;
        for (let t = 0; t < 8; t++) {
          out.innerHTML = `<p class="mute">Registering ${i + 1} of ${rows.length}: ${esc(u)} (${ok} done)</p>`;
          ({ error } = await Promise.race([regClient.auth.signUp({ email: u + '@' + CFG.EMAIL_DOMAIN, password: pw, options: { data: { full_name: n, class_level: cls, section: sec, reg_key: key } } }), wait(25000).then(() => ({ error: { message: 'Timed out. Check the Students list, and use Reset password if this student is there.' } }))]));
          if (!isLimit(error)) break;
          for (let s = 300; s > 0; s--) { out.innerHTML = `<p class="mute">Sign-up limit reached (${ok} done). Waiting ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}, then continuing. Keep this page open.</p>`; await wait(1000); }
        }
        if (error) bad.push(`Row ${i + 2} (${u}): ${error.message}`); else { ok++; creds.push([u, n, pw, cls, sec]); }
        await wait(300);
      }
    } finally { if (lock) lock.release().catch(() => { }); await sb.rpc('close_registration'); }   // the key stops working now
  } catch (e) { bad.push('Stopped: ' + (e.message || e)); }
  out.innerHTML = `<p><b>${ok}</b> student(s) registered${skipped ? `, ${skipped} already registered (skipped)` : ''}.</p>${ok ? '<button class="gold" id="bCred">Download login details (CSV)</button><p class="mute">Save the file now: passwords are not shown again. Give each student only their own details, then delete the file.</p>' : ''}${bad.length ? `<p class="err">${bad.length} problem(s):</p><ul>${bad.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}`;
  $('#sFile').value = '';
  if (ok) $('#bCred').onclick = () => dl('student-logins.csv', ['Username,Full Name,Password,Class,Section', ...creds.map(r => r.map(csvCell).join(','))].join('\n'));
  listStudents();
}

// ================= RESULTS =================
const grade = p => p >= 70 ? 'A' : p >= 60 ? 'B' : p >= 50 ? 'C' : p >= 45 ? 'D' : p >= 40 ? 'E' : 'F';
async function results() {
  const { data } = await sb.from('exams').select('id,title,class_level,subject,term,pass_mark').order('created_at', { ascending: false });
  $('#main').innerHTML = `<div class="card"><label>Choose exam</label><select id="rx"><option value="">Select…</option>${(data || []).map(x => `<option value="${x.id}">${esc(x.title)} (${esc(x.class_level)} ${esc(x.subject)})</option>`).join('')}</select>
  <div class="row" style="margin-top:10px"><button class="alt" id="rAll">Export ALL results (Excel)</button></div></div><div id="rOut"></div>`;
  $('#rx').onchange = () => $('#rx').value && showResults(data.find(x => x.id === $('#rx').value));
  $('#rAll').onclick = e => run(e.target, exportAll);
}
async function showResults(ex) {
  await sb.rpc('admin_finalize_expired', { eid: ex.id });   // mark anyone whose time is up, even if their phone never sent it
  const { data, error } = await sb.from('attempts').select('*,profiles(full_name,username,section)').eq('exam_id', ex.id).not('submitted_at', 'is', null);
  if (error) return toast(friendly(error.message), true);
  const rows = data.map(a => ({ ...a, pct: a.total ? +(a.score / a.total * 100).toFixed(1) : 0 })).sort((a, b) => b.pct - a.pct);
  let pos = 0, last = null; rows.forEach((r, i) => { if (r.pct !== last) { pos = i + 1; last = r.pct; } r.pos = pos; r.pass = r.pct >= ex.pass_mark; });
  const n = rows.length, avg = n ? (rows.reduce((s, r) => s + r.pct, 0) / n).toFixed(1) : 0;
  $('#rOut').innerHTML = n ? `<div class="card"><div class="row"><div><b>${n}</b><br><span class="mute">Submitted</span></div><div><b>${avg}%</b><br><span class="mute">Average</span></div><div><b>${rows[0].pct}%</b><br><span class="mute">Highest</span></div><div><b>${rows[n - 1].pct}%</b><br><span class="mute">Lowest</span></div><div><b>${Math.round(rows.filter(r => r.pass).length / n * 100)}%</b><br><span class="mute">Pass rate</span></div></div>
  <div class="row" style="margin-top:10px"><button id="rX">Export Excel</button><button class="alt" id="rP">Print / save as PDF</button><button class="alt" id="rS">Print result slips</button></div></div>
  <div class="card scroll"><table><tr><th>Pos</th><th>Name</th><th>Score</th><th>%</th><th>Grade</th><th>Result</th><th>Tab exits</th></tr>${rows.map(r => `<tr><td>${r.pos}</td><td>${esc(r.profiles?.full_name)}<br><span class="mute">${esc(classLabel({ class_level: ex.class_level, section: r.profiles?.section }))}</span></td><td>${r.score}/${r.total}</td><td>${r.pct}</td><td>${grade(r.pct)}</td><td><span class="badge ${r.pass ? 'ok' : 'bad'}">${r.pass ? 'Pass' : 'Fail'}</span></td><td>${r.tab_switches || 0}</td></tr>`).join('')}</table></div><div id="qa"></div>` : '<div class="card">No submissions yet for this exam.</div>';
  await loadPending(ex, n);
  if (!n) return;
  const sheet = rows.map(r => ({ Position: r.pos, Username: safeCell(r.profiles?.username), Name: safeCell(r.profiles?.full_name), Class: ex.class_level, Section: safeCell(r.profiles?.section || ''), Subject: ex.subject, Term: ex.term, Score: r.score, Total: r.total, Percent: r.pct, Grade: grade(r.pct), Result: r.pass ? 'Pass' : 'Fail', 'Tab exits': r.tab_switches || 0 }));
  $('#rX').onclick = () => { const when = nowStr(), wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet.map(r => ({ ...r, 'Date downloaded': when }))), 'Results'); XLSX.writeFile(wb, `${ex.title}-results-${dayStr()}.xlsx`); };
  $('#rP').onclick = () => printOut(`<h2>${esc(CFG.SCHOOL)}</h2><h3>${esc(ex.title)} — ${esc(ex.class_level)} ${esc(ex.subject)} ${esc(ex.term || '')}</h3><p>Class average ${avg}% · Highest ${rows[0].pct}% · Lowest ${rows[n - 1].pct}%<br><b>Date printed:</b> ${esc(nowStr())}</p><table><tr><th>Pos</th><th>Name</th><th>Section</th><th>Score</th><th>%</th><th>Grade</th><th>Result</th></tr>${rows.map(r => `<tr><td>${r.pos}</td><td>${esc(r.profiles?.full_name)}</td><td>${esc(r.profiles?.section || '')}</td><td>${r.score}/${r.total}</td><td>${r.pct}</td><td>${grade(r.pct)}</td><td>${r.pass ? 'Pass' : 'Fail'}</td></tr>`).join('')}</table>`);
  $('#rS').onclick = () => { const when = nowStr(); printOut(rows.map(r => `<div class="slip"><h2 style="text-align:center">${esc(CFG.SCHOOL)}</h2><h3 style="text-align:center">Result slip</h3><p><b>Student:</b> ${esc(r.profiles?.full_name)} (${esc(r.profiles?.username)})<br><b>Class:</b> ${esc(classLabel({ class_level: ex.class_level, section: r.profiles?.section }))}<br><b>Exam:</b> ${esc(ex.title)} — ${esc(ex.subject)} ${esc(ex.term || '')}<br><b>Score:</b> ${r.score}/${r.total} (${r.pct}%)<br><b>Grade:</b> ${grade(r.pct)} · <b>Position:</b> ${r.pos} of ${n} · <b>Remark:</b> ${r.pass ? 'Pass' : 'Fail'}<br><b>Date printed:</b> ${esc(when)}</p><p style="margin-top:30px">Teacher's signature: ____________________</p></div>`).join('')); };
  // question analysis
  const ids = [...new Set(rows.flatMap(r => r.question_order))];
  const { data: qs } = await sb.from('questions').select('id,question,correct,topic').in('id', ids);
  const st = (qs || []).map(q => { const wrong = rows.filter(r => r.answers[q.id] !== q.correct).length; return { q, wrong, p: Math.round(wrong / rows.filter(r => r.question_order.includes(q.id)).length * 100) }; }).sort((a, b) => b.p - a.p).slice(0, 10);
  $('#qa').innerHTML = `<div class="card scroll"><h3>Most missed questions</h3><table><tr><th>Question</th><th>Topic</th><th>Missed</th></tr>${st.map(s => `<tr><td>${fmt(s.q.question).slice(0, 120)}</td><td>${esc(s.q.topic || '-')}</td><td>${s.p}%</td></tr>`).join('')}</table></div>`;
}
async function loadPending(ex, done = 0) {
  const { data } = await sb.from('attempts').select('id,ends_at,answers,question_order,profiles(full_name,username,section)').eq('exam_id', ex.id).is('submitted_at', null);
  let box = $('#rPend'); if (!box) { box = document.createElement('div'); box.id = 'rPend'; $('#rOut').prepend(box); }
  if (!data || !data.length) { box.innerHTML = ''; return; }
  const late = a => Date.now() > new Date(a.ends_at).getTime();
  box.innerHTML = `<div class="card"><h3>Started but not submitted (${data.length})</h3><p>Submitted so far: <b>${done}</b> · Started in total: <b>${done + data.length}</b></p>
    <p class="mute">Their answers were saved as they worked. Tap to mark what was saved and add them to the results.</p>
    ${data.map(a => `<p><b>${esc(a.profiles?.full_name)}</b> <span class="mute">${esc(a.profiles?.username)}</span><br>Answered ${Object.keys(a.answers || {}).length} of ${a.question_order.length} · ${late(a) ? 'time is up' : 'still in progress'} <button class="sm" data-fs="${a.id}">Submit now</button></p>`).join('')}
    ${data.some(late) ? '<button class="gold" id="rFin" style="width:100%">Finish all with time up</button>' : ''}</div>`;
  $$('[data-fs]', box).forEach(b => b.onclick = () => run(b, async () => {
    const { error } = await sb.rpc('admin_submit_attempt', { aid: b.dataset.fs }); if (error) return toast(friendly(error.message), true);
    toast('Submitted'); showResults(ex);
  }));
  if ($('#rFin', box)) $('#rFin', box).onclick = e => run(e.target, async () => {
    const { data: n, error } = await sb.rpc('admin_finalize_expired', { eid: ex.id }); if (error) return toast(friendly(error.message), true);
    toast(`${n} attempt(s) finished`); showResults(ex);
  });
}
const nowStr = () => new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });   // e.g. 26 Oct 2026, 2:15 PM
const dayStr = () => { const d = new Date(), p = x => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
function printOut(html) { $('#slips').innerHTML = html; document.body.classList.add('ps'); window.onafterprint = () => document.body.classList.remove('ps'); print(); }
async function exportAll() {
  const { data, error } = await sb.from('attempts').select('score,total,tab_switches,exams(title,class_level,subject,term,pass_mark),profiles(full_name,username,section)').not('submitted_at', 'is', null);
  if (error) return toast(friendly(error.message), true); if (!data.length) return toast('No results yet.', true);
  const when = nowStr();
  const sh = data.map(a => { const p = a.total ? +(a.score / a.total * 100).toFixed(1) : 0; return { Class: a.exams.class_level, Section: safeCell(a.profiles.section || ''), Subject: a.exams.subject, Term: a.exams.term, Exam: a.exams.title, Username: safeCell(a.profiles.username), Name: safeCell(a.profiles.full_name), Score: a.score, Total: a.total, Percent: p, Grade: grade(p), Result: p >= a.exams.pass_mark ? 'Pass' : 'Fail', 'Date downloaded': when }; })
    .sort((a, b) => a.Class.localeCompare(b.Class) || a.Section.localeCompare(b.Section) || a.Subject.localeCompare(b.Subject) || b.Percent - a.Percent);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sh), 'All results'); XLSX.writeFile(wb, `all-results-${dayStr()}.xlsx`);
}
boot();


// ================= STUDY MATERIALS =================
const EXT = { pdf: ['pdf', 'application/pdf'], doc: ['word', 'application/msword'], docx: ['word', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ppt: ['ppt', 'application/vnd.ms-powerpoint'], pptx: ['ppt', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  mp4: ['video', 'video/mp4'], webm: ['video', 'video/webm'], mov: ['video', 'video/quicktime'] };
const SM = () => sb.storage.from('study-materials');
async function materials() {
  $('#main').innerHTML = `<div class="card"><div class="row">
    <div><label>Class</label><select id="mtC"><option value="">Any</option>${['All', ...CLASSES].map(c => `<option value="${c}">${clsName(c)}</option>`).join('')}</select></div>
    <div><label>Subject</label><input id="mtS" placeholder="e.g. Mathematics"></div>
    <div><label>Type</label><select id="mtK"><option value="">Any</option>${Object.entries(MK).map(([k, v]) => `<option value="${k}">${v[1]}</option>`).join('')}</select></div></div>
    <div class="row" style="margin-top:10px"><button id="mFind">Search</button><button class="gold" id="mAdd">+ Post material</button></div></div><div id="mtList"></div>`;
  $('#mFind').onclick = loadMats; $('#mAdd').onclick = () => mForm();
  loadMats();
}
async function loadMats() {
  let q = sb.from('materials').select('*').order('created_at', { ascending: false }).limit(300);
  if ($('#mtC').value) q = q.eq('class_level', $('#mtC').value);
  if ($('#mtS').value.trim()) q = q.ilike('subject', '%' + $('#mtS').value.trim() + '%');
  if ($('#mtK').value) q = q.eq('kind', $('#mtK').value);
  const { data, error } = await q; if (error) return toast(friendly(error.message), true);
  $('#mtList').innerHTML = `<p class="mute">${data.length} item(s)</p>` + (data.map(x => `<div class="card">
    <span class="badge gold">${MK[x.kind][0]} ${MK[x.kind][1]}</span> <span class="badge">${esc(clsName(x.class_level))}</span> <span class="badge">${esc(x.subject)}</span> ${x.topic ? `<span class="badge">${esc(x.topic)}</span> ` : ''}${x.published ? '' : '<span class="badge bad">Hidden</span> '}
    <h3 style="margin:.4em 0 .2em">${esc(x.title)}</h3>
    <p class="mute" style="margin:0 0 8px">${x.description ? esc(x.description) + '<br>' : ''}${x.kind === 'link' ? esc(x.link_url) : esc(x.file_name || '') + ' · ' + fsize(x.file_size)} · ${new Date(x.created_at).toLocaleDateString([], { dateStyle: 'medium' })}</p>
    <button class="alt sm" data-v="${x.id}">Preview</button> <button class="alt sm" data-e="${x.id}">Edit</button> <button class="alt sm" data-d="${x.id}">Delete</button></div>`).join('')
    || '<div class="card">Nothing posted yet. Tap “+ Post material” to add a video, PDF, PowerPoint or Word file.</div>');
  $$('[data-v]').forEach(b => b.onclick = () => run(b, () => openMaterial(data.find(x => x.id === b.dataset.v))));
  $$('[data-e]').forEach(b => b.onclick = () => mForm(data.find(x => x.id === b.dataset.e)));
  $$('[data-d]').forEach(b => b.onclick = async () => {
    const x = data.find(v => v.id === b.dataset.d);
    if (!(await askYes('Delete this study material?', `“${x.title}”\n\nStudents will no longer see it${x.file_path ? ', and the uploaded file is removed for good' : ''}. This cannot be undone.`, 'Yes, delete', 'Keep it'))) return;
    run(b, async () => {
      const { data: gone, error } = await sb.from('materials').delete().eq('id', x.id).select('id');
      if (error) return toast(friendly(error.message), true);
      if (!gone || !gone.length) return toast('Could not delete it. Refresh the page and try again.', true);
      if (x.file_path) { const { error: e2 } = await SM().remove([x.file_path]); if (e2) toast('Deleted, but the file could not be cleared from storage.', true); else toast('Deleted'); } else toast('Deleted');
      loadMats();
    });
  });
}
async function mForm(x = {}) {
  const { data: sj } = await sb.from('materials').select('subject').limit(1000);
  const subs = [...new Set((sj || []).map(r => r.subject))].sort();
  const m = modal(`<h2>${x.id ? 'Edit' : 'Post'} study material</h2>
  <div class="row"><div><label>Class</label><select id="mfC">${['All', ...CLASSES].map(c => `<option value="${c}" ${c === (x.class_level || 'All') ? 'selected' : ''}>${clsName(c)}</option>`).join('')}</select></div>
  <div><label>Subject</label><input id="mfS" list="mfSl" value="${esc(x.subject)}"><datalist id="mfSl">${subs.map(v => `<option value="${esc(v)}">`).join('')}</datalist></div></div>
  <label>Topic (optional)</label><input id="mfT" value="${esc(x.topic)}">
  <label>Title</label><input id="mfN" value="${esc(x.title)}" placeholder="e.g. Factors and multiples — lesson video">
  <label>Short description (optional)</label><textarea id="mfD" rows="2">${esc(x.description)}</textarea>
  <label>File: PDF, Word, PowerPoint or video (MP4/WebM/MOV), max ${MAX_MB} MB</label>
  <input id="mfF" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.mp4,.webm,.mov">
  <p class="mute" style="text-align:center;margin:6px 0">or</p>
  <label>Link (YouTube, Google Drive… use this for videos over ${MAX_MB} MB)</label><input id="mfL" type="url" value="${esc(x.link_url)}" placeholder="https://…">
  <p class="mute">${x.id ? 'Leave the file and link as they are to keep the current one. Choosing a new one replaces it.' : ''}</p>
  <label>Visible to students?</label><select id="mfV"><option value="yes" ${x.published === false ? '' : 'selected'}>Yes, show now</option><option value="no" ${x.published === false ? 'selected' : ''}>No, keep hidden</option></select>
  <div class="row" style="margin-top:12px"><button id="mfSave">Save</button><button class="alt" id="mfX">Cancel</button></div>`);
  $('#mfX', m).onclick = () => m.remove();
  $('#mfSave', m).onclick = e => run(e.target, async () => {
    const r = { class_level: $('#mfC', m).value, subject: $('#mfS', m).value.trim(), topic: $('#mfT', m).value.trim(), title: $('#mfN', m).value.trim(),
      description: $('#mfD', m).value.trim() || null, published: $('#mfV', m).value === 'yes' };
    if (!r.subject || !r.title) return toast('Title and subject are required.', true);
    const f = $('#mfF', m).files[0], link = $('#mfL', m).value.trim();
    const linkChanged = link && link !== (x.link_url || '');
    if (f && link && (!x.id || linkChanged)) return toast('Choose a file or a link, not both.', true);
    if (!x.id && !f && !link) return toast('Choose a file to upload, or paste a link.', true);
    let oldPath = null, up = null;
    if (f) {
      const ext = f.name.split('.').pop().toLowerCase(), t = EXT[ext];
      if (!t) return toast('That file type is not allowed. Use PDF, Word, PowerPoint or a video (MP4, WebM, MOV).', true);
      if (f.size > MAX_MB * 1048576) return toast(`That file is ${fsize(f.size)} and the limit is ${MAX_MB} MB. Upload big videos to YouTube or Google Drive and paste the link instead.`, true);
      const path = crypto.randomUUID() + '.' + ext;
      const { error } = await SM().upload(path, f, { contentType: t[1] });
      if (error) return toast('Upload failed: ' + error.message, true);
      up = path; oldPath = x.file_path;
      Object.assign(r, { kind: t[0], file_path: path, file_name: f.name, file_size: f.size, link_url: null });
    } else if (link && (!x.id || linkChanged)) {
      if (!/^https?:\/\/\S+$/i.test(link)) return toast('The link must start with http:// or https://', true);
      oldPath = x.file_path;
      Object.assign(r, { kind: 'link', link_url: link, file_path: null, file_name: null, file_size: null });
    }
    const { error } = x.id ? await sb.from('materials').update(r).eq('id', x.id) : await sb.from('materials').insert(r);
    if (error) { if (up) await SM().remove([up]); return toast(friendly(error.message), true); }
    if (oldPath && oldPath !== up) await SM().remove([oldPath]);
    m.remove(); toast('Saved'); loadMats();
  });
}


// ================= SIGN-IN ACTIVITY =================
const fmtWhen = iso => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const ONLINE_MS = 5 * 60000;   // a page that has not checked in for 5 minutes is treated as left
const durTxt = ms => { const m = Math.round(ms / 60000); return ms < 60000 ? 'Under 1 min' : m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; };
function presInfo(r) {
  const at = new Date(r.at).getTime(), span = iso => durTxt(new Date(iso).getTime() - at);
  if (r.left_at && r.left_how === 'signed out') return { left: r.left_at, text: 'Signed out', dur: span(r.left_at) };
  if (r.left_at) return { left: r.left_at, text: 'Last active (did not sign out)', dur: span(r.left_at) };
  if (r.last_seen) return Date.now() - new Date(r.last_seen).getTime() < ONLINE_MS ? { online: true, text: 'Online now', dur: durTxt(Date.now() - at) } : { left: r.last_seen, text: 'Last active (did not sign out)', dur: span(r.last_seen) };
  return { text: 'Not recorded', dur: '' };
}
let actRows = [];
async function activity() {
  $('#main').innerHTML = `<div class="card"><div class="row">
    <div><label>Who</label><select id="aW"><option value="student">Students</option><option value="admin">Teachers</option><option value="">Everyone</option></select></div>
    <div><label>Period</label><select id="aP"><option value="0">Today</option><option value="7" selected>Last 7 days</option><option value="30">Last 30 days</option><option value="">All time</option></select></div>
    <div><label>Class</label><select id="aC"><option value="">All classes</option>${CLASSES.map(c => `<option>${c}</option>`).join('')}</select></div>
    <div><label>Show</label><select id="aO"><option value="">All sign-ins</option><option value="1">Online now only</option></select></div></div>
    <label>Search name or username</label><input id="aS" placeholder="Type to search">
    <div class="row" style="margin-top:10px"><button id="aGo">Show</button><button class="alt" id="aX">Export Excel</button></div></div><div id="aOut"></div>`;
  $('#aGo').onclick = e => run(e.target, loadActivity);
  $('#aS').addEventListener('keydown', e => { if (e.key === 'Enter') $('#aGo').click(); });
  $('#aX').onclick = () => {
    if (!actRows.length) return toast('Nothing to export. Tap Show first.', true);
    const when = nowStr(), sh = actRows.map(r => ({ 'Signed in': fmtWhen(r.at), Left: presInfo(r).left ? fmtWhen(presInfo(r).left) : presInfo(r).text, 'How': presInfo(r).text, 'Time on platform': presInfo(r).dur, Username: safeCell(r.username || ''), Name: safeCell(r.full_name || ''), Role: r.role === 'admin' ? 'Teacher' : 'Student', Class: r.class_level || '', Section: safeCell(r.section || ''), 'Date downloaded': when }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sh), 'Sign-ins'); XLSX.writeFile(wb, `sign-ins-${dayStr()}.xlsx`);
  };
  loadActivity();
}
async function loadActivity() {
  const w = $('#aW').value, p = $('#aP').value, c = $('#aC').value, q = $('#aS').value.trim().toLowerCase(), LIM = 1000;
  let since = null; if (p === '0') { since = new Date(); since.setHours(0, 0, 0, 0); } else if (p) since = new Date(Date.now() - p * 864e5);
  let qy = sb.from('login_log').select('*').order('at', { ascending: false }).limit(LIM);
  if (since) qy = qy.gte('at', since.toISOString()); if (w) qy = qy.eq('role', w); if (c) qy = qy.eq('class_level', c);
  const { data, error } = await qy; if (error) return toast(friendly(error.message), true);
  const hit = r => !q || `${r.full_name || ''} ${r.username || ''}`.toLowerCase().includes(q);
  actRows = data.filter(r => hit(r) && (!$('#aO').value || presInfo(r).online));
  const people = new Set(actRows.map(r => r.user_id)).size, capped = data.length >= LIM;
  let html = `<div class="card"><div class="row"><div><b>${actRows.length}</b><br><span class="mute">Sign-ins</span></div><div><b>${people}</b><br><span class="mute">Different people</span></div><div><b>${new Set(actRows.filter(r => presInfo(r).online).map(r => r.user_id)).size}</b><br><span class="mute">Online now</span></div></div>${capped ? `<p class="mute">Showing the latest ${LIM} sign-ins only. Choose a shorter period to see everything.</p>` : ''}</div>`;
  html += actRows.length ? `<div class="card">${actRows.map(r => { const pi = presInfo(r); return `<div style="padding:10px 0;border-bottom:1px solid var(--line)"><b>${esc(r.full_name)}</b>${w === '' ? ` <span class="badge">${r.role === 'admin' ? 'Teacher' : 'Student'}</span>` : ''} ${pi.online ? '<span class="badge ok">Online now</span>' : ''}<br><span class="mute">${esc(r.username)} · ${esc(classLabel(r))}</span><br>Signed in: ${esc(fmtWhen(r.at))}${r.kind === 'resumed' ? ' <span class="mute">(returned after a long break)</span>' : ''}<br>${pi.online ? '' : pi.left ? `Left: ${esc(fmtWhen(pi.left))}<br><span class="mute">${esc(pi.text)}</span><br>` : `<span class="mute">${esc(pi.text)}</span><br>`}Time on platform: ${esc(pi.dur)}</div>`; }).join('')}</div>` : '<div class="card">No sign-ins found for these choices.</div>';
  if (w === 'student' && !capped) {
    let pq = sb.from('profiles').select('id,full_name,username,class_level,section').eq('role', 'student').order('full_name').limit(3000);
    if (c) pq = pq.eq('class_level', c);
    const { data: pr } = await pq, seen = new Set(data.map(r => r.user_id));
    const miss = (pr || []).filter(s => !seen.has(s.id) && hit(s));
    html += `<div class="card"><h3>Did NOT sign in during this period (${miss.length})</h3>` + (miss.length ? `<div class="scroll"><table><tr><th>Name</th><th>Class</th></tr>${miss.map(s => `<tr><td>${esc(s.full_name)}<br><span class="mute">${esc(s.username)}</span></td><td>${esc(classLabel(s))}</td></tr>`).join('')}</table></div>` : '<p class="mute">Everyone signed in.</p>') + '</div>';
  }
  $('#aOut').innerHTML = html;
}


// In-page yes/no box. Phone browsers can silently block the built-in confirm() pop-up, which made Delete do nothing.
function askYes(title, body, yes = 'Yes', no = 'Cancel') {
  return new Promise(res => {
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div><h2>${esc(title)}</h2><p style="white-space:pre-line">${esc(body)}</p><div class="row" style="margin-top:12px"><button class="bad" id="aYes">${esc(yes)}</button><button class="alt" id="aNo">${esc(no)}</button></div></div>`;
    document.body.append(m);
    const done = v => { m.remove(); res(v); };
    $('#aYes', m).onclick = () => done(true); $('#aNo', m).onclick = () => done(false);
  });
}


// ================= MESSAGES TO STUDENTS =================
async function messages() {
  $('#main').innerHTML = `<div class="card"><h3>New message</h3>
    <label>Send to</label><select id="msTo"><option value="All">All students</option>${CLASSES.map(c => `<option value="${c}">${c} (whole class)</option>`).join('')}<option value="ONE">One student only…</option></select>
    <div id="msOne" style="display:none"><label>Student username</label><input id="msUser" autocapitalize="off" autocomplete="off" placeholder="e.g. zoe.idemudia"></div>
    <label>Title</label><input id="msTitle" maxlength="100" placeholder="e.g. Mathematics test on Friday">
    <label>Message</label><textarea id="msBody" rows="5" maxlength="2000" placeholder="Type your message here"></textarea>
    <div class="row" style="margin-top:10px"><button id="msSend">Send message</button></div></div><div id="msList"></div>`;
  $('#msTo').onchange = () => { $('#msOne').style.display = $('#msTo').value === 'ONE' ? 'block' : 'none'; };
  $('#msSend').onclick = e => run(e.target, async () => {
    const to = $('#msTo').value, title = $('#msTitle').value.trim(), body = $('#msBody').value.trim();
    if (!title || !body) return toast('Please write a title and a message.', true);
    const row = { title, body, class_level: 'All', student_id: null };
    let who = to === 'All' ? 'all students' : to + ' students';
    if (to === 'ONE') {
      const u = $('#msUser').value.trim().toLowerCase(); if (!u) return toast('Type the student\'s username.', true);
      const { data: st, error: e1 } = await sb.from('profiles').select('id,full_name').eq('role', 'student').eq('username', u).maybeSingle();
      if (e1) return toast(friendly(e1.message), true);
      if (!st) return toast('No student found with that username.', true);
      row.student_id = st.id; who = st.full_name;
    } else if (to !== 'All') row.class_level = to;
    const { error } = await sb.from('messages').insert(row); if (error) return toast(friendly(error.message), true);
    $('#msTitle').value = ''; $('#msBody').value = ''; toast('Sent to ' + who); loadMsgs();
  });
  loadMsgs();
}
async function loadMsgs() {
  const { data, error } = await sb.from('messages').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) return toast(friendly(error.message), true);
  const [{ data: st }, { data: names }] = await Promise.all([
    sb.rpc('admin_message_stats'),
    (() => { const ids = [...new Set(data.map(x => x.student_id).filter(Boolean))]; return ids.length ? sb.from('profiles').select('id,full_name,username').in('id', ids) : Promise.resolve({ data: [] }); })()]);
  const stat = Object.fromEntries((st || []).map(x => [x.message_id, x])), nm = Object.fromEntries((names || []).map(x => [x.id, x]));
  $('#msList').innerHTML = `<p class="mute">${data.length} message(s) sent</p>` + (data.map(x => {
    const s = stat[x.id], to = x.student_id ? (nm[x.student_id] ? `${nm[x.student_id].full_name} (private)` : 'One student (private)') : x.class_level === 'All' ? 'All students' : x.class_level + ' students';
    return `<div class="card"><span class="badge gold">${esc(to)}</span> <span class="mute">${esc(fmtWhen(x.created_at))}</span>
      <h3 style="margin:.4em 0 .2em">${esc(x.title)}</h3><p style="white-space:pre-line;margin:0 0 8px">${esc(x.body)}</p>
      <p class="mute" style="margin:0 0 8px">${s ? `Read by ${s.reads} of ${s.audience}` : ''}</p><button class="alt sm" data-md="${x.id}">Delete</button></div>`;
  }).join('') || '<div class="card">No messages sent yet.</div>');
  $$('[data-md]').forEach(b => b.onclick = async () => {
    const x = data.find(v => v.id === b.dataset.md);
    if (!(await askYes('Delete this message?', `“${x.title}”\n\nStudents will no longer see it. This cannot be undone.`, 'Yes, delete', 'Keep it'))) return;
    run(b, async () => {
      const { data: gone, error } = await sb.from('messages').delete().eq('id', x.id).select('id');
      if (error) return toast(friendly(error.message), true);
      if (!gone || !gone.length) return toast('Could not delete it. Refresh and try again.', true);
      toast('Deleted'); loadMsgs();
    });
  });
}


// ================= BACKUP =================
const BK_TABLES = [['profiles', 'Students and teachers', 'id'], ['questions', 'Question bank', 'id'], ['exams', 'Exams', 'id'], ['attempts', 'Exam attempts and scores', 'id'],
  ['materials', 'Study materials (list only)', 'id'], ['messages', 'Messages', 'id'], ['message_reads', 'Who read which message', 'message_id'],
  ['login_log', 'Sign-in activity', 'id'], ['audit_log', 'Audit log', 'id'], ['reset_requests', 'Password reset requests', 'id']];
async function fetchAll(table, order) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let { data, error } = await sb.from(table).select('*').order(order).range(from, from + 999);
    if (error) ({ data, error } = await sb.from(table).select('*').range(from, from + 999));   // retry without sorting
    if (error) return { error };
    out.push(...data); if (data.length < 1000) break;
  }
  if (table === 'profiles') out.forEach(r => { delete r.session_token; });   // a live login token must never go into a file
  return { data: out };
}
async function backup() {
  const last = localStorage.getItem('cbt-lastbackup');
  $('#main').innerHTML = `<div class="card"><h2>Back up your data</h2>
    <p>${last ? `Your last backup from this phone: <b>${esc(fmtWhen(last))}</b>.` : '<b>You have not made a backup from this phone yet.</b>'}</p>
    <p class="mute">This saves a copy of your students, questions, exams, scores, messages and sign-in history as a file on your phone. Make one after every exam period and before any big change.</p>
    <div class="row"><button id="bkJson">Download backup (JSON)</button><button class="alt" id="bkXlsx">Download backup (Excel)</button></div>
    <p id="bkMsg" class="mute" style="margin-top:10px"></p></div>
    <div class="card"><h3>Please read</h3><ul>
    <li>The <b>JSON</b> file is the complete copy. The <b>Excel</b> file is the same data, easier to read.</li>
    <li>The file contains <b>correct answers and exam codes</b>. Keep it private: move it to a safe place (Google Drive, a flash drive) and delete it from your Downloads.</li>
    <li><b>Passwords cannot be backed up.</b> They are stored scrambled by Supabase. If accounts were ever lost, students would get new passwords from the Login sheet.</li>
    <li><b>Files</b> (study-material uploads and question pictures) are not inside the backup. Their list is, and the files stay in Supabase Storage.</li></ul></div>`;
  const go = kind => run($(kind === 'json' ? '#bkJson' : '#bkXlsx'), async () => {
    const msg = $('#bkMsg'), tables = {}, notes = [];
    for (let i = 0; i < BK_TABLES.length; i++) {
      const [t, label, ord] = BK_TABLES[i]; msg.textContent = `Reading ${label.toLowerCase()}… (${i + 1} of ${BK_TABLES.length})`;
      const { data, error } = await fetchAll(t, ord);
      if (error) notes.push(`${t}: not saved (${error.message})`); else tables[t] = data;
    }
    const madeAt = new Date().toISOString(), counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
    if (kind === 'json') dl(`excellentia-backup-${dayStr()}.json`, JSON.stringify({ app: 'Excellentia CBT', school: CFG.SCHOOL, made_at: madeAt, counts, notes, tables }), 'application/json');
    else {
      const wb = XLSX.utils.book_new(), flat = r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v !== null && typeof v === 'object' ? JSON.stringify(v).slice(0, 32000) : (typeof v === 'string' ? safeCell(v).slice(0, 32000) : v)]));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Backup: 'Excellentia CBT', School: CFG.SCHOOL, 'Date made': nowStr(), ...Object.fromEntries(Object.entries(counts).map(([k, v]) => ['Rows in ' + k, v])) }]), 'About');
      for (const [t, v] of Object.entries(tables)) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(v.length ? v.map(flat) : [{ note: 'No rows' }]), t.slice(0, 31));
      XLSX.writeFile(wb, `excellentia-backup-${dayStr()}.xlsx`);
    }
    localStorage.setItem('cbt-lastbackup', madeAt);
    msg.innerHTML = `Done. Saved ${Object.values(counts).reduce((a, b) => a + b, 0)} rows from ${Object.keys(counts).length} tables.${notes.length ? `<br><span class="err">${notes.map(esc).join('<br>')}</span>` : ''}<br>Now move the file somewhere safe.`;
  });
  $('#bkJson').onclick = () => go('json'); $('#bkXlsx').onclick = () => go('xlsx');
}
