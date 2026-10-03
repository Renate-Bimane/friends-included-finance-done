# Friends Included Finance

This is the corrective source package for the Day 4 assignment. It restores real Vercel functions for website intake, manager decisions, totals, and delivery retry. The prior public page was a static substitute and must not be reused.

## Before deployment

1. In Supabase, run `supabase-schema.sql` in the SQL editor.
2. Create a Google Sheet with `Sales` and `Expenses` tabs. Share it as Editor with the service-account email.
3. In Vercel, add each value from `.env.example` as an environment variable. Replace every placeholder; keep service keys and bot token secret.
4. Deploy this entire folder as the GitHub repository root. Vercel automatically exposes `/api/transaction`, `/api/decision`, `/api/retry`, and `/api/summary`.
5. Set the Telegram webhook to `https://YOUR-VERCEL-URL/api/telegram` only after the webhook implementation is connected to the same Supabase database. Do not use the previous bot endpoint: it sent acknowledgements without saving transactions.

## Controls implemented in this revision

- Only Richard, Anastasia, and Jean-Claude can submit sales in the demonstration role flow.
- Only Kevin can submit expenses.
- Only Svetlana can submit manager decisions; the server rejects a decision from any other role.
- References are unique; repeat approvals return without re-creating commissions.
- Approved sales alone contribute income and commissions; all expenses contribute to company result.
- The supplied commission allocator rounds in cents and has deterministic ties.

## Required final verification

Do not submit a Vercel URL until these are visibly confirmed on that deployed URL:

1. S01 and E01 originate in the real Telegram bot and appear exactly once in Supabase, the website, and the Sheet.
2. The two supplied tests produce company result EUR 3,930.00, Project A EUR 2,050.00, Project B EUR 2,180.00, and commissions EUR 140.00 / EUR 175.00 / EUR 215.00.
3. S05 remains pending and E07 remains awaiting allocation.
4. A non-manager approval and all invalid/duplicate submissions are rejected without changing totals.

The package deliberately contains no credentials.
