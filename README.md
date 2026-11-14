# Waaberi Party Website: React + Flask + PostgreSQL

## Run (Docker Compose)
```bash
bash start-dev.sh                 # creates backend/.env on first run, then builds and starts everything
# or manually:
cp backend/.env.example backend/.env   # set SECRET_KEY and ADMIN_PASSWORD
docker compose up --build -d
```
- Website: http://localhost:3000
- Admin: http://localhost:3000/admin
- Stop: `docker compose down` (add `-v` to wipe the database)

Services: `db` (Postgres), `api` (Flask on 5000, internal only), `web` (nginx on port 3000, serves the React build and proxies `/api`).

Frontend hot-reload dev mode (optional): `cd frontend && npm install && npm run dev` (http://localhost:5173, needs the API reachable on localhost:5000).

**Languages:** the public site has a Somali / English / Arabic switcher in the top bar (English is the default; Arabic switches the layout to right-to-left). Fixed text lives in `frontend/src/i18n.jsx`. Admins write Somali and Arabic versions of posts, pages and leader profiles using the language tabs in the dashboard; anything left empty falls back to English. Existing databases get the new `i18n` columns automatically on startup.

**Images:** admins (Super admin, Editor) can upload JPG/PNG/WebP/GIF images up to 5 MB for posts, page banners and leader photos. Files are stored in the `uploads` Docker volume and served from `/api/uploads/...`. Logo and favicon live in `frontend/public/`.

Admin dashboard: `/admin` (credentials from `.env`, seeded on first start). Manage content, members (search, delete, CSV export) and contact messages.

**Upgrading an existing DB:** run `ALTER TABLE message ADD COLUMN is_read boolean NOT NULL DEFAULT false;` or reset with `docker compose down -v`.

## API
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | /api/posts?kind=campaign/news/statement | none | List content |
| POST/DELETE | /api/posts[/id] | JWT | Manage content |
| POST | /api/members | none | Join mailing list (name, phone, email) |
| POST | /api/contact | none | Contact form |
| POST | /api/auth/login | none | Admin token |
| GET/DELETE | /api/members[/id] | JWT | List / remove members |
| PUT | /api/posts/id | JWT | Edit post |
| GET/PATCH/DELETE | /api/messages[/id] | JWT | Contact inbox |
| GET | /api/admin/stats | JWT | Dashboard counts |
| GET/PUT | /api/pages/who-we-are, where-we-stand, leadership | PUT: Super admin | Site page content |
| GET/POST/PUT/DELETE | /api/leaders[/id] | write: Super admin | Leadership profiles |

## Before production
- Replace `db.create_all()` with Flask-Migrate/Alembic migrations.
- Add rate limiting (Flask-Limiter) and CAPTCHA on public POST routes.
- Serve over HTTPS, set a strong SECRET_KEY, restrict CORS_ORIGIN.
- Add a payment provider for donations (Donate page is a placeholder).
- Member phone numbers are personal data: secure the DB and check privacy rules.
- Use your own licensed photos; none were copied from the screenshots.

## Donations
- **Hormuud (EVC Plus)** and **Golis (Sahal)**: the donor sends money to the number in `EVC_NUMBER` / `SAHAL_NUMBER`, then submits their transaction ID. The donation is saved as *pending*; an admin confirms it in **/admin → Donations** after checking the SMS or merchant statement. Confirm the exact service names and merchant/receiving number with each operator.
- **PayPal**: real checkout. Set `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_ENV` (sandbox first, then live). Orders are created and captured on the server, and the captured amount is what gets recorded.
- **Donate page flow** (modelled on biciid.com/donate): one-time or monthly → direct the gift (General Fund, a specific campaign, or a region from `DONATION_REGIONS`) → amount ($1–$100 presets or any custom amount from $1, with an impact line per tier) → payment method (EVC Plus, Sahal, PayPal) → donor info with an anonymous option → "Donate $X" → payment instructions and transaction ID → thank you. Monthly gifts are recorded as monthly pledges and use mobile money; PayPal is one-time. Impact lines and "Why give?" text are in `frontend/src/i18n.jsx` (keys `d_imp_*`, `d_why*`).
- **Payment numbers:** Super admin or Finance can enter the Hormuud Telecom (EVC Plus) and Golis Telecom (Sahal) receiving numbers in **/admin → Payment settings**; they go live on the donate page immediately (values there override `.env`). PayPal keys stay in `backend/.env`.
- **Automatic phone payments (WaafiPay):** set `WAAFI_MERCHANT_UID`, `WAAFI_API_USER_ID`, `WAAFI_API_KEY` and `WAAFI_ENV` (sandbox/live) in `backend/.env`. The donor types their EVC Plus or Sahal number, the server calls WaafiPay `API_PURCHASE`, the donor approves the prompt on their phone with their PIN, and the donation is saved as confirmed with WaafiPay's transaction ID (rejected if they cancel). If WaafiPay doesn't answer in time the donation stays pending for finance to check. Without these keys the site falls back to the manual "send money + transaction ID" flow.
- If you have merchant API access from Hormuud or Golis later, automate confirmation by replacing the manual check in `donate_manual`.
- Upgrading an existing DB: `Donation` is a new table, so `db.create_all()` creates it on restart.

## Admin roles
| Role | Access |
|---|---|
| Super admin | Everything, plus **Site pages** (edit Who We Are, Where We Stand, Our Leadership and leader profiles) and **Team & roles** (create accounts, change roles, disable, reset passwords) |
| Editor | Content: campaigns, news, statements |
| Finance | Donations (view only; status is set automatically by WaafiPay/PayPal) and payment settings |
| Membership | Members and contact messages |

Permissions are enforced on the server for every request (a disabled account loses access immediately); the UI only hides tabs. The account from `ADMIN_EMAIL` is created as Super admin. You can’t change your own role or disable yourself, and the last active super admin can’t be removed.

**Upgrading an existing DB** (new columns on `admin`):
```sql
ALTER TABLE admin ADD COLUMN name varchar(120) NOT NULL DEFAULT 'Admin';
ALTER TABLE admin ADD COLUMN role varchar(20) NOT NULL DEFAULT 'super_admin';
ALTER TABLE admin ADD COLUMN is_active boolean NOT NULL DEFAULT true;
```
