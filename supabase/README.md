# Supabase setup

The database schema lives in `migrations/` as a timestamped migration:
`20260606000000_init.sql`.

## Apply it — pick one path

### A) Hosted project (simplest to start)

1. Create a project at https://supabase.com (free tier is fine).
2. **Project Settings → API**: copy the Project URL and the `anon` public key
   into the app's `.env.local` (see `.env.example` in the repo root).
3. Apply the migration, either:
   - **Dashboard:** open SQL Editor → New query → paste the contents of
     `migrations/20260606000000_init.sql` → Run. Or
   - **CLI:** link and push:
     ```bash
     npx supabase login
     npx supabase link --project-ref <your-project-ref>
     npx supabase db push
     ```

### B) Local stack (Docker required)

```bash
npx supabase start          # boots Postgres + Auth + Studio locally
npx supabase migration up   # applies migrations/ to the local db
```

`supabase start` prints a local API URL and anon key — use those in
`.env.local` for local development.

## Adding future changes

Create a new migration and edit it, then push:

```bash
npx supabase migration new <name>
# edit the new file under migrations/
npx supabase db push          # hosted   (or)  migration up  # local
```
