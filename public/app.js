import {
  ENTITY_TYPES, entityType, locationRule, COMPANIES, LEAD_STATUSES, DENY_REASONS, STAGES, UPSELL_TYPES, OUTCOMES,
  REVENUE_TYPES, COUNTRIES, REGIONS, regionLabel, KNOWN_BRANDS, isEmail, isPhone,
} from './shared.js';
import { LANDING, RESOURCES } from './content.js';

const $app = document.getElementById('app');
const $topnav = document.getElementById('topnav');
const $subnav = document.getElementById('subnav');
let me = null;
let adminBadge = 0;

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '');
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const place = (l) => [l.city, l.state, l.country && COUNTRIES[l.country] ? (l.country === 'US' ? 'USA' : COUNTRIES[l.country]) : ''].filter(Boolean).join(', ');
const statusPill = (s) => { const x = LEAD_STATUSES[s] || { label: s, tone: 'neutral' }; return `<span class="pill ${x.tone}">${esc(x.label)}</span>`; };
const typeLabel = (id) => entityType(id)?.label || id;

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || 'Something went wrong. Try again.');
    e.status = res.status;
    if (res.status === 401 && !path.startsWith('/api/login')) { me = null; go('#/login'); }
    throw e;
  }
  return data;
}

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2800);
}
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
const formData = (form) => Object.fromEntries(new FormData(form).entries());
function showError(form, msg) {
  let box = form.querySelector('.err');
  if (!box) { box = document.createElement('div'); box.className = 'err'; box.setAttribute('role', 'alert'); form.prepend(box); }
  box.textContent = msg;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
async function busy(btn, fn) {
  const old = btn.innerHTML; btn.disabled = true; btn.textContent = 'Saving…';
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = old; }
}
const opts = (list, selected) => list.map((o) => {
  const [v, l] = Array.isArray(o) ? o : [o, o];
  return `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(l)}</option>`;
}).join('');

// ---------- chrome ----------
const REFERRER_NAV = [
  ['dashboard', 'Dashboard'], ['submit', 'Submit a lead'], ['check', 'Check availability'], ['leads', 'My leads'], ['earnings', 'Earnings'], ['resources', 'Resources'],
];
function renderChrome(active) {
  if (!me) {
    $topnav.innerHTML = `<a class="btn ghost sm" href="#/login">Sign in</a><a class="btn primary sm" href="#/apply">Apply</a>`;
    $subnav.hidden = true;
    return;
  }
  $topnav.innerHTML = `<span class="who">${esc(me.name)}</span><a class="btn sm" href="#/profile">Profile</a>`;
  if (me.status !== 'approved') { $subnav.hidden = true; return; }
  const items = [...REFERRER_NAV];
  if (me.role === 'admin') items.push(['admin', `Admin${adminBadge ? ` <span class="badge">${adminBadge}</span>` : ''}`]);
  $subnav.innerHTML = items.map(([id, label]) => `<a href="#/${id}" class="${active === id ? 'on' : ''}">${label}</a>`).join('');
  $subnav.hidden = false;
}
async function refreshAdminBadge() {
  if (me?.role !== 'admin' || me.status !== 'approved') return;
  try {
    const s = await api('/api/admin/summary');
    adminBadge = s.pendingUsers + s.newLeads;
    const a = $subnav.querySelector('a[href="#/admin"]');
    if (a) a.innerHTML = `Admin${adminBadge ? ` <span class="badge">${adminBadge}</span>` : ''}`;
  } catch {}
}

// ---------- router ----------
const PUBLIC = new Set(['', 'login', 'apply']);
async function route() {
  const parts = location.hash.split('?')[0].replace(/^#\/?/, '').split('/');
  const page = parts[0] || '';
  if (me === null) {
    try { me = (await api('/api/me')).user; } catch { me = null; }
  }
  if (!me && !PUBLIC.has(page)) return go('#/login');
  if (me && me.status !== 'approved' && !['', 'pending', 'profile'].includes(page)) return go('#/pending');
  if (me && me.status === 'approved' && (page === 'login' || page === 'apply' || page === 'pending')) return go('#/dashboard');
  if (page.startsWith('admin') && me?.role !== 'admin') return go('#/dashboard');
  const tab = page === 'lead' ? 'leads' : page;
  renderChrome(tab);
  $app.innerHTML = '<div class="loading">Loading…</div>';
  window.scrollTo(0, 0);
  try {
    const view = VIEWS[page] || VIEWS[''];
    await view(...parts.slice(1));
  } catch (e) {
    if (e.status === 401) return;
    $app.innerHTML = `<div class="card narrow"><h2>Something went wrong</h2><p class="muted">${esc(e.message)}</p><a class="btn" href="#/dashboard">Back to dashboard</a></div>`;
  }
  document.title = `${document.querySelector('#app h1')?.textContent || 'Referral Partners'} · CovenantGO`;
  refreshAdminBadge();
}
window.addEventListener('hashchange', route);

// ---------- public: landing ----------
function landing() {
  const L = LANDING;
  $app.innerHTML = `
    <section class="hero">
      <img class="wordmark" src="img/tiktokgo-wordmark-w.png" alt="TikTok GO" />
      <h1>${esc(L.title)}</h1>
      <p class="lead">${esc(L.lead)}</p>
      <div class="row">
        ${me ? `<a class="btn primary lg" href="#/dashboard">Go to your dashboard</a>` : `<a class="btn primary lg" href="#/apply">Apply to become a partner</a><a class="btn lg" href="#/login">Sign in</a>`}
      </div>
      <p class="note">${esc(L.eyebrow)} · Covenant Creative</p>
    </section>
    <section class="section">
      <h2>How it works</h2>
      <p class="sub">From introduction to payout, every step is tracked and time-stamped.</p>
      <div class="steps">${L.steps.map((s) => `<div class="card"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>`).join('')}</div>
    </section>
    <section class="section">
      <h2>Who you can refer</h2>
      <p class="sub">Across the United States, Mexico and Canada.</p>
      <div class="who-grid">${L.who.map((w) => `<div class="card"><b>${esc(w.title)}</b><span>${esc(w.text)}</span></div>`).join('')}</div>
    </section>
    <section class="section">
      <h2>Why partners use it</h2>
      <p class="sub">Built so you can reach out with confidence.</p>
      <div class="steps plain">${L.benefits.map((b) => `<div class="card"><h3>${esc(b.title)}</h3><p>${esc(b.text)}</p></div>`).join('')}</div>
    </section>
    <section class="section" id="faq">
      <h2>Frequently asked questions</h2>
      <p class="sub">Still have a question? Ask us after you sign in.</p>
      ${L.faq.map((f) => `<details class="faq"><summary>${esc(f.q)}</summary><div>${esc(f.a)}</div></details>`).join('')}
    </section>
    ${me ? '' : `<div class="cta-band"><div><h2>Ready to start referring?</h2><p class="muted" style="margin:4px 0 0">Applications are reviewed by the Covenant Creative team.</p></div><a class="btn primary lg" href="#/apply">Apply now</a></div>`}`;
}

// ---------- public: apply / login ----------
function apply() {
  $app.innerHTML = `
    <div class="narrow">
      <div class="pagehead"><div><h1>Apply to become a referral partner</h1><p>Our team reviews every application. You can submit leads once you're approved.</p></div></div>
      <form class="card" id="f" novalidate>
        <label class="f"><span>Full name <span class="req">*</span></span><input type="text" name="name" autocomplete="name" required /></label>
        <div class="grid2">
          <label class="f"><span>Email <span class="req">*</span></span><input type="email" name="email" autocomplete="email" required /></label>
          <label class="f"><span>Phone number <span class="req">*</span></span><input type="tel" name="phone" autocomplete="tel" required /></label>
        </div>
        <label class="f"><span>Company affiliation <span class="req">*</span></span>
          <select name="company_pick" required><option value="">Choose…</option>${opts(COMPANIES)}<option value="__other">Other company…</option></select>
          <span class="hint">Independent referrer? Choose "Self / Not Applicable".</span>
        </label>
        <label class="f" id="otherWrap" hidden><span>Company name <span class="req">*</span></span><input type="text" name="company_other" autocomplete="organization" /></label>
        <label class="f"><span>Create a password <span class="req">*</span></span><input type="password" name="password" autocomplete="new-password" minlength="8" required /><span class="hint">At least 8 characters.</span></label>
        <button class="btn primary lg" style="width:100%">Submit application</button>
        <p class="muted small" style="margin:12px 0 0;text-align:center">Already applied? <a href="#/login">Sign in</a></p>
      </form>
    </div>`;
  const f = $app.querySelector('#f');
  f.company_pick.addEventListener('change', () => { $app.querySelector('#otherWrap').hidden = f.company_pick.value !== '__other'; });
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = formData(f);
    const company = d.company_pick === '__other' ? d.company_other.trim() : d.company_pick;
    if (!d.name.trim()) return showError(f, 'Enter your full name');
    if (!isEmail(d.email)) return showError(f, 'Enter a valid email');
    if (!isPhone(d.phone)) return showError(f, 'Enter a valid phone number (with area code)');
    if (!company) return showError(f, 'Choose your company affiliation');
    if (d.password.length < 8) return showError(f, 'Use a password of at least 8 characters');
    try {
      await busy(f.querySelector('button.primary'), async () => {
        me = (await api('/api/register', { method: 'POST', body: { name: d.name, email: d.email, phone: d.phone, company, password: d.password } })).user;
      });
      go(me.status === 'approved' ? '#/dashboard' : '#/pending');
    } catch (e) { showError(f, e.message); }
  });
}

function login() {
  $app.innerHTML = `
    <div class="narrow" style="max-width:440px">
      <div class="pagehead"><div><h1>Sign in</h1><p>TikTok GO Referral Partners</p></div></div>
      <form class="card" id="f" novalidate>
        <label class="f"><span>Email</span><input type="email" name="email" autocomplete="email" required /></label>
        <label class="f"><span>Password</span><input type="password" name="password" autocomplete="current-password" required /></label>
        <button class="btn primary lg" style="width:100%">Sign in</button>
        <p class="muted small" style="margin:12px 0 0;text-align:center">New here? <a href="#/apply">Apply to become a partner</a><br />Forgot your password? Ask the Covenant Creative team to reset it.</p>
      </form>
    </div>`;
  const f = $app.querySelector('#f');
  f.email.focus();
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      await busy(f.querySelector('button'), async () => { me = (await api('/api/login', { method: 'POST', body: formData(f) })).user; });
      go(me.status === 'approved' ? '#/dashboard' : '#/pending');
    } catch (e) { showError(f, e.message); }
  });
}

function pending() {
  const denied = me.status === 'denied';
  $app.innerHTML = `
    <div class="card narrow success">
      <div class="big">${denied ? '✋' : '⏳'}</div>
      <h1>${denied ? 'Your application was not approved' : 'Thanks, your application is in'}</h1>
      <p class="muted" style="margin-top:10px">${denied
        ? 'If you think this is a mistake, contact the Covenant Creative team.'
        : `We'll review it shortly. Once you're approved you can submit leads, check availability and track your pipeline here. Sign in again any time to check.`}</p>
      <dl class="dl" style="text-align:left;max-width:360px;margin:18px auto">
        <dt>Name</dt><dd>${esc(me.name)}</dd><dt>Email</dt><dd>${esc(me.email)}</dd><dt>Company</dt><dd>${esc(me.company)}</dd><dt>Applied</dt><dd>${esc(when(me.created_at))}</dd>
      </dl>
      <div class="row" style="justify-content:center">${denied ? '' : '<button class="btn" id="re">Check again</button>'}<button class="btn ghost" id="out">Sign out</button></div>
    </div>`;
  $app.querySelector('#out').onclick = signOut;
  const re = $app.querySelector('#re');
  if (re) re.onclick = async () => { me = null; route(); };
}

async function signOut() {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  me = null; adminBadge = 0;
  go('#/');
}

// ---------- referrer: dashboard ----------
async function dashboard() {
  const [s, { leads }] = await Promise.all([api('/api/stats'), api('/api/leads')]);
  const max = Math.max(1, s.total);
  $app.innerHTML = `
    <div class="pagehead"><div><h1>Hi, ${esc(me.name.split(' ')[0])}</h1><p>${esc(me.company)} · Referral partner</p></div>
      <div class="row"><a class="btn" href="#/check">Check availability</a><a class="btn primary" href="#/submit">+ Submit a lead</a></div></div>
    <div class="tiles">
      <a class="tile hero-tile" href="#/leads"><div class="k">Total referrals</div><div class="v">${s.total}</div></a>
      ${ENTITY_TYPES.map((t) => `<a class="tile" href="#/leads?type=${t.id}"><div class="k">${esc(t.plural)}</div><div class="v">${s.byType[t.id]}</div></a>`).join('')}
    </div>
    <div class="cols" style="margin-top:16px">
      <div class="stack">
        <div class="card">
          <div class="spread" style="margin-bottom:12px"><h2 style="margin:0">Recent leads</h2><a href="#/leads" class="small">See all</a></div>
          ${leads.length ? `<ul class="list">${leads.slice(0, 6).map(leadRow).join('')}</ul>` : `<div class="empty">No leads yet.<br /><a class="btn primary" style="margin-top:12px" href="#/submit">Submit your first lead</a></div>`}
        </div>
        <div class="card">
          <h2>Pipeline</h2>
          <div class="funnel">${STAGES.map((st) => `<div class="bar"><span>${esc(st.label)}</span><div class="track"><div class="fill" style="width:${(s.byStage[st.id] / max) * 100}%"></div></div><span class="n">${s.byStage[st.id]}</span></div>`).join('')}</div>
        </div>
      </div>
      <div class="stack">
        <a class="card" href="#/earnings" style="display:block;color:inherit;text-decoration:none">
          <div class="spread"><h2 style="margin:0">Earnings</h2><span class="small" style="color:var(--pink)">Details →</span></div>
          <div style="font-size:34px;font-weight:800;letter-spacing:-.02em;margin:8px 0 6px" class="money">${money(s.revenueTotal)}</div>
          <dl class="dl small">${REVENUE_TYPES.map((r) => `<dt>${esc(r.label)}</dt><dd class="money">${money(s.revenue[r.id])}</dd>`).join('')}</dl>
        </a>
        <div class="card">
          <h2>Review status</h2>
          <dl class="dl">${Object.entries(LEAD_STATUSES).map(([k, v]) => `<dt>${statusPill(k)}</dt><dd>${s.byStatus[k]}</dd>`).join('')}</dl>
          ${s.byStatus.info_needed ? `<p class="small" style="margin:12px 0 0;color:var(--info)">${s.byStatus.info_needed} lead${s.byStatus.info_needed > 1 ? 's need' : ' needs'} more info from you. Open it in My leads to reply.</p>` : ''}
        </div>
      </div>
    </div>`;
}
const leadRow = (l) => `<li><a class="item" href="#/lead/${l.id}">
  <div><div class="t">${esc(l.name)}</div><div class="muted small">${esc(typeLabel(l.entity_type))}${place(l) ? ' · ' + esc(place(l)) : ''} · ${esc(day(l.created_at))}</div></div>
  <div style="text-align:right">${statusPill(l.status)}${l.outcome !== 'active' ? `<div class="small muted" style="margin-top:4px">${esc(OUTCOMES[l.outcome])}</div>` : ''}</div></a></li>`;

// ---------- referrer: submit ----------
async function submit() {
  let brands = [];
  try { brands = (await api('/api/brands')).brands; } catch {}
  const allBrands = [...new Set([...brands, ...KNOWN_BRANDS])].sort();
  $app.innerHTML = `
    <div class="medium">
      <div class="pagehead"><div><h1>Submit a lead</h1><p>Every submission is time-stamped the moment you submit. Fields marked <span class="go">*</span> are required.</p></div></div>
      <form class="card" id="f" novalidate>
        <fieldset><legend>What are you referring? <span class="req go">*</span></legend>
          <div class="types">${ENTITY_TYPES.map((t, i) => `<label><input type="radio" name="entity_type" value="${t.id}"${i === 0 ? ' checked' : ''} /><b>${esc(t.label)}</b><span>${esc(t.hint || 'A single property')}</span></label>`).join('')}</div>
        </fieldset>
        <fieldset><legend>The property / entity</legend>
          <label class="f"><span id="nameLbl">Property name <span class="req">*</span></span><input type="text" name="name" autocomplete="off" required /></label>
          <div id="claims"></div>
          <label class="f" id="parentWrap"><span>Parent company / brand <span class="opt">(if any)</span></span><input type="text" name="parent_brand" list="brandList" autocomplete="off" placeholder="e.g. Marriott" /><datalist id="brandList">${allBrands.map((b) => `<option value="${esc(b)}">`).join('')}</datalist></label>
          <div id="locToggle" hidden><p class="small muted" style="margin:-4px 0 12px">Location is optional for this type. <a href="#" id="showLoc">Add a location</a></p></div>
          <div id="loc">
            <div class="grid3">
              <label class="f"><span>Country <span class="req" data-r="country">*</span></span><select name="country"><option value="">Choose…</option>${opts(Object.entries(COUNTRIES))}</select></label>
              <label class="f"><span><span id="stateLbl">State</span> <span class="req" data-r="state">*</span></span><select name="state" disabled><option value="">Choose a country first</option></select></label>
              <label class="f"><span>City <span class="req" data-r="city">*</span><span class="opt" data-o="city"> (optional)</span></span><input type="text" name="city" autocomplete="off" /></label>
            </div>
          </div>
          <label class="f"><span>Website <span class="opt">(optional, helps us spot duplicates)</span></span><input type="url" name="website" placeholder="example.com" autocomplete="off" /></label>
        </fieldset>
        <fieldset><legend>Decision-maker contact</legend>
          <p class="small muted" style="margin:-6px 0 12px">Required so we can verify the lead. If two partners submit the same property, the contact's seniority helps us decide.</p>
          <div class="grid2">
            <label class="f"><span>Contact person's name <span class="req">*</span></span><input type="text" name="contact_name" autocomplete="off" required /></label>
            <label class="f"><span>Title / position <span class="req">*</span></span><input type="text" name="contact_title" autocomplete="off" placeholder="e.g. General Manager" required /></label>
            <label class="f"><span>Business email <span class="req">*</span></span><input type="email" name="contact_email" autocomplete="off" required /></label>
            <label class="f"><span>Business phone <span class="req">*</span></span><input type="tel" name="contact_phone" autocomplete="off" required /></label>
          </div>
        </fieldset>
        <label class="f"><span>Notes <span class="opt">(optional)</span></span><textarea name="notes" placeholder="How you know them, what they're interested in, best time to reach them…"></textarea></label>
        <div class="row end"><a class="btn ghost" href="#/dashboard">Cancel</a><button class="btn primary lg">Submit lead</button></div>
      </form>
    </div>`;
  const f = $app.querySelector('#f');
  let showLoc = false;
  const sync = () => {
    const type = f.entity_type.value;
    const t = entityType(type);
    const rule = locationRule(type);
    $app.querySelector('#nameLbl').innerHTML = `${type === 'hotel' ? 'Property name' : `${esc(t.label)} name`} <span class="req">*</span>`;
    $app.querySelector('#parentWrap').hidden = type !== 'hotel';
    const optional = rule === 'optional';
    $app.querySelector('#locToggle').hidden = !optional || showLoc;
    $app.querySelector('#loc').hidden = optional && !showLoc;
    $app.querySelectorAll('[data-r]').forEach((el) => {
      const field = el.dataset.r;
      el.hidden = optional || (rule === 'state' && field === 'city');
    });
    $app.querySelector('[data-o="city"]').hidden = !(optional || rule === 'state');
  };
  f.addEventListener('change', (e) => { if (e.target.name === 'entity_type') { sync(); checkClaims(); } });
  $app.querySelector('#showLoc').onclick = (e) => { e.preventDefault(); showLoc = true; sync(); };
  f.country.addEventListener('change', () => {
    const c = f.country.value;
    $app.querySelector('#stateLbl').textContent = c ? regionLabel(c) : 'State';
    f.state.disabled = !c;
    f.state.innerHTML = c ? `<option value="">Choose…</option>${opts(REGIONS[c])}` : '<option value="">Choose a country first</option>';
    checkClaims();
  });
  sync();

  // Live "is it taken?" check while typing the name
  let timer, seq = 0;
  const checkClaims = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = f.name.value.trim();
      const box = $app.querySelector('#claims');
      if (q.length < 3) { box.innerHTML = ''; return; }
      const n = ++seq;
      try {
        const { results } = await api(`/api/check?q=${encodeURIComponent(q)}&country=${encodeURIComponent(f.country.value)}`);
        if (n !== seq) return;
        box.innerHTML = results.length
          ? `<div class="claims taken"><b>Possible match already in the system:</b><ul>${results.slice(0, 5).map((r) => `<li>${esc(r.name)} · ${esc(typeLabel(r.entity_type))}${place(r) ? ' · ' + esc(place(r)) : ''} · <b>${r.mine ? 'Your submission' : esc(r.claimed)}</b></li>`).join('')}</ul><div style="margin-top:6px">If it's the same place, it will be flagged for review. Different place? Submit as usual.</div></div>`
          : `<div class="claims free">✓ No matching submissions yet.</div>`;
      } catch {}
    }, 350);
  };
  f.name.addEventListener('input', checkClaims);

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = formData(f);
    const rule = locationRule(d.entity_type);
    if (!d.name.trim()) return showError(f, 'Enter the property / entity name');
    if (rule === 'required' && !(d.country && d.state && d.city.trim())) return showError(f, 'City, state and country are required for this type');
    if (rule === 'state' && !(d.country && d.state)) return showError(f, 'State and country are required for this type');
    if (!d.contact_name.trim()) return showError(f, "Enter the contact person's name");
    if (!d.contact_title.trim()) return showError(f, "Enter the contact's title / position");
    if (!isEmail(d.contact_email)) return showError(f, 'Enter a valid business email');
    if (!isPhone(d.contact_phone)) return showError(f, 'Enter a valid business phone number (with area code)');
    if (d.entity_type !== 'hotel') d.parent_brand = '';
    try {
      const out = await busy(f.querySelector('button.primary'), () => api('/api/leads', { method: 'POST', body: d }));
      submitted(out.lead, out.flagged);
    } catch (e) { showError(f, e.message); }
  });
}
function submitted(lead, flagged) {
  window.scrollTo(0, 0);
  $app.innerHTML = `
    <div class="card narrow success">
      <div class="big">✅</div>
      <h1>Lead submitted</h1>
      <p class="muted" style="margin-top:8px"><b>${esc(lead.name)}</b> · ${esc(typeLabel(lead.entity_type))}${place(lead) ? ' · ' + esc(place(lead)) : ''}</p>
      <div class="stamp">Time-stamped ${esc(when(lead.created_at))}</div>
      <p>Status: ${statusPill(lead.status)}</p>
      ${flagged ? `<p class="small" style="color:var(--warn);margin-top:10px">It looks similar to something already in the system, so our team will review it. Your timestamp is saved either way.</p>` : `<p class="small muted" style="margin-top:10px">Our team will review it. You can start tracking your outreach now.</p>`}
      <div class="row" style="justify-content:center;margin-top:14px"><a class="btn" href="#/lead/${lead.id}">Open lead</a><a class="btn primary" href="#/submit" id="again">Submit another</a></div>
    </div>`;
  $app.querySelector('#again').onclick = (e) => { e.preventDefault(); submit(); };
}

// ---------- referrer: check availability ----------
function check() {
  $app.innerHTML = `
    <div class="medium">
      <div class="pagehead"><div><h1>Check availability</h1><p>See whether a hotel, group, platform, association or DMO is already claimed before you reach out. You'll only see if it's taken, never who submitted it.</p></div></div>
      <div class="card">
        <form id="f" class="row" style="align-items:stretch">
          <input type="search" name="q" placeholder="Hotel, brand or organization name" style="flex:1;min-width:200px" autocomplete="off" />
          <select name="country" style="width:auto"><option value="">All countries</option>${opts(Object.entries(COUNTRIES))}</select>
          <button class="btn primary">Search</button>
        </form>
        <div id="out" style="margin-top:14px"></div>
      </div>
    </div>`;
  const f = $app.querySelector('#f'), out = $app.querySelector('#out');
  f.q.focus();
  let timer;
  const run = async () => {
    const q = f.q.value.trim();
    if (q.length < 3) { out.innerHTML = '<p class="muted small">Type at least 3 letters.</p>'; return; }
    const { results } = await api(`/api/check?q=${encodeURIComponent(q)}&country=${f.country.value}`);
    out.innerHTML = results.length
      ? `<div class="claims taken" style="margin:0 0 10px"><b>${results.length} match${results.length > 1 ? 'es' : ''} already claimed</b></div>
         <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Type</th><th>Location</th><th>Status</th><th>Since</th></tr></thead><tbody>
         ${results.map((r) => `<tr${r.mine ? ` class="click" data-id="${r.lead_id}"` : ''}><td><b>${esc(r.name)}</b>${r.parent_brand ? `<div class="small muted">${esc(r.parent_brand)}</div>` : ''}</td><td>${esc(typeLabel(r.entity_type))}</td><td>${esc(place(r)) || '<span class="muted">—</span>'}</td><td>${r.mine ? '<span class="pill pink">Yours</span>' : `<span class="pill warn">${esc(r.claimed)}</span>`}</td><td class="nowrap">${esc(day(r.since + 'T12:00:00'))}</td></tr>`).join('')}
         </tbody></table></div>`
      : `<div class="claims free" style="margin:0">✓ Nothing matching "<b>${esc(q)}</b>" has been submitted. <a href="#/submit">Submit it now</a> to lock in your timestamp.</div>`;
    out.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => go(`#/lead/${tr.dataset.id}`)));
  };
  f.addEventListener('submit', (e) => { e.preventDefault(); run(); });
  f.q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 350); });
  f.country.addEventListener('change', run);
}

// ---------- referrer: my leads ----------
async function leads() {
  const { leads: all } = await api('/api/leads');
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  let type = params.get('type') || '', status = '', q = '';
  $app.innerHTML = `
    <div class="pagehead"><div><h1>My leads</h1><p>${all.length} submitted. Open one to update its pipeline.</p></div><a class="btn primary" href="#/submit">+ Submit a lead</a></div>
    <div class="card">
      <div class="row" style="margin-bottom:12px">
        <input type="search" id="q" placeholder="Search your leads" style="flex:1;min-width:180px" />
        <select id="type" style="width:auto"><option value="">All types</option>${opts(ENTITY_TYPES.map((t) => [t.id, t.label]), type)}</select>
        <select id="status" style="width:auto"><option value="">All statuses</option>${opts(Object.entries(LEAD_STATUSES).map(([k, v]) => [k, v.label]))}</select>
      </div>
      <div id="list"></div>
    </div>`;
  const draw = () => {
    const rows = all.filter((l) => (!type || l.entity_type === type) && (!status || l.status === status) && (!q || `${l.name} ${l.parent_brand || ''} ${l.city || ''} ${l.contact_name}`.toLowerCase().includes(q)));
    const stageCount = (l) => STAGES.filter((s) => l[`${s.id}_at`]).length;
    $app.querySelector('#list').innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Lead</th><th>Type</th><th>Submitted</th><th>Review</th><th>Pipeline</th><th>Outcome</th></tr></thead><tbody>
      ${rows.map((l) => `<tr class="click" data-id="${l.id}"><td><b>${esc(l.name)}</b><div class="small muted">${esc(place(l))}</div></td><td>${esc(typeLabel(l.entity_type))}</td><td class="nowrap small">${esc(when(l.created_at))}</td><td>${statusPill(l.status)}</td><td class="small">${stageCount(l)}/${STAGES.length} ${lastStage(l)}</td><td class="small">${esc(OUTCOMES[l.outcome])}</td></tr>`).join('')}
      </tbody></table></div>` : `<div class="empty">${all.length ? 'No leads match these filters.' : 'No leads yet.'}</div>`;
    $app.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => go(`#/lead/${tr.dataset.id}`)));
  };
  $app.querySelector('#q').oninput = (e) => { q = e.target.value.toLowerCase().trim(); draw(); };
  $app.querySelector('#type').onchange = (e) => { type = e.target.value; draw(); };
  $app.querySelector('#status').onchange = (e) => { status = e.target.value; draw(); };
  draw();
}
const lastStage = (l) => { const s = [...STAGES].reverse().find((x) => l[`${x.id}_at`]); return s ? `<span class="muted">· ${esc(s.label)}</span>` : ''; };

// ---------- referrer: one lead (CRM) ----------
async function lead(id) {
  const { lead: l, events } = await api(`/api/leads/${Number(id)}`);
  const locked = l.status === 'denied';
  $app.innerHTML = `
    <div class="pagehead"><div><a href="#/leads" class="small">← My leads</a><h1 style="margin-top:6px">${esc(l.name)}</h1><p>${esc(typeLabel(l.entity_type))}${place(l) ? ' · ' + esc(place(l)) : ''}</p></div><div>${statusPill(l.status)}</div></div>
    ${l.status === 'info_needed' ? `<form class="card" id="reply" style="border-color:var(--info);margin-bottom:16px"><h2 style="color:var(--info)">More info needed</h2><p>${esc(l.admin_message || 'Our team needs more information about this lead.')}</p><label class="f"><span>Your reply</span><textarea name="reply" required></textarea></label><div class="row end"><button class="btn primary">Send reply</button></div></form>` : ''}
    ${l.status === 'denied' ? `<div class="card" style="border-color:var(--bad);margin-bottom:16px"><h2 style="color:var(--bad)">Denied: ${esc(l.status_reason || '')}</h2>${l.admin_message ? `<p>${esc(l.admin_message)}</p>` : ''}<p class="muted small" style="margin:0">Questions? Contact the Covenant Creative team.</p></div>` : ''}
    <div class="cols">
      <div class="stack">
        <form class="card" id="pipe">
          <div class="spread" style="margin-bottom:6px"><h2 style="margin:0">Pipeline</h2>${locked ? '' : '<span class="small muted">Tick each step as it happens</span>'}</div>
          <ul class="stages">${STAGES.map((s) => `
            <li><input type="checkbox" name="${s.id}" id="st_${s.id}"${l[`${s.id}_at`] ? ' checked' : ''}${locked ? ' disabled' : ''} />
              <div style="flex:1"><label for="st_${s.id}"><b>${esc(s.label)}</b>${s.sub ? ` <span class="muted small">${esc(s.sub)}</span>` : ''}</label>
                ${l[`${s.id}_at`] ? `<div class="when">✓ ${esc(when(l[`${s.id}_at`]))}</div>` : ''}
                ${s.id === 'content_day' ? `<div class="extra"><label class="small muted">Content day date <input type="date" name="content_day_date" value="${esc(l.content_day_date || '')}"${locked ? ' disabled' : ''} style="max-width:200px;margin-top:4px" /></label></div>` : ''}
                ${s.id === 'upsell' ? `<div class="extra grid2"><label class="f" style="margin:0"><span class="small muted" style="font-weight:500">Upsell type</span><select name="upsell_type"${locked ? ' disabled' : ''}><option value="">—</option>${opts(UPSELL_TYPES, l.upsell_type)}</select></label><label class="f" style="margin:0"><span class="small muted" style="font-weight:500">Upsell notes</span><input type="text" name="upsell_notes" value="${esc(l.upsell_notes || '')}"${locked ? ' disabled' : ''} /></label></div>` : ''}
              </div></li>`).join('')}
          </ul>
          <div class="grid2" style="margin-top:12px">
            <label class="f"><span>Outcome</span><select name="outcome"${locked ? ' disabled' : ''}>${opts(Object.entries(OUTCOMES), l.outcome)}</select></label>
          </div>
          <label class="f"><span>Your notes</span><textarea name="referrer_notes"${locked ? ' disabled' : ''} placeholder="Private notes for your own follow-up">${esc(l.referrer_notes || '')}</textarea></label>
          ${locked ? '' : '<div class="row end"><button class="btn primary">Save changes</button></div>'}
        </form>
        <div class="card"><h2>History</h2><ul class="timeline">${events.map((e) => `<li><div>${esc(e.text)}</div><div class="at">${esc(e.who)} · ${esc(when(e.at))}</div></li>`).join('')}</ul></div>
      </div>
      <div class="stack">
        <div class="card">
          <h2>Details</h2>
          <div class="stamp" style="margin-top:0">Submitted ${esc(when(l.created_at))}</div>
          <dl class="dl">
            <dt>Type</dt><dd>${esc(typeLabel(l.entity_type))}</dd>
            ${l.parent_brand ? `<dt>Parent brand</dt><dd>${esc(l.parent_brand)}</dd>` : ''}
            ${place(l) ? `<dt>Location</dt><dd>${esc(place(l))}</dd>` : ''}
            ${l.website ? `<dt>Website</dt><dd>${esc(l.website)}</dd>` : ''}
            <dt>Contact</dt><dd>${esc(l.contact_name)}<div class="muted small">${esc(l.contact_title)}</div></dd>
            <dt>Email</dt><dd><a href="mailto:${esc(l.contact_email)}">${esc(l.contact_email)}</a></dd>
            <dt>Phone</dt><dd><a href="tel:${esc(l.contact_phone)}">${esc(l.contact_phone)}</a></dd>
            ${l.notes ? `<dt>Notes</dt><dd>${esc(l.notes)}</dd>` : ''}
          </dl>
        </div>
        <div class="card">
          <h2>Revenue</h2>
          <dl class="dl">${REVENUE_TYPES.map((r) => `<dt>${esc(r.label)}</dt><dd class="money">${money(l[r.id])}</dd>`).join('')}<dt><b>Total</b></dt><dd class="money"><b>${money(REVENUE_TYPES.reduce((a, r) => a + (l[r.id] || 0), 0))}</b></dd></dl>
          <p class="small muted" style="margin:10px 0 0">Amounts are added by our team as TikTok GO reports them (about 30 days after revenue is generated).</p>
        </div>
      </div>
    </div>`;
  const pipe = $app.querySelector('#pipe');
  pipe.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = formData(pipe);
    const body = { stages: Object.fromEntries(STAGES.map((s) => [s.id, !!pipe[s.id].checked])), outcome: d.outcome, content_day_date: d.content_day_date || '', upsell_type: d.upsell_type || '', upsell_notes: d.upsell_notes || '', referrer_notes: d.referrer_notes || '' };
    try { await busy(pipe.querySelector('button.primary'), () => api(`/api/leads/${l.id}`, { method: 'PATCH', body })); toast('Saved'); lead(id); } catch (e) { showError(pipe, e.message); }
  });
  const reply = $app.querySelector('#reply');
  if (reply) reply.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!reply.reply.value.trim()) return showError(reply, 'Write your reply first');
    try { await busy(reply.querySelector('button'), () => api(`/api/leads/${l.id}`, { method: 'PATCH', body: { reply: reply.reply.value } })); toast('Sent. Back in review.'); lead(id); } catch (e) { showError(reply, e.message); }
  });
}

// ---------- referrer: earnings ----------
async function earnings() {
  const [s, { leads: all }] = await Promise.all([api('/api/stats'), api('/api/leads')]);
  const rows = all.filter((l) => l.status !== 'denied').map((l) => ({ ...l, total: REVENUE_TYPES.reduce((a, r) => a + (l[r.id] || 0), 0) })).sort((a, b) => b.total - a.total || b.created_at.localeCompare(a.created_at));
  $app.innerHTML = `
    <div class="pagehead"><div><h1>Earnings</h1><p>Revenue tracked from your referrals. Payouts begin roughly 30 days after revenue is generated.</p></div></div>
    <div class="tiles">
      <div class="tile hero-tile"><div class="k">Total revenue generated</div><div class="v money">${money(s.revenueTotal)}</div></div>
      ${REVENUE_TYPES.map((r) => `<div class="tile"><div class="k">${esc(r.label)}</div><div class="v money">${money(s.revenue[r.id])}</div></div>`).join('')}
    </div>
    <div class="card" style="margin-top:16px">
      <div class="spread" style="margin-bottom:10px"><h2 style="margin:0">By property / entity</h2><span class="small muted">Click a row for the breakdown</span></div>
      ${rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Property / entity</th><th>Type</th>${REVENUE_TYPES.map((r) => `<th class="num">${esc(r.label.replace('TikTok GO ', '').replace(' & Incentives', ''))}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>
      ${rows.map((l) => `<tr class="click" data-id="${l.id}"><td><b>${esc(l.name)}</b><div class="small muted">${esc(place(l))}</div></td><td class="small">${esc(typeLabel(l.entity_type))}</td>${REVENUE_TYPES.map((r) => `<td class="num money">${l[r.id] ? money(l[r.id]) : '<span class="muted">—</span>'}</td>`).join('')}<td class="num money"><b>${money(l.total)}</b></td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="2">Total</td>${REVENUE_TYPES.map((r) => `<td class="num money">${money(s.revenue[r.id])}</td>`).join('')}<td class="num money">${money(s.revenueTotal)}</td></tr></tfoot></table></div>`
      : '<div class="empty">Submit leads to start tracking revenue.</div>'}
    </div>
    <p class="small muted" style="margin-top:12px">MVP preview: amounts are entered by the Covenant Creative team from TikTok GO reports. Automatic calculation is coming.</p>`;
  $app.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => go(`#/lead/${tr.dataset.id}`)));
}

function resources() {
  $app.innerHTML = `
    <div class="pagehead"><div><h1>Resources</h1><p>Sales tools for referral partners. <span class="pill info">Coming soon</span></p></div></div>
    <div class="soon">${RESOURCES.map((r) => `<div class="card"><span class="pill neutral">Coming soon</span><h3>${esc(r.title)}</h3><p class="muted" style="margin:0">${esc(r.text)}</p></div>`).join('')}</div>
    <div class="section" style="margin-top:28px"><h2 style="font-size:19px">In the meantime</h2><p class="sub" style="margin-bottom:12px">The program FAQ is on the <a href="#/" >home page</a>.</p></div>`;
}

// ---------- profile ----------
function profile() {
  $app.innerHTML = `
    <div class="narrow">
      <div class="pagehead"><div><h1>Profile</h1><p>${esc(me.email)} · ${me.role === 'admin' ? 'Admin' : 'Referral partner'}</p></div><button class="btn" id="out">Sign out</button></div>
      <form class="card" id="f">
        <h2>Your details</h2>
        <label class="f"><span>Full name</span><input type="text" name="name" value="${esc(me.name)}" /></label>
        <label class="f"><span>Phone number</span><input type="tel" name="phone" value="${esc(me.phone)}" /></label>
        <label class="f"><span>Company affiliation</span><input type="text" name="company" value="${esc(me.company)}" list="cos" /><datalist id="cos">${COMPANIES.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <div class="row end"><button class="btn primary">Save</button></div>
      </form>
      <form class="card" id="pw">
        <h2>Change password</h2>
        <label class="f"><span>Current password</span><input type="password" name="current" autocomplete="current-password" /></label>
        <label class="f"><span>New password</span><input type="password" name="password" autocomplete="new-password" minlength="8" /></label>
        <div class="row end"><button class="btn">Change password</button></div>
      </form>
    </div>`;
  $app.querySelector('#out').onclick = signOut;
  const f = $app.querySelector('#f');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try { me = (await busy(f.querySelector('button'), () => api('/api/me', { method: 'POST', body: formData(f) }))).user; toast('Saved'); renderChrome('profile'); } catch (e) { showError(f, e.message); }
  });
  const pw = $app.querySelector('#pw');
  pw.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try { await busy(pw.querySelector('button'), () => api('/api/me/password', { method: 'POST', body: formData(pw) })); pw.reset(); toast('Password changed'); } catch (e) { showError(pw, e.message); }
  });
}

// ---------- admin ----------
async function admin(sub, id) {
  if (sub === 'lead') return adminLead(id);
  const s = await api('/api/admin/summary');
  adminBadge = s.pendingUsers + s.newLeads;
  const tab = sub === 'partners' ? 'partners' : 'leads';
  $app.innerHTML = `
    <div class="pagehead"><div><h1>Admin review</h1><p>Approve partners, review leads and resolve conflicts.</p></div><a class="btn" href="/api/admin/export.csv">Export all leads (CSV)</a></div>
    <div class="tiles">
      <a class="tile${s.newLeads ? ' hl' : ''}" href="#/admin/leads?f=new"><div class="k">New since last look</div><div class="v">${s.newLeads}</div></a>
      <a class="tile" href="#/admin/leads?f=pending"><div class="k">Pending review</div><div class="v">${s.pendingLeads}</div></a>
      <a class="tile${s.flagged ? ' hl' : ''}" href="#/admin/leads?f=flagged"><div class="k">Flagged conflicts</div><div class="v">${s.flagged}</div></a>
      <a class="tile${s.pendingUsers ? ' hl' : ''}" href="#/admin/partners?f=pending"><div class="k">Partners to approve</div><div class="v">${s.pendingUsers}</div></a>
      <a class="tile" href="#/admin/partners"><div class="k">Approved partners</div><div class="v">${s.partners}</div></a>
      <div class="tile"><div class="k">All leads</div><div class="v">${s.stats.total}</div></div>
    </div>
    <div class="chips" style="margin:18px 0 12px">
      <a class="chip${tab === 'leads' ? ' on' : ''}" href="#/admin/leads">Leads</a>
      <a class="chip${tab === 'partners' ? ' on' : ''}" href="#/admin/partners">Partners${s.pendingUsers ? ` <span class="badge">${s.pendingUsers}</span>` : ''}</a>
    </div>
    <div id="pane"></div>`;
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  if (tab === 'partners') return adminPartners(params.get('f') || '');
  return adminLeads(params.get('f') || (s.newLeads ? 'new' : 'pending'), params.get('user') || '');
}

async function adminLeads(filter, user) {
  const pane = $app.querySelector('#pane');
  const FILTERS = [['new', 'New'], ['flagged', 'Flagged'], ['pending', 'Pending Review'], ['info_needed', 'Further Info Needed'], ['accepted', 'Accepted'], ['denied', 'Denied'], ['', 'All']];
  pane.innerHTML = `<div class="card">
    <div class="spread" style="margin-bottom:12px">
      <div class="chips" id="fl">${FILTERS.map(([k, l]) => `<button class="chip${k === filter ? ' on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
      <div class="row"><input type="search" id="q" placeholder="Search leads" style="width:200px" /><button class="btn sm ghost" id="seen">Mark all as seen</button></div>
    </div>
    ${user ? `<p class="small">Showing one partner's leads. <a href="#/admin/leads">Show everyone's</a></p>` : ''}
    <div id="rows"><div class="loading">Loading…</div></div></div>`;
  let q = '';
  const load = async () => {
    const { leads: rows } = await api(`/api/admin/leads?status=${filter}&q=${encodeURIComponent(q)}${user ? `&user=${user}` : ''}`);
    pane.querySelector('#rows').innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Submitted</th><th>Lead</th><th>Type</th><th>Contact</th><th>Referrer</th><th>Status</th></tr></thead><tbody>
      ${rows.map((l) => `<tr class="click" data-id="${l.id}"><td class="small nowrap">${esc(when(l.created_at))}${l.admin_seen ? '' : ' <span class="pill new">New</span>'}</td>
        <td><b>${esc(l.name)}</b>${l.conflict ? ' <span class="pill warn" title="Possible duplicate">⚑ Conflict</span>' : ''}<div class="small muted">${esc(place(l))}${l.parent_brand ? ` · ${esc(l.parent_brand)}` : ''}</div></td>
        <td class="small">${esc(typeLabel(l.entity_type))}</td>
        <td class="small">${esc(l.contact_name)}<div class="muted">${esc(l.contact_title)}</div></td>
        <td class="small">${esc(l.referrer_name)}<div class="muted">${esc(l.referrer_company)}</div></td>
        <td>${statusPill(l.status)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nothing here.</div>';
    pane.querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => go(`#/admin/lead/${tr.dataset.id}`)));
  };
  pane.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { filter = b.dataset.f; pane.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('on', x === b)); load(); }));
  let t; pane.querySelector('#q').oninput = (e) => { q = e.target.value; clearTimeout(t); t = setTimeout(load, 300); };
  pane.querySelector('#seen').onclick = async () => { await api('/api/admin/leads/seen-all', { method: 'POST' }); toast('All marked as seen'); admin('leads'); };
  await load();
}

async function adminPartners(filter) {
  const pane = $app.querySelector('#pane');
  const { users } = await api('/api/admin/users');
  const rows = filter ? users.filter((u) => u.status === filter) : users;
  const uPill = (s) => `<span class="pill ${{ pending: 'warn', approved: 'ok', denied: 'bad' }[s]}">${{ pending: 'Waiting for approval', approved: 'Approved', denied: 'Denied' }[s]}</span>`;
  pane.innerHTML = `<div class="card">
    <div class="chips" style="margin-bottom:12px">${[['pending', 'Waiting'], ['approved', 'Approved'], ['denied', 'Denied'], ['', 'All']].map(([k, l]) => `<a class="chip${k === filter ? ' on' : ''}" href="#/admin/partners${k ? `?f=${k}` : ''}">${l}</a>`).join('')}</div>
    ${rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Company</th><th>Contact</th><th>Applied</th><th>Leads</th><th>Status</th><th></th></tr></thead><tbody>
    ${rows.map((u) => `<tr data-id="${u.id}"><td><b>${esc(u.name)}</b>${u.role === 'admin' ? ' <span class="pill pink">Admin</span>' : ''}</td><td class="small">${esc(u.company)}</td>
      <td class="small"><a href="mailto:${esc(u.email)}">${esc(u.email)}</a><div class="muted">${esc(u.phone)}</div></td>
      <td class="small nowrap">${esc(when(u.created_at))}</td><td>${u.leads ? `<a href="#/admin/leads?f=&user=${u.id}">${u.leads}</a>` : '0'}</td><td>${uPill(u.status)}</td>
      <td class="nowrap"><div class="row" style="gap:6px;flex-wrap:nowrap">
        ${u.id === me.id ? '<span class="small muted">You</span>' : `
        ${u.status !== 'approved' ? `<button class="btn sm ok" data-act="approved">Approve</button>` : ''}
        ${u.status !== 'denied' ? `<button class="btn sm bad" data-act="denied">${u.status === 'pending' ? 'Deny' : 'Remove access'}</button>` : ''}
        <select class="more" style="width:auto;min-height:32px;padding:4px 8px;font-size:13px"><option value="">More…</option>${u.role === 'admin' ? '<option value="referrer">Make referrer</option>' : '<option value="admin">Make admin</option>'}<option value="reset">Reset password</option></select>`}
      </div></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No one here.</div>'}
  </div>`;
  pane.querySelectorAll('tr[data-id]').forEach((tr) => {
    const id = tr.dataset.id;
    tr.querySelectorAll('[data-act]').forEach((b) => (b.onclick = async () => {
      try { await api(`/api/admin/users/${id}`, { method: 'POST', body: { status: b.dataset.act } }); toast(b.dataset.act === 'approved' ? 'Approved' : 'Access removed'); admin('partners'); } catch (e) { toast(e.message); }
    }));
    const more = tr.querySelector('.more');
    if (more) more.onchange = async () => {
      const v = more.value; more.value = '';
      try {
        if (v === 'reset') {
          if (!confirm('Reset this partner’s password? They will be signed out.')) return;
          const r = await api(`/api/admin/users/${id}`, { method: 'POST', body: { resetPassword: true } });
          prompt('Temporary password. Send it to them privately; they can change it under Profile.', r.tempPassword);
        } else if (v) {
          await api(`/api/admin/users/${id}`, { method: 'POST', body: { role: v } }); toast('Role changed'); admin('partners');
        }
      } catch (e) { toast(e.message); }
    };
  });
}

async function adminLead(id) {
  const { lead: l } = await api(`/api/admin/leads/${Number(id)}`);
  const person = (x) => `${esc(x.contact_name)} · <span class="muted">${esc(x.contact_title)}</span>`;
  $app.innerHTML = `
    <div class="pagehead"><div><a href="#/admin/leads" class="small">← Admin review</a><h1 style="margin-top:6px">${esc(l.name)}</h1><p>${esc(typeLabel(l.entity_type))}${place(l) ? ' · ' + esc(place(l)) : ''}</p></div><div class="row">${l.conflict ? '<span class="pill warn">⚑ Conflict</span>' : ''}${statusPill(l.status)}</div></div>
    ${l.conflicts.length ? `<div class="conflict" style="margin-bottom:16px"><h3>⚑ Possible duplicate${l.conflict ? '' : ' (marked resolved)'}</h3>
      ${l.conflicts.map((c) => `<div style="margin-top:10px"><div class="small"><b>${esc(c.reason)}</b></div>
        <div class="compare">
          <div class="${c.lead.created_at < l.created_at ? 'first' : ''}"><div class="small muted">${c.lead.created_at < l.created_at ? 'Earlier submission' : 'Other submission'} · ${statusPill(c.lead.status)}</div>
            <div class="t" style="margin:4px 0"><a href="#/admin/lead/${c.lead.id}">${esc(c.lead.name)}</a></div><div class="small">${esc(typeLabel(c.lead.entity_type))}${place(c.lead) ? ' · ' + esc(place(c.lead)) : ''}</div>
            <div class="small" style="margin-top:6px"><b>${esc(when(c.lead.created_at))}</b></div><div class="small">Contact: ${person(c.lead)}</div><div class="small">Referrer: ${esc(c.lead.referrer?.name)} (${esc(c.lead.referrer?.company)})</div></div>
          <div class="${c.lead.created_at > l.created_at ? 'first' : ''}"><div class="small muted">This submission</div>
            <div class="t" style="margin:4px 0">${esc(l.name)}</div><div class="small">${esc(typeLabel(l.entity_type))}${place(l) ? ' · ' + esc(place(l)) : ''}</div>
            <div class="small" style="margin-top:6px"><b>${esc(when(l.created_at))}</b></div><div class="small">Contact: ${person(l)}</div><div class="small">Referrer: ${esc(l.referrer.name)} (${esc(l.referrer.company)})</div></div>
        </div></div>`).join('')}
      ${l.conflict ? '<div class="row end" style="margin-top:10px"><button class="btn sm" id="resolve">Mark conflict resolved</button></div>' : ''}
    </div>` : ''}
    ${l.later.length ? `<div class="card" style="margin-bottom:16px"><h3 style="margin-bottom:6px">Later submissions that collide with this one</h3><ul class="list">${l.later.map((x) => `<li><a href="#/admin/lead/${x.id}">${esc(x.name)}</a> · <span class="small muted">${esc(when(x.created_at))}</span> ${statusPill(x.status)}</li>`).join('')}</ul></div>` : ''}
    <div class="cols">
      <div class="stack">
        <form class="card" id="st">
          <h2>Review</h2>
          <div class="chips" id="pick">${Object.entries(LEAD_STATUSES).map(([k, v]) => `<button type="button" class="chip${k === l.status ? ' on' : ''}" data-s="${k}">${esc(v.label)}</button>`).join('')}</div>
          <input type="hidden" name="status" value="${esc(l.status)}" />
          <div id="denyWrap" hidden style="margin-top:14px"><label class="f"><span>Reason <span class="req">*</span></span><select name="reason"><option value="">Choose…</option>${opts(DENY_REASONS, l.status_reason)}<option value="__other">Other…</option></select></label><label class="f" id="reasonOther" hidden><span>Other reason</span><input type="text" name="reason_other" /></label></div>
          <label class="f" style="margin-top:14px"><span id="noteLbl">Message to the partner <span class="opt">(optional)</span></span><textarea name="note" placeholder="Shown to the referrer">${esc(l.admin_note || '')}</textarea></label>
          <div class="row end"><button class="btn primary">Save review</button></div>
          ${l.reviewed_at ? `<p class="small muted" style="margin:10px 0 0">Last reviewed by ${esc(l.reviewed_by)} · ${esc(when(l.reviewed_at))}</p>` : ''}
        </form>
        <form class="card" id="rev">
          <h2>Revenue <span class="small muted" style="font-weight:500">(shown on the partner's Earnings page)</span></h2>
          <div class="grid3">${REVENUE_TYPES.map((r) => `<label class="f"><span class="small">${esc(r.label)}</span><input type="number" min="0" step="0.01" name="${r.id}" value="${l[r.id] || ''}" placeholder="0.00" /></label>`).join('')}</div>
          <div class="row end"><button class="btn">Save revenue</button></div>
        </form>
        <div class="card"><h2>History</h2>
          <ul class="timeline">${l.events.map((e) => `<li class="${e.internal ? 'internal' : ''}"><div>${e.internal ? '<span class="pill warn" style="font-size:11px">Admins only</span> ' : ''}${esc(e.text)}</div><div class="at">${esc(e.who)} · ${esc(when(e.at))}</div></li>`).join('')}</ul>
          <form id="inote" class="row" style="margin-top:12px"><input type="text" name="internal_note" placeholder="Add an internal note (admins only)" style="flex:1" /><button class="btn sm">Add</button></form>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <h2>Lead details</h2>
          <div class="stamp" style="margin-top:0">Submitted ${esc(when(l.created_at))}</div>
          <dl class="dl">
            <dt>Type</dt><dd>${esc(typeLabel(l.entity_type))}</dd>
            ${l.parent_brand ? `<dt>Parent brand</dt><dd>${esc(l.parent_brand)}</dd>` : ''}
            <dt>Location</dt><dd>${esc(place(l)) || '<span class="muted">Not given</span>'}</dd>
            ${l.website ? `<dt>Website</dt><dd>${esc(l.website)}</dd>` : ''}
            <dt>Contact</dt><dd>${esc(l.contact_name)}<div class="muted small">${esc(l.contact_title)}</div></dd>
            <dt>Email</dt><dd><a href="mailto:${esc(l.contact_email)}">${esc(l.contact_email)}</a></dd>
            <dt>Phone</dt><dd>${esc(l.contact_phone)}</dd>
            ${l.notes ? `<dt>Notes</dt><dd>${esc(l.notes)}</dd>` : ''}
          </dl>
        </div>
        <div class="card">
          <h2>Referrer</h2>
          <dl class="dl"><dt>Name</dt><dd>${esc(l.referrer.name)}</dd><dt>Company</dt><dd>${esc(l.referrer.company)}</dd><dt>Email</dt><dd><a href="mailto:${esc(l.referrer.email)}">${esc(l.referrer.email)}</a></dd><dt>Phone</dt><dd>${esc(l.referrer.phone)}</dd></dl>
          <p style="margin:10px 0 0"><a class="small" href="#/admin/leads?f=&user=${l.referrer.id}">All leads from this partner →</a></p>
        </div>
        <div class="card">
          <h2>Partner's pipeline</h2>
          <ul class="stages">${STAGES.map((s) => `<li><input type="checkbox" disabled${l[`${s.id}_at`] ? ' checked' : ''} /><div><b>${esc(s.label)}</b>${l[`${s.id}_at`] ? `<div class="when">${esc(when(l[`${s.id}_at`]))}</div>` : ''}${s.id === 'content_day' && l.content_day_date ? `<div class="small">Date: ${esc(l.content_day_date)}</div>` : ''}${s.id === 'upsell' && (l.upsell_type || l.upsell_notes) ? `<div class="small">${esc([l.upsell_type, l.upsell_notes].filter(Boolean).join(': '))}</div>` : ''}</div></li>`).join('')}</ul>
          <p class="small" style="margin:8px 0 0">Outcome: <b>${esc(OUTCOMES[l.outcome])}</b></p>
        </div>
      </div>
    </div>`;
  const st = $app.querySelector('#st');
  const setPick = (s) => {
    st.status.value = s;
    st.querySelectorAll('[data-s]').forEach((b) => b.classList.toggle('on', b.dataset.s === s));
    st.querySelector('#denyWrap').hidden = s !== 'denied';
    st.querySelector('#noteLbl').innerHTML = s === 'info_needed' ? 'What info do you need? <span class="req">*</span>' : 'Message to the partner <span class="opt">(optional)</span>';
  };
  st.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => setPick(b.dataset.s)));
  st.reason.onchange = () => { st.querySelector('#reasonOther').hidden = st.reason.value !== '__other'; };
  setPick(l.status);
  st.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = formData(st);
    const reason = d.reason === '__other' ? d.reason_other : d.reason;
    try {
      await busy(st.querySelector('button.primary'), () => api(`/api/admin/leads/${l.id}`, { method: 'POST', body: { status: d.status, reason, note: d.note } }));
      toast('Review saved'); adminLead(id);
    } catch (e) { showError(st, e.message); }
  });
  const rev = $app.querySelector('#rev');
  rev.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try { await busy(rev.querySelector('button'), () => api(`/api/admin/leads/${l.id}`, { method: 'POST', body: formData(rev) })); toast('Revenue saved'); adminLead(id); } catch (e) { showError(rev, e.message); }
  });
  const inote = $app.querySelector('#inote');
  inote.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!inote.internal_note.value.trim()) return;
    await api(`/api/admin/leads/${l.id}`, { method: 'POST', body: { internal_note: inote.internal_note.value } });
    adminLead(id);
  });
  const resolve = $app.querySelector('#resolve');
  if (resolve) resolve.onclick = async () => { await api(`/api/admin/leads/${l.id}`, { method: 'POST', body: { clear_conflict: true } }); toast('Marked resolved'); adminLead(id); };
}

const VIEWS = {
  '': landing, login, apply, pending, dashboard, submit, check, leads, lead, earnings, resources, profile,
  admin,
};
route();
