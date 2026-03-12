This is a private admin dashboard built with Next.js.

## Environment

Create `.env.local` from `.env.example` and set at least:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_LOCK_ENABLED`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`

Optional secrets:

- `GEMINI_API_KEY`
- `TELEGRAM_WEBHOOK_URL`
- `SUPABASE_ACCESS_TOKEN`
- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`

## Getting Started

Run the development server:

```bash
npm run dev
```

Open `http://localhost:3000` and sign in with the admin password.

If you want no login on your PC, keep `ADMIN_LOCK_ENABLED=false` locally.
For Railway or any public deployment, set `ADMIN_LOCK_ENABLED=true`.

## Security Notes

- Do not commit `.env.local`.
- Do not hardcode API keys in source files.
- Rotate any key that was previously committed or shared.
- All pages and API routes can be protected by the admin password gate when `ADMIN_LOCK_ENABLED=true`.

## Deployment

Before pushing or deploying, run:

- `npm test`
- `npm run lint`
- `npm run build`

Railway can deploy the app directly from GitHub once the same environment variables are added to the Railway service.
