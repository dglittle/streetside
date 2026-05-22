# streetside

A little gallery + tip page for art made and sold on the street. Tips go through
**Square Payment Links**; gallery content and the live "who's viewing now"
feature are powered by **Supabase**. Hosted free on **Vercel**.

## Stack

- **Vite** (vanilla JS) — static site, no framework.
- **Supabase** — Postgres for gallery content + Realtime presence for live viewers.
- **Square Payment Links** — each piece links to a Square-hosted payment page (no API keys, no card data on our side).
- **Vercel** — free hosting + the custom domain `streetsi.de`.

## Local development

```bash
npm install
npm run dev
```

Without Supabase configured it runs on built-in sample data so you can see the
layout. To use live data + presence, copy `.env.example` to `.env.local` and fill
in your Supabase URL + anon key.

## Connecting Supabase

1. Create a free project at https://supabase.com (no credit card).
2. In the dashboard: **SQL Editor → New query**, paste `supabase-schema.sql`, Run.
3. **Project Settings → API**: copy the Project URL and the `anon` public key into `.env.local`.
4. Edit/add art pieces in **Table editor → art_pieces**. Put each piece's Square Payment Link in the `payment_link` column.

## Square Payment Links

Create them in your Square Dashboard (Online → Payment Links / Checkout links),
or in the Square app. Paste each link into the matching row's `payment_link`.

## Deploy

```bash
vercel        # first run links/creates the Vercel project
vercel --prod # production deploy
```

Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Environment Variables in
the Vercel project settings, then connect the `streetsi.de` domain (DNS records
are added in Squarespace).
