// Make someone an admin (approved).  node tools/make-admin.mjs person@example.com ["Full Name"]
// If they don't have an account yet, one is created and a temporary password is printed.
// Add --demo to change the demo database instead.
import { randomBytes } from 'node:crypto';
import { db, hashPassword, now } from '../server.mjs';

const args = process.argv.slice(2).filter((a) => a !== '--demo');
const email = String(args[0] || '').toLowerCase().trim();
if (!email.includes('@')) {
  console.log('Usage: node tools/make-admin.mjs person@example.com ["Full Name"]');
  process.exit(1);
}
const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
if (u) {
  db.prepare("UPDATE users SET role = 'admin', status = 'approved', reviewed_at = ?, reviewed_by = 'make-admin' WHERE id = ?").run(now(), u.id);
  console.log(`${u.name} (${email}) is now an admin.`);
} else {
  const temp = randomBytes(6).toString('hex');
  db.prepare("INSERT INTO users(name, email, phone, company, role, status, pass_hash, created_at) VALUES (?, ?, '', 'Covenant Creative', 'admin', 'approved', ?, ?)")
    .run(args[1] || email.split('@')[0], email, hashPassword(temp), now());
  console.log(`Created admin ${email}. Temporary password: ${temp}`);
  console.log('Sign in, then change it under Profile.');
}
