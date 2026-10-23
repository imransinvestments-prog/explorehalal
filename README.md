# explorehalal

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_tpx7P2wWfCbSc6Bq2ln9LpXFwFI7)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

Run the checks with `pnpm test` and `pnpm typecheck`.

## Admin sign-in

The `/admin` area needs two environment variables (in `.env.local` locally and in Vercel):

| Variable | Purpose |
| --- | --- |
| `ADMIN_PASSWORD` | The shared admin password. |
| `ADMIN_SESSION_SECRET` | Signs admin session cookies. At least 32 random characters, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |

If either is missing, admin sign-in is disabled. Changing either one signs out every admin session.

## Database migrations

The database schema lives in `supabase/migrations/`, starting from
`20261023000000_baseline.sql` (a snapshot of production). Every schema change is a new
file named `<YYYYMMDDHHMMSS>_<description>.sql`.

1. Add `SUPABASE_DB_URL` (the **Session pooler** connection string from the Supabase
   dashboard's **Connect** dialog) to `.env.local` for the target project.
2. Rehearse new migrations on a throwaway local PostgreSQL 17 database first (there is no
   hosted staging project). `supabase/local/supabase-stubs.sql` stands in for the
   Supabase-managed roles, `auth.users` and `auth.uid()`:

   ```bash
   initdb -D ../explorehalal-pgdata -U postgres -A trust --no-locale
   pg_ctl -D ../explorehalal-pgdata -o "-p 54329" -w start
   psql postgresql://postgres@localhost:54329/postgres -v ON_ERROR_STOP=1 \
     -f supabase/local/supabase-stubs.sql
   # then every file in supabase/migrations/, oldest first, with --single-transaction
   ```

   This checks the SQL, not the app: Supabase Auth and Storage are not available locally.
3. Apply them to production after taking a backup:

   ```bash
   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/<file>.sql
   ```

Never edit a migration that has already been applied; add a new one instead.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.
