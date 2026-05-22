# Admin mode — setup & how it works

A "magic link" gives you (and only you) the power to **add** and **delete** art
pieces from the live site. The link looks like:

```
https://streetsi.de/#k=YOUR_SECRET_PASSWORD
```

When that link loads, the page stores the password in `localStorage`, then
immediately scrubs `#k=...` from the URL/history so the address bar shows a plain
`https://streetsi.de`. Admin controls (a "+ Add a piece" form and per-card
"Delete" buttons, plus "Log out") then appear.

## Why this is actually secure

The password in the browser is **not** the security boundary. Every write goes to
a Supabase **Edge Function** (`admin-action`) that:

1. Holds the `service_role` key server-side (never sent to the browser).
2. Re-checks the password against the `ADMIN_SECRET` server secret on every call.

So even someone who reads the site's source can't add or delete anything — they
don't have the secret, and the only write-capable key lives on the server. The
public `anon` key remains read-only.

## One-time setup

### 1. Database + storage
In Supabase → SQL Editor, run (in order):
- `supabase-schema.sql` (if you haven't already)
- `supabase-admin-setup.sql` — adds `image_path` and the `art-images` storage bucket.

### 2. Install the Supabase CLI & link the project
```bash
npm install -g supabase   # or: brew install supabase/tap/supabase
supabase login            # opens browser
supabase link --project-ref orlyyjfygshepiwqggpv
```

### 3. Choose your admin password and set it as a function secret
Pick a strong, URL-safe password (this is the `YOUR_SECRET_PASSWORD` in the link):
```bash
supabase secrets set ADMIN_SECRET='choose-a-long-random-password'
```
(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically to the function.)

### 4. Deploy the Edge Function
```bash
supabase functions deploy admin-action
```

## Using it

Email yourself (or the artist) the link:
```
https://streetsi.de/#k=choose-a-long-random-password
```
Open it once on the device you'll manage from. Admin mode persists in that
browser until you click **Log out**.

- **Add a piece:** "+ Add a piece" → fill in title/description/suggested tip/Square link, optionally pick an image → Add.
- **Delete a piece:** each card shows a **Delete** button (asks to confirm; also removes the stored image).
- **Log out:** clears the stored password on that device.

## Rotating the password
If a link leaks, just set a new `ADMIN_SECRET` and redeploy — old links stop working:
```bash
supabase secrets set ADMIN_SECRET='a-new-password'
supabase functions deploy admin-action
```
