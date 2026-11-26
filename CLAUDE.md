@AGENTS.md

- Never run commands that reset, drop, truncate, or bulk-delete database data (`migrate reset`, `db push --force-reset`, `DROP`, `TRUNCATE`, mass `DELETE`) without asking the owner.
- Never run commands that connect to the database unless the owner asked for that step.
