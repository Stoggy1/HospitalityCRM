// CovenantGO Referral Partners: server + built-in database.
// Run:  node server.mjs   then open http://localhost:5200
// No installs needed (uses Node's built-in SQLite, Node 22.13+). Data lives in ./data/.
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ENTITY_TYPES, entityType, locationRule, LEAD_STATUSES, STAGES, OUTCOMES, REVENUE_TYPES,
  COUNTRIES, REGIONS, nameKey, domainOf, isFreeMail, isEmail, isPhone,
} from './public/shared.js';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, 'public');
const dataDir = process.env.DATA_DIR || join(here, 'data');
mkdirSync(dataDir, { recursive: true });
const PORT = Number(process.env.PORT) || 5200;
const HOST = process.env.HOST || '127.0.0.1';
const SECURE_COOKIE = process.env.SECURE_COOKIE === '1';
// Emails listed here become admins (already approved) when they register.
const ADMIN_EMAILS = String(process.env.ADMIN_EMAILS || '').toLowerCase().split(/[,\s]+/).filter(Boolean);

// `--demo` uses a separate database filled by tools/seed-demo.mjs, so demo data never mixes with real partners.
export const DEMO = process.argv.includes('--demo');
const dbFile = process.env.DB_FILE || join(dataDir, DEMO ? 'demo.db' : 'referrals.db');
export const db = new DatabaseSync(dbFile);
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  company TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'referrer',          -- referrer | admin
  status TEXT NOT NULL DEFAULT 'pending',         -- pending | approved | denied
  pass_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_at TEXT, reviewed_by TEXT,
  last_login_at TEXT,
  admin_seen INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  entity_type TEXT NOT NULL,
  name TEXT NOT NULL, name_key TEXT NOT NULL,
  parent_brand TEXT, parent_key TEXT,
  city TEXT, state TEXT, country TEXT,
  website TEXT, domain TEXT,
  contact_name TEXT NOT NULL, contact_title TEXT NOT NULL,
  contact_email TEXT NOT NULL, contact_phone TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,                       -- timestamp of submission (UTC, ms)
  status TEXT NOT NULL DEFAULT 'pending',
  status_reason TEXT, admin_note TEXT,
  reviewed_at TEXT, reviewed_by TEXT,
  admin_seen INTEGER NOT NULL DEFAULT 0,
  conflict INTEGER NOT NULL DEFAULT 0,
  conflicts TEXT NOT NULL DEFAULT '[]',           -- [{id, reason}]
  contacted_at TEXT, meeting_at TEXT, contract_at TEXT, content_day_at TEXT, upsell_at TEXT,
  content_day_date TEXT, upsell_type TEXT, upsell_notes TEXT,
  outcome TEXT NOT NULL DEFAULT 'active',
  referrer_notes TEXT,
  rev_commission REAL NOT NULL DEFAULT 0,
  rev_bonus REAL NOT NULL DEFAULT 0,
  rev_upsell REAL NOT NULL DEFAULT 0,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS leads_name ON leads(name_key);
CREATE INDEX IF NOT EXISTS leads_parent ON leads(parent_key);
CREATE INDEX IF NOT EXISTS leads_user ON leads(user_id);
CREATE TABLE IF NOT EXISTS lead_events (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  at TEXT NOT NULL, who TEXT NOT NULL, text TEXT NOT NULL,
  internal INTEGER NOT NULL DEFAULT 0             -- 1 = admins only
);
`);

export const now = () => new Date().toISOString();
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };
const clean = (v, max = 300) => String(v ?? '').trim().slice(0, max);

// ---------- passwords & sessions ----------
export function hashPassword(pw, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(String(pw), salt, 32).toString('hex')}`;
}
function checkPassword(pw, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex'), b = scryptSync(String(pw), salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}
const SESSION_DAYS = 60;
const cookieToken = (req) => (req.headers.cookie || '').split(/;\s*/).map((c) => c.split('=')).find(([k]) => k === 'rp_session')?.[1] || '';
function sessionUser(req) {
  const t = cookieToken(req);
  if (!t) return null;
  const row = db.prepare('SELECT u.*, s.created_at AS s_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(t);
  if (!row) return null;
  if (Date.now() - Date.parse(row.s_at) > SESSION_DAYS * 864e5) { db.prepare('DELETE FROM sessions WHERE token = ?').run(t); return null; }
  return row;
}
function startSession(res, userId) {
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(token, user_id, created_at) VALUES (?, ?, ?)').run(token, userId, now());
  res.setHeader('Set-Cookie', `rp_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${SECURE_COOKIE ? '; Secure' : ''}`);
}
const failedLogins = new Map(); // ip|email -> { n, until }

const publicUser = (u) => u && ({ id: u.id, name: u.name, email: u.email, phone: u.phone, company: u.company, role: u.role, status: u.status, created_at: u.created_at });

// ---------- leads ----------
function validateLead(b) {
  const t = entityType(b.entity_type);
  if (!t) fail(400, 'Choose an entity type');
  const lead = {
    entity_type: t.id,
    name: clean(b.name, 160),
    parent_brand: clean(b.parent_brand, 120),
    city: clean(b.city, 100),
    state: clean(b.state, 100),
    country: clean(b.country, 2).toUpperCase(),
    website: clean(b.website, 200),
    contact_name: clean(b.contact_name, 120),
    contact_title: clean(b.contact_title, 120),
    contact_email: clean(b.contact_email, 160).toLowerCase(),
    contact_phone: clean(b.contact_phone, 40),
    notes: clean(b.notes, 2000),
  };
  if (!lead.name) fail(400, 'Enter the property / entity name');
  const rule = locationRule(t.id);
  if (lead.country && !COUNTRIES[lead.country]) fail(400, 'Country must be the United States, Mexico or Canada');
  if (lead.state && lead.country && !REGIONS[lead.country].includes(lead.state)) fail(400, 'Choose a state / province from the list');
  if (rule === 'required' && !(lead.city && lead.state && lead.country)) fail(400, 'City, state and country are required for this type');
  if (rule === 'state' && !(lead.state && lead.country)) fail(400, 'State and country are required for this type');
  if (!lead.contact_name) fail(400, "Enter the contact person's name");
  if (!lead.contact_title) fail(400, "Enter the contact's title / position");
  if (!isEmail(lead.contact_email)) fail(400, 'Enter a valid business email');
  if (!isPhone(lead.contact_phone)) fail(400, 'Enter a valid business phone number');
  return lead;
}

const sameLocation = (a, b) => {
  const ka = nameKey(a.city), kb = nameKey(b.city);
  if (ka && kb && ka !== kb) return false;
  if (a.state && b.state && a.state !== b.state) return false;
  if (a.country && b.country && a.country !== b.country) return false;
  return true;
};

// Finds earlier, non-denied submissions this lead may collide with.
function findConflicts(lead, excludeId = 0) {
  const out = new Map();
  const add = (row, reason) => { if (row.id !== excludeId && !out.has(row.id)) out.set(row.id, { id: row.id, reason, user_id: row.user_id }); };
  const live = "status != 'denied'";
  // 1. Same name (normalized) in the same place
  for (const r of db.prepare(`SELECT * FROM leads WHERE name_key = ? AND ${live}`).all(lead.name_key)) {
    if (sameLocation(r, lead)) add(r, `Same name as "${r.name}" (${entityType(r.entity_type).label})`);
  }
  // 2. Property under a Hospitality Group already submitted (or a group that matches its brand)
  if (lead.parent_key) {
    for (const r of db.prepare(`SELECT * FROM leads WHERE entity_type = 'group' AND name_key = ? AND ${live}`).all(lead.parent_key)) {
      add(r, `Falls under Hospitality Group "${r.name}"`);
    }
  }
  // 3. A group whose properties were already submitted
  if (lead.entity_type === 'group') {
    const kids = db.prepare(`SELECT * FROM leads WHERE parent_key = ? AND entity_type != 'group' AND ${live} ORDER BY created_at`).all(lead.name_key);
    for (const r of kids) add(r, `Property "${r.name}" under this group was already submitted`);
  }
  // 4. Same website or same contact email
  if (lead.domain) {
    for (const r of db.prepare(`SELECT * FROM leads WHERE domain = ? AND ${live}`).all(lead.domain)) {
      if (sameLocation(r, lead) || r.entity_type !== 'hotel') add(r, `Same website (${lead.domain}) as "${r.name}"`);
    }
  }
  for (const r of db.prepare(`SELECT * FROM leads WHERE contact_email = ? AND ${live}`).all(lead.contact_email)) {
    add(r, `Same contact email as "${r.name}"`);
  }
  return [...out.values()];
}

export function event(leadId, who, text, internal = 0) {
  db.prepare('INSERT INTO lead_events(lead_id, at, who, text, internal) VALUES (?, ?, ?, ?, ?)').run(leadId, now(), who, text, internal);
}

export function createLead(user, body) {
  const lead = validateLead(body);
  lead.name_key = nameKey(lead.name);
  lead.parent_key = nameKey(lead.parent_brand) || null;
  lead.domain = domainOf(lead.website) || '';
  if (!lead.name_key) fail(400, 'Enter the property / entity name');
  const conflicts = findConflicts(lead);
  const mine = conflicts.find((c) => c.user_id === user.id && c.reason.startsWith('Same name'));
  if (mine) fail(409, 'You already submitted this one. Open My Leads to see it.');
  const stored = conflicts.map(({ id, reason }) => ({ id, reason }));
  const created_at = now();
  const r = db.prepare(`INSERT INTO leads (user_id, entity_type, name, name_key, parent_brand, parent_key, city, state, country, website, domain,
      contact_name, contact_title, contact_email, contact_phone, notes, created_at, conflict, conflicts, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    user.id, lead.entity_type, lead.name, lead.name_key, lead.parent_brand || null, lead.parent_key, lead.city || null, lead.state || null, lead.country || null,
    lead.website || null, lead.domain || null, lead.contact_name, lead.contact_title, lead.contact_email, lead.contact_phone, lead.notes || null,
    created_at, stored.length ? 1 : 0, JSON.stringify(stored), created_at);
  const id = Number(r.lastInsertRowid);
  event(id, user.name, 'Submitted. Status: Pending Review');
  if (stored.length) event(id, 'System', `Flagged for review: ${stored.map((c) => c.reason).join('; ')}`, 1);
  return { lead: getLead(id), flagged: stored.length > 0 };
}

const LEAD_COLS_REFERRER = ['id', 'entity_type', 'name', 'parent_brand', 'city', 'state', 'country', 'website', 'contact_name', 'contact_title', 'contact_email', 'contact_phone', 'notes',
  'created_at', 'status', 'status_reason', 'reviewed_at', 'contacted_at', 'meeting_at', 'contract_at', 'content_day_at', 'upsell_at', 'content_day_date', 'upsell_type', 'upsell_notes',
  'outcome', 'referrer_notes', 'rev_commission', 'rev_bonus', 'rev_upsell', 'updated_at'];
export function getLead(id) { return db.prepare('SELECT * FROM leads WHERE id = ?').get(id); }
function forReferrer(l) {
  const o = {};
  for (const k of LEAD_COLS_REFERRER) o[k] = l[k];
  // Referrers see the admin's reason only for denied / info-needed, never conflict details.
  if (l.status === 'info_needed' || l.status === 'denied') o.admin_message = l.admin_note || '';
  return o;
}

export function updatePipeline(user, lead, b) {
  if (lead.status === 'denied') fail(400, 'This lead was denied, so it can no longer be updated.');
  const sets = {}, notes = [];
  for (const s of STAGES) {
    if (!(s.id in (b.stages || {}))) continue;
    const col = `${s.id}_at`;
    const on = !!b.stages[s.id];
    if (on && !lead[col]) { sets[col] = now(); notes.push(`checked "${s.label}"`); }
    if (!on && lead[col]) { sets[col] = null; notes.push(`unchecked "${s.label}"`); }
  }
  if ('content_day_date' in b) sets.content_day_date = clean(b.content_day_date, 10) || null;
  if ('upsell_type' in b) sets.upsell_type = clean(b.upsell_type, 60) || null;
  if ('upsell_notes' in b) sets.upsell_notes = clean(b.upsell_notes, 1000) || null;
  if ('referrer_notes' in b) sets.referrer_notes = clean(b.referrer_notes, 4000) || null;
  if ('outcome' in b) {
    if (!OUTCOMES[b.outcome]) fail(400, 'Unknown outcome');
    if (b.outcome !== lead.outcome) { sets.outcome = b.outcome; notes.push(`set outcome to ${OUTCOMES[b.outcome]}`); }
  }
  if ('contact_title' in b && clean(b.contact_title, 120)) sets.contact_title = clean(b.contact_title, 120);
  if (!Object.keys(sets).length) return getLead(lead.id);
  sets.updated_at = now();
  const keys = Object.keys(sets);
  db.prepare(`UPDATE leads SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => sets[k]), lead.id);
  if (notes.length) event(lead.id, user.name, notes.join(', ').replace(/^./, (c) => c.toUpperCase()));
  if (lead.status === 'info_needed' && b.reply) {
    db.prepare("UPDATE leads SET status = 'pending', admin_seen = 0 WHERE id = ?").run(lead.id);
    event(lead.id, user.name, `Replied with more info: ${clean(b.reply, 1000)}. Back to Pending Review`);
  }
  return getLead(lead.id);
}

function stats(userId) {
  const where = userId ? 'WHERE user_id = ?' : '';
  const args = userId ? [userId] : [];
  const rows = db.prepare(`SELECT * FROM leads ${where} ORDER BY created_at DESC`).all(...args);
  const byType = Object.fromEntries(ENTITY_TYPES.map((t) => [t.id, 0]));
  const byStatus = Object.fromEntries(Object.keys(LEAD_STATUSES).map((s) => [s, 0]));
  const byStage = Object.fromEntries(STAGES.map((s) => [s.id, 0]));
  const revenue = Object.fromEntries(REVENUE_TYPES.map((r) => [r.id, 0]));
  for (const l of rows) {
    byType[l.entity_type]++;
    byStatus[l.status]++;
    for (const s of STAGES) if (l[`${s.id}_at`]) byStage[s.id]++;
    for (const r of REVENUE_TYPES) revenue[r.id] += l[r.id] || 0;
  }
  return { total: rows.length, byType, byStatus, byStage, revenue, revenueTotal: Object.values(revenue).reduce((a, b) => a + b, 0) };
}

// Public "is it taken?" search. Shows taken status only: no referrer, no contacts.
function claimSearch(user, q, country) {
  const key = nameKey(q);
  if (key.length < 3) return [];
  const words = key.split(' ');
  const like = words.map(() => "(' ' || name_key || ' ' || coalesce(parent_key, '') || ' ') LIKE ?");
  const args = words.map((w) => `% ${w}%`);
  let sql = `SELECT id, user_id, entity_type, name, parent_brand, city, state, country, status, created_at FROM leads WHERE status != 'denied' AND ${like.join(' AND ')}`;
  if (country) { sql += ' AND (country = ? OR country IS NULL)'; args.push(country); }
  sql += ' ORDER BY created_at LIMIT 25';
  return db.prepare(sql).all(...args).map((r) => ({
    entity_type: r.entity_type, name: r.name, parent_brand: r.parent_brand, city: r.city, state: r.state, country: r.country,
    claimed: r.status === 'accepted' ? 'Claimed' : 'Claimed, under review',
    mine: r.user_id === user.id, lead_id: r.user_id === user.id ? r.id : undefined,
    since: r.created_at.slice(0, 10),
  }));
}

function adminLeadView(l) {
  const u = db.prepare('SELECT id, name, email, phone, company FROM users WHERE id = ?').get(l.user_id);
  const conflicts = JSON.parse(l.conflicts || '[]').map((c) => {
    const o = getLead(c.id);
    if (!o) return null;
    const ou = db.prepare('SELECT name, company, email FROM users WHERE id = ?').get(o.user_id);
    return { ...c, lead: { id: o.id, name: o.name, entity_type: o.entity_type, city: o.city, state: o.state, country: o.country, parent_brand: o.parent_brand,
      contact_name: o.contact_name, contact_title: o.contact_title, contact_email: o.contact_email, created_at: o.created_at, status: o.status, referrer: ou } };
  }).filter(Boolean);
  // Later submissions that collide with this one
  const later = db.prepare("SELECT id, name, created_at, status, conflicts FROM leads WHERE conflict = 1 AND id != ?").all(l.id)
    .filter((r) => JSON.parse(r.conflicts).some((c) => c.id === l.id)).map(({ conflicts: _c, ...r }) => r);
  const events = db.prepare('SELECT at, who, text, internal FROM lead_events WHERE lead_id = ? ORDER BY id').all(l.id);
  return { ...l, conflicts, later, referrer: u, events };
}

const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// ---------- routes ----------
async function api(req, res, url, send, readBody) {
  const p = url.pathname, m = req.method;
  const ip = req.socket.remoteAddress;

  if (p === '/api/register' && m === 'POST') {
    const b = await readBody();
    const name = clean(b.name, 120), email = clean(b.email, 160).toLowerCase(), phone = clean(b.phone, 40), company = clean(b.company, 120), password = String(b.password || '');
    if (!name) fail(400, 'Enter your full name');
    if (!isEmail(email)) fail(400, 'Enter a valid email');
    if (!isPhone(phone)) fail(400, 'Enter a valid phone number');
    if (!company) fail(400, 'Choose your company affiliation');
    if (password.length < 8) fail(400, 'Use a password of at least 8 characters');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) fail(409, 'That email already has an account. Sign in instead.');
    const isAdmin = ADMIN_EMAILS.includes(email);
    const r = db.prepare('INSERT INTO users(name, email, phone, company, role, status, pass_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(name, email, phone, company, isAdmin ? 'admin' : 'referrer', isAdmin ? 'approved' : 'pending', hashPassword(password), now());
    startSession(res, Number(r.lastInsertRowid));
    return send(200, { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid)) });
  }
  if (p === '/api/login' && m === 'POST') {
    const b = await readBody();
    const email = clean(b.email, 160).toLowerCase();
    const key = `${ip}|${email}`;
    const f = failedLogins.get(key);
    if (f && f.n >= 8 && f.until > Date.now()) fail(429, 'Too many wrong tries. Wait 15 minutes and try again.');
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!u || !checkPassword(b.password || '', u.pass_hash)) {
      failedLogins.set(key, { n: (f && f.until > Date.now() ? f.n : 0) + 1, until: Date.now() + 15 * 60000 });
      fail(401, 'Wrong email or password');
    }
    failedLogins.delete(key);
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), u.id);
    startSession(res, u.id);
    return send(200, { user: publicUser(u) });
  }
  if (p === '/api/logout' && m === 'POST') {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(cookieToken(req));
    res.setHeader('Set-Cookie', 'rp_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return send(200, { ok: true });
  }

  const user = sessionUser(req);
  if (p === '/api/me' && m === 'GET') return send(200, { user: publicUser(user) });
  if (!user) fail(401, 'Please sign in');

  if (p === '/api/me' && m === 'POST') {
    const b = await readBody();
    const name = clean(b.name, 120) || user.name, phone = clean(b.phone, 40) || user.phone, company = clean(b.company, 120) || user.company;
    if (!isPhone(phone)) fail(400, 'Enter a valid phone number');
    db.prepare('UPDATE users SET name = ?, phone = ?, company = ? WHERE id = ?').run(name, phone, company, user.id);
    return send(200, { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)) });
  }
  if (p === '/api/me/password' && m === 'POST') {
    const b = await readBody();
    if (!checkPassword(b.current || '', user.pass_hash)) fail(400, 'Your current password is wrong');
    if (String(b.password || '').length < 8) fail(400, 'Use at least 8 characters');
    db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(b.password), user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(user.id, cookieToken(req));
    return send(200, { ok: true });
  }

  if (user.status !== 'approved') fail(403, user.status === 'denied' ? 'Your application was not approved.' : 'Your account is waiting for approval.');

  // ----- referrer -----
  if (p === '/api/stats' && m === 'GET') return send(200, stats(user.id));
  if (p === '/api/check' && m === 'GET') return send(200, { results: claimSearch(user, url.searchParams.get('q') || '', url.searchParams.get('country') || '') });
  if (p === '/api/brands' && m === 'GET') {
    return send(200, { brands: db.prepare("SELECT DISTINCT name FROM leads WHERE entity_type = 'group' AND status != 'denied' ORDER BY name").all().map((r) => r.name) });
  }
  if (p === '/api/leads' && m === 'GET') {
    return send(200, { leads: db.prepare('SELECT * FROM leads WHERE user_id = ? ORDER BY created_at DESC').all(user.id).map(forReferrer) });
  }
  if (p === '/api/leads' && m === 'POST') {
    const out = createLead(user, await readBody());
    return send(200, { lead: forReferrer(out.lead), flagged: out.flagged });
  }
  let mm;
  if ((mm = p.match(/^\/api\/leads\/(\d+)$/))) {
    const lead = getLead(Number(mm[1]));
    if (!lead || (lead.user_id !== user.id)) fail(404, 'Lead not found');
    if (m === 'GET') {
      const events = db.prepare('SELECT at, who, text FROM lead_events WHERE lead_id = ? AND internal = 0 ORDER BY id').all(lead.id);
      return send(200, { lead: forReferrer(lead), events });
    }
    if (m === 'PATCH') return send(200, { lead: forReferrer(updatePipeline(user, lead, await readBody())) });
  }

  // ----- admin -----
  if (!p.startsWith('/api/admin/')) fail(404, 'Not found');
  if (user.role !== 'admin') fail(403, 'Admins only');

  if (p === '/api/admin/summary' && m === 'GET') {
    const one = (sql) => db.prepare(sql).get().n;
    return send(200, {
      pendingUsers: one("SELECT count(*) n FROM users WHERE status = 'pending'"),
      newLeads: one('SELECT count(*) n FROM leads WHERE admin_seen = 0'),
      pendingLeads: one("SELECT count(*) n FROM leads WHERE status = 'pending'"),
      flagged: one("SELECT count(*) n FROM leads WHERE conflict = 1 AND status IN ('pending','info_needed')"),
      partners: one("SELECT count(*) n FROM users WHERE status = 'approved' AND role = 'referrer'"),
      stats: stats(0),
    });
  }
  if (p === '/api/admin/users' && m === 'GET') {
    const rows = db.prepare(`SELECT u.id, u.name, u.email, u.phone, u.company, u.role, u.status, u.created_at, u.reviewed_at, u.reviewed_by, u.last_login_at,
        (SELECT count(*) FROM leads l WHERE l.user_id = u.id) AS leads FROM users u ORDER BY (u.status = 'pending') DESC, u.created_at DESC`).all();
    return send(200, { users: rows });
  }
  if ((mm = p.match(/^\/api\/admin\/users\/(\d+)$/)) && m === 'POST') {
    const b = await readBody();
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(mm[1]));
    if (!target) fail(404, 'Not found');
    if (b.status) {
      if (!['approved', 'denied', 'pending'].includes(b.status)) fail(400, 'Bad status');
      if (target.id === user.id) fail(400, "You can't change your own access");
      db.prepare('UPDATE users SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?').run(b.status, now(), user.name, target.id);
      if (b.status === 'denied') db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
    }
    if (b.role) {
      if (!['admin', 'referrer'].includes(b.role)) fail(400, 'Bad role');
      if (target.id === user.id) fail(400, "You can't change your own role");
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(b.role, target.id);
    }
    if (b.resetPassword) {
      const temp = randomBytes(5).toString('hex');
      db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(temp), target.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
      return send(200, { tempPassword: temp });
    }
    return send(200, { ok: true });
  }
  if (p === '/api/admin/leads' && m === 'GET') {
    const status = url.searchParams.get('status') || '';
    const q = nameKey(url.searchParams.get('q') || '');
    let sql = `SELECT l.*, u.name AS referrer_name, u.company AS referrer_company FROM leads l JOIN users u ON u.id = l.user_id WHERE 1=1`;
    const args = [];
    if (status === 'flagged') sql += " AND l.conflict = 1 AND l.status IN ('pending','info_needed')";
    else if (status === 'new') sql += ' AND l.admin_seen = 0';
    else if (status) { sql += ' AND l.status = ?'; args.push(status); }
    if (url.searchParams.get('user')) { sql += ' AND l.user_id = ?'; args.push(Number(url.searchParams.get('user'))); }
    if (q) { sql += " AND (' ' || l.name_key || ' ' || coalesce(l.parent_key,'')) LIKE ?"; args.push(`% ${q}%`); }
    sql += ' ORDER BY l.created_at DESC LIMIT 500';
    return send(200, { leads: db.prepare(sql).all(...args).map(({ conflicts, ...l }) => ({ ...l, conflict_count: JSON.parse(conflicts).length })) });
  }
  if ((mm = p.match(/^\/api\/admin\/leads\/(\d+)$/))) {
    const lead = getLead(Number(mm[1]));
    if (!lead) fail(404, 'Lead not found');
    if (m === 'GET') {
      if (!lead.admin_seen) db.prepare('UPDATE leads SET admin_seen = 1 WHERE id = ?').run(lead.id);
      return send(200, { lead: adminLeadView(getLead(lead.id)) });
    }
    if (m === 'POST') {
      const b = await readBody();
      const sets = {};
      if (b.status && b.status !== lead.status) {
        if (!LEAD_STATUSES[b.status]) fail(400, 'Bad status');
        if (b.status === 'denied' && !clean(b.reason)) fail(400, 'Choose a reason for denying');
        if (b.status === 'info_needed' && !clean(b.note)) fail(400, 'Say what info is needed');
        Object.assign(sets, { status: b.status, status_reason: b.status === 'denied' ? clean(b.reason, 200) : null, admin_note: clean(b.note, 1000) || null, reviewed_at: now(), reviewed_by: user.name });
        let text = `Status: ${LEAD_STATUSES[b.status].label}`;
        if (b.status === 'denied') text += ` (${clean(b.reason, 200)})`;
        if (clean(b.note)) text += `. Note: ${clean(b.note, 1000)}`;
        event(lead.id, user.name, text);
      }
      if ('internal_note' in b && clean(b.internal_note)) event(lead.id, user.name, `Internal note: ${clean(b.internal_note, 1000)}`, 1);
      let revChanged = false;
      for (const r of REVENUE_TYPES) {
        if (r.id in b) {
          const v = Math.max(0, Math.round(Number(b[r.id]) * 100) / 100 || 0);
          if (v !== lead[r.id]) { sets[r.id] = v; revChanged = true; }
        }
      }
      if (revChanged) event(lead.id, user.name, 'Revenue updated', 1);
      if ('clear_conflict' in b && b.clear_conflict) { sets.conflict = 0; event(lead.id, user.name, 'Marked conflict as resolved', 1); }
      if (Object.keys(sets).length) {
        sets.updated_at = now();
        const keys = Object.keys(sets);
        db.prepare(`UPDATE leads SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => sets[k]), lead.id);
      }
      return send(200, { lead: adminLeadView(getLead(lead.id)) });
    }
  }
  if (p === '/api/admin/leads/seen-all' && m === 'POST') {
    db.prepare('UPDATE leads SET admin_seen = 1').run();
    return send(200, { ok: true });
  }
  if (p === '/api/admin/export.csv' && m === 'GET') {
    const rows = db.prepare('SELECT l.*, u.name AS referrer_name, u.email AS referrer_email, u.company AS referrer_company FROM leads l JOIN users u ON u.id = l.user_id ORDER BY l.created_at').all();
    const cols = ['id', 'created_at', 'status', 'status_reason', 'conflict', 'entity_type', 'name', 'parent_brand', 'city', 'state', 'country', 'website', 'contact_name', 'contact_title', 'contact_email', 'contact_phone',
      'referrer_name', 'referrer_email', 'referrer_company', 'contacted_at', 'meeting_at', 'contract_at', 'content_day_at', 'content_day_date', 'upsell_at', 'upsell_type', 'upsell_notes', 'outcome',
      'rev_commission', 'rev_bonus', 'rev_upsell', 'notes', 'referrer_notes'];
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="referral-leads-${now().slice(0, 10)}.csv"` }).end('﻿' + csv);
    return;
  }
  fail(404, 'Not found');
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

export const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (status, obj) => res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(obj));
  const readBody = async () => {
    const chunks = [];
    let size = 0;
    for await (const c of req) { size += c.length; if (size > 1e6) fail(413, 'Too large'); chunks.push(c); }
    try { return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch { fail(400, 'Bad request'); }
  };
  if (url.pathname.startsWith('/api/')) {
    // Block cross-site requests from other web pages.
    const origin = req.headers.origin;
    if (origin && req.method !== 'GET') {
      let ok = false;
      try { ok = new URL(origin).host === req.headers.host; } catch {}
      if (!ok) return send(403, { error: 'Blocked request from another site' });
    }
    try {
      await api(req, res, url, send, readBody);
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e);
      if (!res.headersSent) send(e.status || 500, { error: e.status ? e.message : 'Something went wrong' });
    }
    return;
  }
  let path = decodeURIComponent(url.pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(publicDir, path));
  if (!file.startsWith(publicDir)) return res.writeHead(403).end();
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  server.listen(PORT, HOST, () => {
    console.log(`CovenantGO Referral Partners: http://localhost:${PORT}`);
    console.log(`Data is saved in ${dbFile}${DEMO ? "  (DEMO data)" : ""}`);
    if (!db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get()) {
      console.log('\nNo admin yet. Make one with:  node tools/make-admin.mjs you@example.com');
    }
  });
}
