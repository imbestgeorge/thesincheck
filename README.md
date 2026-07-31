# The Sin Check

React + Vite site with Vercel serverless API routes backed by a Neon Postgres database.

## Environment Variables

Set these locally and in Vercel:

- `DATABASE_URL`: Neon Postgres connection string
- `ADMIN_PASSWORD`: password for `/admin`
- `ADMIN_SESSION_SECRET`: long random string used to sign admin sessions
- `QUESTION_IMPORT_TOKEN`: bearer token for `/api/questions/import` bulk automation
- `GEMINI_API_KEY`: Google Gemini API key used by the server-side chatbot
- `GEMINI_MODEL`: Gemini model name, defaults to `gemini-2.0-flash`
- `CHAT_DAILY_LIMIT`: daily chatbot messages per visitor, defaults to `10`
- `CHAT_RATE_LIMIT_SECRET`: long random string used to hash visitor rate-limit keys

The API creates the required empty tables automatically on the first request. No starter questions are seeded.

## Question Import API

Use `POST /api/questions/import` to add questions from n8n. Imported questions are saved as disabled, so they do not show on the public questions page or in chatbot context until they are enabled in `/admin`.

Set `QUESTION_IMPORT_TOKEN` and send it as a bearer token:

```json
{
  "questions": [
    {
      "question": "Is gossip a sin?",
      "answer": "Yes. Gossip damages people with careless or harmful speech."
    }
  ]
}
```

The response includes `success`, `createdCount`, `failedCount`, and per-item `results`. `videoUrl` is optional and defaults to the sample YouTube Short.

## Chatbot

The bottom-left chatbot calls `/api/chat`. The browser never sees the Gemini key; the API route reads `GEMINI_API_KEY` from the server environment and sends the request to Gemini from there.

For each message, the API searches the `sincheck_questions` table for relevant Q&A entries and includes those entries as the highest-priority context in the Gemini prompt. New or edited questions in `/admin` are stored in that same table, so the next matching chat request can use the updated Q&A without retraining or redeploying.

Rate limiting is enforced in Postgres with `sincheck_chat_daily_usage`. Visitors are keyed by a hashed IP address and user agent, and the default limit is 10 messages per UTC day.

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
