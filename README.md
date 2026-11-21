# CovenantGO Referral Partners

TikTok GO **Referral Partner & CRM platform** (Priority 1 MVP). Referral partners such as Crimson Rock's
pilots and independent referrers apply, get approved, check whether a property is already claimed, submit
hotel and partner leads, track their pipeline and see their earnings. Admins review partners and leads and
resolve conflicts.

## What's in the MVP

| Area | What it does |
| --- | --- |
| **Public landing page** | TikTok GO program overview, how it works, who to refer, benefits, FAQ. Copy lives in `public/content.js` (draft, edit freely) |
| **Apply / sign in** | Full name, email, phone, company affiliation (Crimson Rock, Self / Not Applicable, or another company), password |
| **Gated access** | New accounts are **Waiting for approval** until an admin approves them. They can't submit or search until then |
| **Submit a lead** | Entity type: Individual Hotel, Hospitality Group, Platform, Association, DMO / Tourism Board. City + state + country required for hotels and associations; state + country for DMOs; location optional (hidden) for platforms and groups. US, Mexico and Canada with state/province lists. Parent company / brand for hotels. Contact name, **title**, business email and phone required |
| **Timestamps** | Every submission is stamped to the second when it lands, and shown to the partner |
| **Check availability** | Search by name or brand. Shows only "Claimed" / "Claimed, under review", never who submitted or the contacts. Also runs live while typing on the submit form |
| **Conflict flagging** | Automatic flags for: same name in the same place, a hotel whose parent brand matches a Hospitality Group already submitted, a group whose properties were already submitted, same website, same contact email |
| **Admin review queue** | New / Flagged / Pending Review / Further Info Needed / Accepted / Denied. Deny needs a reason ("Already in system", "Already in TikTok GO"…). Side-by-side conflict view showing which came first, both referrers and both contacts' titles. Internal notes, history, CSV export. New entries are flagged in the dashboard (no email yet) |
| **Partner approvals** | Approve / deny / remove access, make admin, reset password (gives a temporary password) |
| **Referrer CRM** | Per lead: Contacted (email sent), Meeting set up, Contract completed, Content day scheduled (+ date), Upsells (+ type and notes), each stamped when ticked. Outcome: Active / Closed / Non-Exclusive / Cold. Private notes. Reply when admins ask for more info |
| **Referrer dashboard** | Total referrals and counts by Hotels / Groups / Platforms / Associations / DMOs, review status, pipeline, earnings |
| **Earnings** | Total revenue counter, the three categories (TikTok GO Commission, TikTok GO Agency Bonuses & Incentives, Hotel Upsells) and a per-property table you can click into. Admins enter the amounts per lead for now |
| **Resources** | Tab with "Coming soon" cards (FAQs, objection handling, flyers, hotel landing page) |

## Run it

Needs **Node.js 22.13 or newer**. Nothing to install.

```bash
npm run demo     # fresh demo data + server at http://localhost:5200 (uses data/demo.db)
npm start        # the real database (data/referrals.db)
```

On Windows you can double-click **Start Referral Partners.bat** for the real database.

- **Demo sign-ins** (demo database only): `admin@demo.test`, `lewis@demo.test`, `kelly@demo.test`, `shelly@demo.test`.
  The password is `DEMO_PASSWORD` in `tools/seed-demo.mjs`. Running `npm run demo` again resets the demo data.
- **First real admin:** register normally, then run `node tools/make-admin.mjs you@example.com`.
  Or start the server with `ADMIN_EMAILS=a@x.com,b@y.com` and those emails become admins when they register.

## Put it online

Partners need a public web address, so the server has to run on a host that keeps the `data/` folder
between restarts (SQLite is a file). Any Node host with a persistent disk works, for example:

- **Render**: New → Web Service from this repo, start command `node server.mjs`, add a Disk mounted at
  `/var/data`, and set env vars `DATA_DIR=/var/data`, `HOST=0.0.0.0`, `SECURE_COOKIE=1`, `ADMIN_EMAILS=…`.
- **Railway / Fly.io**: same settings with a volume.

For a quick internal demo from this computer, run `npm run demo` and share it with a tunnel
(e.g. Cloudflare Tunnel or Tailscale Funnel). Set `HOST=0.0.0.0` if the tunnel connects over the network.

Back up `data/referrals.db`. It is not in git.

## Settings (environment variables)

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `5200` | Port |
| `HOST` | `127.0.0.1` | Use `0.0.0.0` on a server |
| `DATA_DIR` | `./data` | Where the database lives |
| `ADMIN_EMAILS` | (none) | Comma-separated emails that become admins on sign-up |
| `SECURE_COOKIE` | off | Set to `1` when served over https |

## Project layout

```
server.mjs           API, sign-in, conflict detection, database (Node built-in SQLite)
public/index.html    App shell
public/app.js        All screens (hash router)
public/shared.js     Lists and rules shared by server and browser: entity types, regions, statuses, pipeline, revenue types
public/content.js    Landing page and Resources copy
public/styles.css    Styles (light/dark follows the device)
tools/seed-demo.mjs  Demo data
tools/make-admin.mjs Make someone an admin
```

## Not in this MVP yet

- Email notifications for new submissions (new ones are flagged in Admin instead)
- Forgot-password email (admins reset passwords from Admin → Partners)
- Automatic commission calculation (Priority 4)
- Priority 2 (hotel landing page, booking, AI FAQ assistant) and Priority 3 (Footage Vault portal)
