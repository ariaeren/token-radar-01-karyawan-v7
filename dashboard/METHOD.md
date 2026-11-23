# TOKEN RADAR v7 — method and assumptions

The page reads one frozen DefiLlama snapshot through `../data.js`. The program
that writes it is `main.ts`; the arithmetic lives in `lib/model.ts`. No name,
ticker or slug is special-cased anywhere in the score.

## Coverage

The snapshot holds 758 protocols at or above $5M TVL. Of those, 342 record no
token. Applying the snapshot guide's own exclusions to all of them — no CEX,
no versioned release, no bridge, liquid-staking, wrapped, staked or exchange
product — leaves 198 protocols with no token recorded. Every one is ranked.
All 40 watchlist slugs are in that set: **40/40 coverage, floor never ceiling**.

The 40 largest token-bearing protocols that pass the same exclusions are shown
as a separate TRADING band. They are market references, not candidates. Their
board value is `min(market cap / 10,000, cap)`, where `cap` is half the weakest
upcoming row, so a live token can never take a top rank.

## The value model

`calibrate()` derives both open numbers from the snapshot:

- `base = median(mcap_usd / tvl_usd)` of trading rows with ratios between
  0.02× and 5× (104 rows in this snapshot). It prints as 0.2748× on the page.
- `fallback_age = median(as_of − listed_at)` of dated pre-token rows, used only
  when a protocol has no tracking date (516 days here).

`impliedValue()` then scores every upcoming row:

```
growth_pct      = clamp(change_7d, -40, +80)
growth_mult     = 1 + growth_pct / 100 * 0.70
maturity_mult   = 0.70 + 0.55 * sqrt(min(age, 1460) / 1460)
implied_usd     = round(tvl_usd * base * growth_mult * maturity_mult)
```

TVL sets scale, 7-day change sets direction, and tokenless age sets how much
goodwill has accumulated without a token. Growth is clamped so one exceptional
week cannot decide a rank; maturity saturates at four years so age cannot run
away. A null growth reads as 0%, not as a penalty or a bonus. Ties break by
slug, deterministically. The board is sorted by implied value and ranks are
assigned 1..N; the page may re-sort without changing those ranks.

## Farm plans

`farmSteps()` builds six steps from the row's category, chains, TVL and age:

1. dedicated wallet and a $3 first gas reserve;
2. acquire or bridge the principal to the first chain the protocol reports;
3. the category-specific qualifying position (supply, LP, bridge, stake,
   margin, cover or deposit) sized at $50 / $100 / $150 / $250 by TVL depth;
4. one small weekly action, $2 gas, so more than one snapshot sees the wallet;
5. a Friday TVL/approval check with a 30% drawdown pause rule;
6. claim only from the protocol's own published link at day 30/45/60, then log
   wallet, dates and transactions.

Gas and bridge estimates are shown per step and summed in each detail view.
A plan is a procedure, not a promise: no token, reward or airdrop is asserted.

## Reading the page

The KPI strip states coverage, model calibration and the size of the universe.
The formula band prints the exact expression and its assumptions. The rail
filters by status, category, chain, minimum value and free text; headers sort;
any row opens a detail view with the three multiplier bars and the full plan.
Three screenshots show the default board, the rank-1 detail view, and a
filtered Risk Curators / UPCOMING view. All three are rendered from this page.
