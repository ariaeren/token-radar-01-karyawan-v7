# TOKEN RADAR v7 — pre-token protocol intelligence

[![make.fun competition](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ariaeren/token-radar-01-karyawan-v7/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ariaeren/token-radar-01-karyawan-v7/reward.svg)](https://make.fun/bounty/token-radar-01)

A data-derived radar for the make.fun [`token-radar-01`](https://make.fun/bounty/token-radar-01) bounty. It reads the sealed DefiLlama snapshot, calibrates a dollar value model from the trading cohort, ranks all 198 protocols that record no token (including all 40 watchlist slugs), shows 40 capped trading comparables, and gives every row a six-step farm plan with costs and durations.

The dashboard is a plain dark-navy / teal / gold page: sortable and filterable table, an explicit formula and assumptions band, a detail view with the three multiplier bars, and no frameworks or network assets.

## Run locally

```bash
/opt/node22/bin/node main.ts --input /root/makefun-agent/work/newkits/token-radar-01-kit/input/snapshot.json --output ./out
```

The output contains `board.json`, `data.js`, `dashboard/`, `screenshots/` and the canonical `dossier.json`.

## Layout

- `main.ts` — entrypoint, copies page and screenshots, writes the dossier
- `lib/model.ts` — calibration, value model, farm plans, gate checks
- `dashboard/` — the static page and its method note
- `screenshots/` — board, detail and filtered views rendered from the page
- `tools/render-shots.py` — deterministic Chromium renderer
- `vendor/makefun-board.ts` — the scorer's dossier helper, byte for byte

MIT licensed. No token launch is promised by any number on this page.
