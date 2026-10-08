# Offline package lock recovery

Reused the workspace’s cached exact dependency graph to seed the isolated project lockfile, then ran npm offline to normalize it. `npm ci --ignore-scripts --offline` installed the ReachPay_1 dependency set successfully. The separate package manifest and lockfile are now committed with this project; run `npm ci` after any dependency change.
