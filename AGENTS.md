## Agent skills

### Issue tracker

GitHub issues for this repo, through `gh`. Specs and tickets carry the `ready-for-agent` label. See `docs/issue-tracker.md`.

### Domain docs

Single context: `GLOSSARY.md` at the root for the glossary, `docs/adr/` for decisions. Use the glossary's terms; flag any conflict with an ADR.

### Live server and data

- `anansi.service` serves this checkout live to Seth and Kia: HTTPS 5174 (`curl -sk https://127.0.0.1:5174/`), library `anansi.db`. Web files go live on save; server code needs `systemctl --user restart anansi`.
- Never do experimental work in this checkout: one sibling worktree per piece, `test/all.ts` green, then fast-forward `main`. Merge, push and restart only on Seth's word, given per piece.
- Before every merge, back up: `node -e "new (require('node:sqlite').DatabaseSync)('anansi.db',{readOnly:true}).exec(\"VACUUM INTO 'backups/pre-<what>-<date>.db'\")"`. Pre-merge snapshots older than four days may go.
- Before a restart both numbers must be 0 (a hem running, prose in the last 2 min; a stream in flight is cut and leaves no row): `node -e "const d=new (require('node:sqlite').DatabaseSync)('anansi.db',{readOnly:true}); console.log(d.prepare('select count(*) n from hems where finished_at is null').get().n, d.prepare('select count(*) n from generations where created_at > ?').get(Date.now()-120000).n)"`
- Traps that broke sessions before: `docs/traps.md`.
