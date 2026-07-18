# 💕 HeartConnect — Backend

Full Node.js + Express + MongoDB backend for the HeartConnect dating platform.

## 1. Install

```bash
npm install
```

## 2. Configure environment

Copy `.env.example` to `.env` and fill in your own values:

```bash
cp .env.example .env
```

You need, at minimum:
- `MONGODB_URI` — a MongoDB Atlas connection string (free tier works)
- `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` — from your Cloudinary dashboard
- `JWT_SECRET` — any long random string

`FACEBOOK_APP_ID/SECRET` and `INSTAGRAM_APP_ID/SECRET` are optional — if left blank, social verification is disabled (the server logs a warning but keeps running).

## 3. Run

```bash
npm start
```

Visit `http://localhost:5000`. The homepage (`public/index.html`) is the frontend you already reviewed — it currently still uses **mock data**. Wiring it to these real endpoints is the next step (see below).

The admin dashboard is live and fully wired at `http://localhost:5000/admin` — log in with the seeded admin account:
- Username: whatever `ADMIN_USERNAME` is set to (default `admin`)
- Password: whatever `ADMIN_PASSWORD` is set to (default `admin123`)

**Change the admin password in `.env` before deploying anywhere public.**

## 4. What's implemented

| Feature | Route(s) |
| :--- | :--- |
| Signup (pending approval) | `POST /api/auth/signup` |
| Login (JWT, 7-day expiry) | `POST /api/auth/login` |
| Current user | `GET /api/auth/me` |
| Facebook/Instagram verification | `GET /api/auth/facebook`, `/api/auth/instagram` (+ callbacks) |
| Profile grid (search/filter/sort/paginate) | `GET /api/profiles` |
| Profile detail | `GET /api/profiles/:id` |
| Create/edit/delete own profile | `POST /api/profiles`, `PUT /api/profiles/me/update`, `DELETE /api/profiles/me` |
| Likes | `POST /api/likes/:profileId` (toggle) |
| Reports | `POST /api/reports/:profileId` |
| Support chat | `GET/POST /api/chat/me` |
| Site notice | `GET /api/notices/active` |
| Precise location | `POST /api/location/precise` |
| Admin: users/approve/promote/delete | `/api/admin/users/...` |
| Admin: reports | `/api/admin/reports/...` |
| Admin: chats/reply/resolve | `/api/admin/chats/...` |
| Admin: security (risk scores) | `GET /api/admin/security` |
| Admin: notices | `/api/admin/notices` |
| Admin: deletions log | `GET /api/admin/deletions` |
| Admin: export new users JSON | `GET /api/admin/export` |
| Legal pages | `/privacy`, `/terms`, `/admin-policy` |

Risk scoring (`utils/risk.js`) implements all four rules from the spec: country mismatch (+2), social account <7 days old (+1), >3 accounts sharing an IP (+3), no social verification (+1).

## 5. Still to do

- **Wire `public/index.html` to these real endpoints** (replace `MOCK_PROFILES` with `fetch` calls, store the JWT after login, send real multipart form data on signup). This is the natural next step.
- Add your real Facebook/Instagram OAuth app credentials once you're ready to test social verification end-to-end.
- Review and replace the placeholder legal page copy with real policy text.

## 6. Deploying (Railway / Render)

1. Push this folder to a GitHub repo.
2. Create a new project on Railway or Render, connect the repo.
3. Set all variables from `.env.example` in the platform's environment variables UI.
4. Deploy — the platform runs `npm install` then `npm start` automatically.
5. Make sure your MongoDB Atlas cluster's IP access list allows connections from anywhere (`0.0.0.0/0`) or from your host's IPs.
