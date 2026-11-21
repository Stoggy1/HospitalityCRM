// Fills the DEMO database (data/demo.db) with sample partners and leads for walkthroughs.
// Run:  npm run demo   (seeds, then starts the server on the demo database)
// Everything here is fictional. The demo accounts below only exist in data/demo.db.
process.argv.push('--demo');
const { rmSync } = await import('node:fs');
const { join, dirname } = await import('node:path');
const { fileURLToPath } = await import('node:url');
const dataDir = process.env.DATA_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
for (const f of ['demo.db', 'demo.db-wal', 'demo.db-shm']) rmSync(join(dataDir, f), { force: true });

const { db, hashPassword, createLead, updatePipeline, getLead, event } = await import('../server.mjs');

// Demo sign-ins (demo database only)
export const DEMO_PASSWORD = 'demo-pass-2026';
const users = [
  { name: 'Demo Admin', email: 'admin@demo.test', phone: '555-010-0001', company: 'Covenant Creative', role: 'admin', status: 'approved' },
  { name: 'Lewis Demo', email: 'lewis@demo.test', phone: '555-010-0002', company: 'Self / Not Applicable', role: 'referrer', status: 'approved' },
  { name: 'Kelly Demo', email: 'kelly@demo.test', phone: '555-010-0003', company: 'Crimson Rock', role: 'referrer', status: 'approved' },
  { name: 'Shelly Demo', email: 'shelly@demo.test', phone: '555-010-0004', company: 'Self / Not Applicable', role: 'referrer', status: 'approved' },
  { name: 'Pat Pilot', email: 'pat@demo.test', phone: '555-010-0005', company: 'Crimson Rock', role: 'referrer', status: 'pending' },
  { name: 'Jordan Pilot', email: 'jordan@demo.test', phone: '555-010-0006', company: 'Crimson Rock', role: 'referrer', status: 'pending' },
];
const ids = {};
const hash = hashPassword(DEMO_PASSWORD);
let t = Date.now() - 6 * 864e5;
for (const u of users) {
  const r = db.prepare('INSERT INTO users(name, email, phone, company, role, status, pass_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(u.name, u.email, u.phone, u.company, u.role, u.status, hash, new Date(t += 36e5).toISOString());
  ids[u.email.split('@')[0]] = { id: Number(r.lastInsertRowid), name: u.name };
}

const c = (n) => ({ contact_name: n[0], contact_title: n[1], contact_email: n[2], contact_phone: '555-020-' + String(1000 + Math.floor(Math.random() * 8999)) });
const leads = [
  ['lewis', { entity_type: 'hotel', name: 'Seabreeze Harbor Hotel', parent_brand: '', city: 'Miami Beach', state: 'Florida', country: 'US', website: 'seabreezeharbor.example', ...c(['Ana Ruiz', 'General Manager', 'ana@seabreezeharbor.example']) }],
  ['lewis', { entity_type: 'group', name: 'Coastline Hospitality Group', city: '', state: '', country: 'US', ...c(['Mark Chen', 'VP Marketing', 'mark@coastlinehg.example']) }],
  ['kelly', { entity_type: 'hotel', name: 'The Desert Rose Inn', city: 'Scottsdale', state: 'Arizona', country: 'US', ...c(['Rita Gomez', 'Director of Sales', 'rita@desertrose.example']) }],
  ['kelly', { entity_type: 'platform', name: 'StayCurated.example', website: 'staycurated.example', ...c(['Leo Park', 'Head of Partnerships', 'leo@staycurated.example']) }],
  ['kelly', { entity_type: 'dmo', name: 'Visit Lakeshore', city: '', state: 'Michigan', country: 'US', ...c(['Dana Wells', 'Executive Director', 'dana@visitlakeshore.example']) }],
  ['shelly', { entity_type: 'hotel', name: 'Casa Azul Boutique Hotel', city: 'Tulum', state: 'Quintana Roo', country: 'MX', ...c(['Sofía Martín', 'Owner', 'sofia@casaazul.example']) }],
  ['shelly', { entity_type: 'association', name: 'Banff Lodging Association', city: 'Banff', state: 'Alberta', country: 'CA', ...c(['Chris Doyle', 'President', 'chris@banfflodging.example']) }],
  // Conflicts for the admin queue:
  ['kelly', { entity_type: 'hotel', name: 'Seabreeze Harbor Hotel', city: 'Miami Beach', state: 'Florida', country: 'US', ...c(['Tom Lee', 'Front Office Manager', 'tom@seabreezeharbor.example']) }],
  ['shelly', { entity_type: 'hotel', name: 'Coastline Suites Naples', parent_brand: 'Coastline Hospitality Group', city: 'Naples', state: 'Florida', country: 'US', ...c(['Jen Fox', 'Sales Manager', 'jen@coastlinesuites.example']) }],
];
const leadIds = [];
for (const [who, body] of leads) {
  const { lead } = createLead(ids[who], body);
  leadIds.push(lead.id);
  db.prepare('UPDATE leads SET created_at = ? WHERE id = ?').run(new Date(t += 3 * 36e5).toISOString(), lead.id);
}

const admin = ids.admin;
const setStatus = (id, status, extra = {}) => {
  db.prepare('UPDATE leads SET status = ?, status_reason = ?, admin_note = ?, reviewed_at = ?, reviewed_by = ?, admin_seen = 1 WHERE id = ?')
    .run(status, extra.reason || null, extra.note || null, new Date().toISOString(), admin.name, id);
  event(id, admin.name, `Status: ${status === 'accepted' ? 'Accepted' : status === 'denied' ? `Denied (${extra.reason})` : 'Further Info Needed'}${extra.note ? `. Note: ${extra.note}` : ''}`);
};
setStatus(leadIds[0], 'accepted');
setStatus(leadIds[2], 'accepted');
setStatus(leadIds[3], 'accepted');
setStatus(leadIds[5], 'info_needed', { note: 'Can you confirm the property website and that Sofía signs partnership agreements?' });
setStatus(leadIds[6], 'denied', { reason: 'Already in TikTok GO' });

updatePipeline(ids.lewis, getLead(leadIds[0]), { stages: { contacted: true, meeting: true, contract: true, content_day: true, upsell: true }, content_day_date: '2026-12-10', upsell_type: 'Footage Vault', upsell_notes: 'Interested in 20 clips for the lobby + rooftop' });
updatePipeline(ids.kelly, getLead(leadIds[2]), { stages: { contacted: true, meeting: true } });
updatePipeline(ids.kelly, getLead(leadIds[3]), { stages: { contacted: true }, outcome: 'non_exclusive' });
db.prepare('UPDATE leads SET rev_commission = 1240, rev_bonus = 300, rev_upsell = 450 WHERE id = ?').run(leadIds[0]);
db.prepare('UPDATE leads SET rev_commission = 380 WHERE id = ?').run(leadIds[2]);

console.log(`Demo data ready in data/demo.db: ${users.length} people, ${leads.length} leads.`);
console.log(`Sign in with admin@demo.test, lewis@demo.test, kelly@demo.test or shelly@demo.test (password in tools/seed-demo.mjs).`);
