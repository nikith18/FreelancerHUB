# FreelancerHub Lumina

FreelancerHub is a JavaScript MERN freelance marketplace starter with public job discovery and role-based spaces for freelancers, clients, and administrators. The existing job-search UI is retained; new flows use MongoDB through the Express API.

## Stack and requirements

- Node.js 22.12+ (use a currently supported LTS release; Node.js 20 is end-of-life)
- MongoDB (the server reads `MONGODB_URI` from `server/.env`)
- React 19, Vite 8, Express 5, Mongoose 9
- JavaScript and JSX throughout

## Local setup

Install dependencies from separate terminals:

```powershell
cd server
npm install
```

```powershell
cd client
npm install
```

Create `server/.env` using the variable names below. Keep real values local and never paste them into source control.

```dotenv
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<database>
JWT_SECRET=<a-random-secret-at-least-32-characters-long>
CLIENT_ORIGIN=http://localhost:5173
# Optional: only for the development demo seed command
DEMO_PASSWORD=<a-development-password-at-least-10-characters-long>
```

From the project root, run both the API and Vite client together:

```powershell
npm run dev
```

Press `Ctrl+C` to stop both. To run them separately, use `npm run dev:server` and `npm run dev:client` from the project root (one command per terminal).

```powershell
npm run dev:server
```

```powershell
npm run dev:client
```

Open `http://localhost:5173`. Vite proxies `/api` to `http://localhost:5000`. For a separately hosted API, set `VITE_API_URL` to its API base URL before building the client.

The server exposes `GET /api/health`. It reports whether Mongoose is currently connected. This project setup guide does not run that check or connect to your database.

## Vercel deployment

Deploy this monorepo as two Vercel projects connected to the same GitHub repository. The API uses Vercel's Express runtime; the frontend is a Vite static site. The frontend project's `vercel.json` provides the client-side route fallback.

1. Create the frontend project first with repository `nikith18/FreelancerHUB`, **Root Directory** `client`, and the Vite preset. Use `npm run build` and `dist` if Vercel does not detect them. The site can be created before its API is configured; its API calls will work after the next steps.
2. Create a second Vercel project from the same repository with **Root Directory** `server`. Use Node.js 22 or newer. The `server.js` entry exports the Express app to Vercel and keeps the local `npm run dev` workflow intact.
3. In the API project's Production environment, set `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET` (at least 32 bytes), and `CLIENT_ORIGIN` to the frontend's exact HTTPS origin, such as `https://your-site.vercel.app`. Add secrets in Vercel Project Settings; never commit them.
4. After the API project has a domain, set the frontend project's Production variable `VITE_API_URL` to `https://your-api.vercel.app/api`, then redeploy the frontend.
5. Check `https://your-api.vercel.app/api/health`; success requires a live MongoDB connection.

Vercel Hobby functions use dynamic outbound IP addresses. MongoDB Atlas IP allowlisting therefore requires Vercel Static IPs (a paid Vercel feature), or a broader Atlas network rule for a demo. If using a broad rule, protect the cluster with a unique, strong database-user password and grant only the database permissions the app needs. Do not use a production cluster with an unrestricted network rule.

## Accounts

Public registration supports **Client** and **Freelancer**. It never accepts an Admin role. Admins are created only by the development seed script in this starter; set `DEMO_PASSWORD` first, then run:

```powershell
cd server
npm run seed:demo
```

The script refuses to run when `NODE_ENV=production`, requires a local `DEMO_PASSWORD` and `MONGODB_URI`, creates missing accounts, and leaves existing accounts and passwords untouched. It does not clear collections. Demo emails:

- Admin: `admin@freelancerhub.demo`
- Client: `client@freelancerhub.demo`
- Freelancer: `freelancer@freelancerhub.demo`

All three use the local `DEMO_PASSWORD` value. These are development accounts; use unique credentials and provision real production administrators through a controlled process.

## Main API

Browser sessions use a short-lived bearer JWT kept in each tab's `sessionStorage`. The frontend sends `X-CSRF-Protection: 1` on state-changing requests, and the API checks the request origin.

| Method | Route | Access |
| --- | --- | --- |
| `GET` | `/api/health` | Public health status |
| `POST` | `/api/auth/register` | Public; client/freelancer only |
| `POST` | `/api/auth/login` | Public |
| `GET` | `/api/auth/me` | Signed-in user |
| `GET` | `/api/jobs` | Public open-job search, filter, sort and pagination |
| `GET` | `/api/jobs/:id` | Public open-job details |
| `POST` | `/api/jobs` | Client; creates an owned listing |
| `GET` | `/api/jobs/mine` | Client's own listings |
| `PUT` / `DELETE` | `/api/jobs/:id` | Owning client; edit or close listing |
| `POST` | `/api/applications` | Freelancer; send one proposal per job |
| `GET` | `/api/applications/my` | Freelancer's own proposals |
| `GET` | `/api/applications/job/:jobId` | Owning client; incoming proposals |
| `POST` | `/api/applications/:id/accept` or `/reject` | Owning client; acceptance starts a project |
| `GET` | `/api/projects/my` | Signed-in user's projects |
| `POST` | `/api/projects/:id/submit` | Project freelancer submits work |
| `POST` | `/api/projects/:id/review` | Project client approves or requests a revision |
| `GET` | `/api/notifications` | Signed-in user's notifications |
| `PATCH` | `/api/notifications/:id/read` | Notification owner |
| `PUT` | `/api/profile/me` | Signed-in user's profile |
| `GET` | `/api/admin/stats`, `/users`, `/jobs`, `/applications` | Admin only |
| `PATCH` | `/api/admin/users/:id`, `/jobs/:id`, `/applications/:id` | Admin only |
| `GET` / `POST` | `/api/skillproof/mine` | Freelancer; list or create own skill claims |
| `POST` | `/api/skillproof/:id/evidence`, `/:id/withdraw` | Freelancer; submit/resubmit or withdraw own pending evidence |
| `GET` | `/api/skillproof/:id` | Owning freelancer or Admin; private record and review history |
| `GET` | `/api/skillproof/public/:userId` | Public; verified skill names, evidence categories, and review dates only |
| `GET` | `/api/skillproof/admin` and `/admin/:id` | Admin; filter and inspect evidence queue |
| `PATCH` | `/api/skillproof/admin/:id/review`, `/admin/:id/flag` | Admin; approve, reject, request information, or flag for follow-up |

### Authorization matrix

| Capability | Anonymous | Freelancer | Client | Admin |
| --- | --- | --- | --- | --- |
| Browse open jobs and view open job details | Yes | Yes | Yes | Yes |
| Create/manage own jobs and review proposals | No | No | Own jobs only | Moderate |
| Submit proposals and view own applications | No | Own only | No | Moderate |
| View/manage projects | No | Assigned only | Assigned only | No project workspace route |
| Update own profile and view own notifications | No | Yes | Yes | Yes |
| Manage users and platform moderation | No | No | No | Yes |

## Security and current limits

- Passwords are hashed with bcryptjs (12 rounds). Password input is capped at 72 UTF-8 bytes to match bcrypt's effective input limit. Registration accepts only client and freelancer roles and allowlists fields.
- New sessions are signed HS256 JWTs returned after successful login or registration, expire after one hour, and are stored in `sessionStorage`, which is isolated by browser tab. Requests send only that tab's bearer token; the server ignores cookies and rejects legacy tokens, so missing or invalid tab credentials cannot fall back to another tab's account. `JWT_SECRET` must contain at least 32 characters. Optional `JWT_ISSUER` and `JWT_AUDIENCE` configure token claims.
- This tab-scoped token design exposes the access token to same-origin JavaScript, so an XSS flaw could steal it before expiry. Keep dependencies updated, avoid unsafe HTML, and deploy only over HTTPS. The API also validates token issuer, audience, expiry, and database-backed session version on every authenticated request.
- Set `CLIENT_ORIGIN` to exact trusted frontend origin(s), comma-separated if needed. CORS does not allow credentials or wildcard origins. Development also allows localhost and 127.0.0.1 on Vite's default port.
- Logging out increments that user's session version, invalidating their sessions across tabs and devices. Since revocation is per user, logging out one tab can also sign out another tab using the same account; logging out one of three different accounts does not affect the others. If MongoDB is unavailable, protected writes and logout fail safely.
- After deploying this change, sign in again in each tab. Existing cookie and shared-localStorage sessions are intentionally not migrated because they do not identify an individual tab safely. The frontend removes the old shared token key and never reads authentication tokens from `localStorage`.
- Role checks and resource ownership checks run in Express. Password hashes are excluded from normal user queries and API responses. Admin moderation actions emit structured logs with actor/target IDs and action; configure deployment log access and retention appropriately.
- State-changing browser requests require an allowed `Origin` plus `X-CSRF-Protection: 1`. API, login, and registration rate limits currently use in-memory counters; for multi-instance production deployments, replace the store with a shared rate-limit store.
- Helmet security headers are enabled. Content Security Policy is currently disabled because the existing frontend has not been validated under a restrictive policy.
- Accepting a proposal closes its job before creating the project. A job with an accepted proposal cannot be reopened through client or admin routes.
- Payment is status tracking only. The app does not charge, transfer, hold, or escrow money.
- SkillProof stores URL-based and written evidence, immutable submission history, and reviewer decisions in MongoDB. Statuses distinguish claimed, evidence submitted, reviewed/requested more information, verified, and rejected. A reviewed status is not a verified status.
- Existing comma-separated freelancer profile skills remain self-declared; the SkillProof panel lets the freelancer convert each into an evidence-review claim. Skill claims are unique per freelancer and normalized skill name. If MongoDB automatic index creation is disabled in production, create the model's declared indexes before enabling SkillProof traffic.
- Public verified-skill data contains only the skill, evidence category, and review date. Private evidence URLs and reviewer feedback are visible only to the freelancer and Admin. Admin review actions use an atomic status transition to prevent competing decisions.
- SkillProof does not upload or store files and does not fetch evidence URLs from the server. Reviewers open links themselves. A verified badge confirms review of the submitted evidence, not independent verification of all work or a guarantee of performance.
- Saved job bookmarks remain local to the browser.
- Password reset/recovery is not implemented; no email/token delivery system is configured.
- Authentication regression tests use mocked Mongoose models and do not verify MongoDB Atlas connectivity or database-backed end-to-end account flows.
- The working directory was provided without a Git repository. Initialize Git before committing changes; the new root `.gitignore` excludes dependencies, build output, logs, and environment files.

## Checks

```powershell
cd client
npm run lint
npm run build
```

Run the backend authentication and authorization regression suite (it uses mocked models and does not connect to MongoDB):

```powershell
cd server
npm test
```

The `test-db` script is intentionally not part of `npm test`. The app has not been run against MongoDB as part of this change.
