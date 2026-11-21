// Shared by the server (server.mjs) and the browser (app.js).
// Change program wording, lists and rules here.

export const ENTITY_TYPES = [
  { id: 'hotel', label: 'Individual Hotel', plural: 'Hotels', location: 'required' },
  { id: 'group', label: 'Hospitality Group', plural: 'Groups', location: 'optional', hint: 'e.g. Marriott, Hilton, a management company' },
  { id: 'platform', label: 'Platform', plural: 'Platforms', location: 'optional', hint: 'e.g. TheGuestbook.com' },
  { id: 'association', label: 'Association', plural: 'Associations', location: 'required', hint: 'e.g. a local hotel & lodging association' },
  { id: 'dmo', label: 'DMO / Tourism Board', plural: 'DMOs', location: 'state', hint: 'City is optional for state or national boards' },
];
export const entityType = (id) => ENTITY_TYPES.find((t) => t.id === id);

// Which location fields a type needs: 'required' = city + state + country,
// 'state' = state + country (city optional), 'optional' = all optional.
export function locationRule(typeId) {
  return entityType(typeId)?.location || 'required';
}

export const COMPANIES = ['Crimson Rock', 'Self / Not Applicable'];

export const LEAD_STATUSES = {
  pending: { label: 'Pending Review', tone: 'warn' },
  info_needed: { label: 'Further Info Needed', tone: 'info' },
  accepted: { label: 'Accepted', tone: 'ok' },
  denied: { label: 'Denied', tone: 'bad' },
};

export const DENY_REASONS = [
  'Already in system',
  'Already in TikTok GO',
  'Submitted by another partner first',
  'Not a fit for TikTok GO',
  'Missing or invalid contact details',
];

// Referrer pipeline (CRM). Each checkbox is stamped with the time it was ticked.
export const STAGES = [
  { id: 'contacted', label: 'Contacted', sub: 'Email sent' },
  { id: 'meeting', label: 'Meeting set up' },
  { id: 'contract', label: 'Contract completed' },
  { id: 'content_day', label: 'Content day scheduled' },
  { id: 'upsell', label: 'Upsells', sub: 'Add the type and notes' },
];
export const UPSELL_TYPES = ['Footage Vault', 'Featured listing', 'Extra content day', 'Creator campaign', 'Other'];
export const OUTCOMES = {
  active: 'Active',
  closed: 'Closed',
  non_exclusive: 'Non-Exclusive',
  cold: 'Cold',
};

export const REVENUE_TYPES = [
  { id: 'rev_commission', label: 'TikTok GO Commission' },
  { id: 'rev_bonus', label: 'TikTok GO Agency Bonuses & Incentives' },
  { id: 'rev_upsell', label: 'Hotel Upsells' },
];

export const COUNTRIES = { US: 'United States', MX: 'Mexico', CA: 'Canada' };
export const REGIONS = {
  US: ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Puerto Rico', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'],
  MX: ['Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas'],
  CA: ['Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Northwest Territories', 'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Yukon'],
};
export const regionLabel = (country) => (country === 'CA' ? 'Province / Territory' : 'State');

// Known brands, offered as suggestions in "Parent company / brand".
export const KNOWN_BRANDS = ['Marriott', 'Hilton', 'Hyatt', 'IHG', 'Wyndham', 'Choice Hotels', 'Best Western', 'Accor', 'Radisson', 'Four Seasons', 'Omni', 'Loews', 'Kimpton', 'Grupo Posadas', 'Palace Resorts', 'RIU', 'Fairmont', 'Sonesta', 'Aimbridge', 'Highgate'];

// ---------- matching (used for duplicate checks) ----------
const STOP = new Set(['the', 'a', 'an', 'llc', 'inc', 'ltd', 'co', 'sa', 'de', 'cv']);
export function nameKey(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/https?:\/\/|www\./g, '')
    .replace(/\.(com|net|org|mx|ca|io|co)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOP.has(w))
    .join(' ');
}
export function domainOf(s) {
  const m = String(s || '').toLowerCase().trim().match(/^(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/);
  return m ? m[1] : '';
}
const FREE_MAIL = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'live.com', 'msn.com', 'me.com', 'proton.me', 'protonmail.com']);
export const isFreeMail = (domain) => FREE_MAIL.has(domain);

export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(s || '').trim());
export const isPhone = (s) => String(s || '').replace(/\D/g, '').length >= 10;
