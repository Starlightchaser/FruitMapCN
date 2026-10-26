# FruitMapCN

- Product: desktop web app for seasonal Chinese fruit exploration. Mobile layout is outside the current scope.
- Keep raw imported rows intact. Rebuild derived curation separately; preserve UID and month evidence status. Do not invent fruit varieties, flavors, locations or sources.
- Never commit business databases, workbooks, evidence manifests, backups, reports, old HTML data or conversation logs. The public release is source-only; allow only reviewed documentation and screenshot fragments.
- Preserve the original DataV geometry and source metadata. Do not assert public map approval before verification.
- Backend: `cd backend` then `..\.venv\Scripts\python.exe -m pytest -q`. Frontend: `pnpm test`, `pnpm run typecheck`, `pnpm run build` in `frontend`.
- Before release run `python scripts/check_release.py` on the staged tree and validate the source archive. No raw business data is required for public tests; two private-workbook checks may skip.
- Keep README concise; detailed usage, data operations and development instructions live in the reviewed `docs/` files.
