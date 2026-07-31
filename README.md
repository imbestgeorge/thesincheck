# The Sin Check

React + Vite site with Vercel serverless API routes backed by a Neon Postgres database.

## Environment Variables

Set these locally and in Vercel:

- `DATABASE_URL`: Neon Postgres connection string
- `ADMIN_PASSWORD`: password for `/admin`
- `ADMIN_SESSION_SECRET`: long random string used to sign admin sessions

The API creates the required empty tables automatically on the first request. No starter questions are seeded.

## Local Development

```bash
npm install
cp .env.example .env
npm run dev
```

## Vercel

Use the default Vercel Vite build command:

```bash
npm run build
```

The `api/` directory contains the serverless routes used by Vercel.
