# Inline board feed — device E2E checklist

Run on Expo / preview APK after Wave A and again after Wave B. Fail any row = fix before shipping.

## Regression (must not break)

- [ ] `guess` / `emoji_guess` in-feed: glass PLAY → answer → swipe locked → result
- [ ] Arcade card (`tap` or `lane_dash`): intro → GameHost (not inline)
- [ ] GameHost HowTo for `memory` / `arrow` still shows **before** play when launched full-screen
- [ ] Feed swipe works when not mid-round
- [ ] Result: Play again / Back to feed / Next game

## New inline boards (each engine)

For `memory`, `arrow_puzzle`, `spot_difference`, `word_search`, `maze`, `connect_dots`:

- [ ] Card shows glass PLAY (not intro-only)
- [ ] PLAY starts round; feed cannot swipe away mid-round
- [ ] Complete first time → HowTo → dismiss → PostGameResultScreen (must not stick on "Board cleared!" / last-answer feedback)
- [ ] Complete second time → straight to result (no HowTo)
- [ ] Fact/Fake & quiz 10/10 Correct → result within ~1s (not stuck on the last card)
- [ ] Leave / swipe-away mid-round → no HowTo mark; idle glass returns
- [ ] Compact UI: board + HUD fit card (no clipped primary controls)

## Pan-specific

- [ ] `word_search` / `maze` / `connect_dots`: drag on board does not scroll feed
- [ ] Idle (glass up): vertical swipe still changes feed cards

## Automated (CI / local)

```bash
pnpm --filter mobile test
npx tsc --noEmit -p apps/mobile/tsconfig.json
```
