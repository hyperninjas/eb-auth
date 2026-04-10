# commerce/ — Medusa v2 backend

This is the Medusa instance the parent **eb-auth** service proxies to
for product/cart/checkout/order operations. It is **not** standalone:

- Identity is owned by **Better Auth** in the parent service. This
  Medusa instance has customer auth providers disabled
  (`http.authMethodsPerActor: { user: ["emailpass"], customer: [] }`)
  and never authenticates storefront users. Customers exist as
  records linked to a Better Auth `user.id` via
  `metadata.external_user_id`.
- Browsers never call this service directly. They go through
  `/api/shop/*` on the parent eb-auth service, which is a
  server-to-server proxy that injects `x-publishable-api-key` and
  attaches the customer to anonymous carts on the user's behalf.

## Versions

- Medusa v2.13.6 (latest stable)
- Node 24 alpine
- Postgres 16, Redis 8 (shared with the parent service)

## First-time setup

```bash
# 1. Bring the stack up. First boot is slow (npm install in the
#    medusa container + db:migrate against a fresh DB).
docker compose up -d

# 2. Create an admin user for the Medusa dashboard. Idempotent —
#    repeat with a different email to add more admins.
docker compose exec medusa npx medusa user --email admin@example.com --password adminadmin

# 3. Open the Medusa admin dashboard:
#       http://localhost:9000/app
#    Log in with the credentials from step 2.

# 4. Create a publishable API key (required by every store API call):
#    Settings → Publishable API Keys → "Create"
#    Bind it to a sales channel (the default is fine).
#    Copy the `pk_...` value.

# 5. Create a secret API token for server-to-server admin calls:
#    Settings → Secret API Keys → "Create" → type: secret
#    Copy the value (shown ONCE).

# 6. Add a product so /api/shop/store/products has something to return:
#    Products → "Create" → fill in title, handle, one variant with
#    a price in your default currency. Publish it.

# 7. Set the four shop env vars in the parent eb-auth `.env`:
#       SHOP_ENABLED=true
#       MEDUSA_URL=http://localhost:9000        # or http://medusa:9000 inside docker
#       MEDUSA_ADMIN_TOKEN=<from step 5>
#       MEDUSA_PUBLISHABLE_KEY=<from step 4>
#       MEDUSA_WEBHOOK_SECRET=<random 32 bytes>
#
#    Restart the eb-auth dev server. Boot logs should print
#       "Shop module enabled"
```

## Existing Postgres volume? (skip the init script)

The init script in `docker/postgres-init/01-create-medusa-db.sql`
creates the `medusa` database, but it only runs on a **fresh**
postgres volume. If you already have a postgres volume from before
the shop integration was added, run this **once** instead:

```bash
docker compose exec postgres createdb -U eb_auth medusa
docker compose up -d medusa  # then start medusa
```

## Day-to-day commands

```bash
docker compose logs -f medusa            # tail logs
docker compose exec medusa sh            # shell inside the container
docker compose exec medusa npx medusa db:migrate   # re-run migrations
docker compose restart medusa            # apply config changes
```

## Adding subscribers / workflows / custom modules

This is where the Medusa-side glue lives — events that need to flow
back to eb-auth (e.g. `order.placed` → POST to /internal/commerce/events
on the parent service) get implemented as Medusa subscribers in:

```
commerce/src/subscribers/<event-family>.ts
```

The pattern (with HMAC verification on the parent side) is documented
in the parent project's CLAUDE.md / module integration notes.

## Removing the shop integration

This service is **optional**. To remove it entirely:

1. `docker compose stop medusa && docker compose rm -f medusa`
2. `docker compose exec postgres dropdb -U eb_auth medusa` (optional)
3. `rm -rf commerce/`
4. Remove the `medusa:` service block from `docker-compose.yml`
5. Remove the volume mount of `./docker/postgres-init` from the
   postgres service in `docker-compose.yml` (or leave it — it's a
   no-op on existing volumes)
6. Follow the detachment recipe in `src/modules/shop/index.ts` to
   remove the parent-side proxy module
