# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/helloESA/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/helloESA/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Debut Radar — a token launch radar: it reads a sealed DefiLlama snapshot of 758 protocols, finds the ones that record no token yet, and ranks every pre-token protocol with at least $10M of TVL (273 rows, the whole 40-protocol watchlist included) by an implied launch value built only from the snapshot's own figures — TVL times a category multiple taken from already-traded peers' median market-cap/TVL (shrunk toward the global median), adjusted for 7-day growth and for how long the protocol has run with no token. Each row carries a concrete five-step farm plan with costs and times, and the static dashboard renders the board with search, chain/category filters, a watchlist toggle, four sort orders, a per-protocol detail view that shows the model's working, and a peer panel of the largest already-launched protocols the multiples come from.

## Run it

The grader mounts the sealed snapshot at `/input`, which is the program's default. Locally, pass any copy of the kit's snapshot with `--input`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=B7EADW86&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
