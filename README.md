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

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.
