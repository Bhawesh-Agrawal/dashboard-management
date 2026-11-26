<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Database & Safety Rules

- **Never** run commands that reset, drop, truncate, or bulk-delete database data (`prisma migrate reset`, `prisma db push --force-reset`, `DROP`, `TRUNCATE`, mass `DELETE`) without explicitly asking the owner first.
- **Never** run commands that connect to the database unless the owner explicitly asked for that step.
- Schema changes must be **additive only** (new tables, new nullable columns, new indexes).
- Unit/integration tests must use mocks/fakes, never the real database.
