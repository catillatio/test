# Financial, rarity and storage decisions

## Capital — pending, not inferred approval

Exact manifest remains `level100-rivals-1`, 450 new identities plus 450 original,
canonical digest `a19d53de3afe393ca6999ddb6e721bee8944195716f2a95f102dfabdb5cb5ae0`.
Finite proposed capital **3,701,553,498 Gold-equivalent**:
24,013,536 wallet + 9,071,344 prepaid upkeep + 2,317,207,570 equipment paid cost
+ 1,351,261,048 Land paid cost. This is not 3.7B freely transferable wallet gold,
but owned Land generates new currency indefinitely. Initial property net before
gear is **15,072,095/h**, equipment upkeep **9,071,344/h**, surplus **6,000,751/h**
(~144M/day). Avoid treating only the small initial wallets as the inflation risk.

Reuse the [existing capital alternatives](../level100-launch/capitalization.json)
and [7/30-day models](../level100-launch/autonomy.json); no financial policy was
changed or re-simulated for a name/art remap. At 30 days, fixed-level isolated
finance modeled ~12.369B Land income, ~6.597B upkeep and ~5.677B final liquid/prepaid
currency, with 4,605 equipment and 12,914 Land purchases, ~127.84M spent. **169 bots
showed no combat-gear improvement**; ownership limits, conservative spend and
savings can stall useful gear upgrades; some bots are already well equipped. This is a potential beta balance problem,
not permission to change allowances or auto-fund them. Model limitations: static
levels, separate SQL duel tests, no claim that duels/player demand offset passive
issuance. Attacked/outage scenarios conserved actual losses; they did not eliminate
inflation. Recommend approve capital only together with a monitored purchases-only
period and explicit currency/storage stop thresholds. A different candidate needs
a new reviewed immutable manifest, not edits to this one.

Sample fixed-level 30-day results (same immutable manifest, not new live funding):

| Level / tier | Wallet before → after | Equipment copies before → after | Gear / Land buys |
|---|---:|---:|---:|
| 51 green | 6,432 → 1,695,325 | 81 → 91 | 10 / 39 |
| 51 seasoned | 22,752 → 7,185,356 | 216 → 216 | 0 / 49 |
| 100 green | 33,120 → 7,753,165 | 162 → 162 | 0 / 28 |

These distinguish real useful development from purse accumulation. The last row
is not a full-capacity army; zero gear buys is not evidence that every possible
upgrade is unaffordable. Keep this as a monitored alpha limitation, without
raising spending or changing the approved manifest in this presentation PR.

## Rarity — recommend retain proposal, launch disabled

The existing pending **500 ppm / 0.05% per listed item per eligible completion**
means mean 2,000 eligible quests per copy, median 1,386. Minimum character level is
71; first current eligible quest unlock is 74. These are eligible completions,
not all quests, and require actual Mana/equipment/army/loot prerequisites.

| Daily eligible completions per listed item | Expected copies in 90 days | At least one in 90 days | Mean days per copy |
|---:|---:|---:|---:|
| 5 (casual eligible play) | 0.225 | 20.2% | 400 |
| 10 | 0.450 | 36.2% | 200 |
| 15 (focused eligible play) | 0.675 | 49.1% | 133.3 |

Intensive upper bound: 60 eligible completions/day gives 2.7 expected copies and
93.3% chance over 90 days for one listed item, mean 33.3 days/copy. It is a
sensitivity scenario, not a guaranteed attainable session rate. At the final
quest with all three draws, expectation is three times the single-item value;
chance of any of the set must use all three independent draws. A whole fighting
army cannot be cheaply filled from these rates. No pity/purchase alternative,
HUD set inflation or free resale value was introduced. Ordinary upkeep remains.

Recommendation: retain 500 ppm as a very-rare **proposal**, collect beta completion
rates, and start `rareDrops=false`. The existing immutable policy says pending;
even a cutover flag cannot override that guard. A separately approved new immutable
rarity version is required before enabling. Hudson's one-time allocation is a
separate owner grant, never a drop-rate or account-name exception.

## Fresh read-only storage evidence — 2026-10-25 UTC

[Machine-readable provider observation](storage-observation.json). Railway OAuth
metadata and disk metrics only; no SQL, credentials, variable values or mutations.
Project/environment/service identity was resolved exactly. Both mounted volumes
are live and configured **5,000 MB**. One-hour latest samples:

| Service | Latest disk GB | One-hour maximum GB | Nominal remaining at 5 GB |
|---|---:|---:|---:|
| Production Postgres | 0.855908352 | 0.855908352 | ~4.144 |
| KingdomReleaseCopy | 2.895003648 | 2.956312576 | ~2.105 |

These are provider metric samples, not PostgreSQL database inventories or exact
filesystem `df` values. Zero samples in the window are not trusted as freed space.
Do not reuse pre-cleanup 2.33GB/16-copy measurements. Current OIDs, WAL, active
references, emergency recovery artifact validity and per-database allocation are
**unverified**, because no private SQL/operator inspection was performed here.
There were no staged configuration changes at observation time.

Existing local journal estimate: ~11.1M rows/month with 900 bots, ~1.8GB/month
including local index/row overhead, before duel/other history/bloat/WAL. Thus a
5GB recovery volume is not a sustainable signoff: 2.895 existing + one future
~(0.856+1.8)GB month-one source-equivalent copy already exceeds 5GB before WAL.
Dump compression cannot be used as restored-database size. Retaining multiple
future copies compounds that growth.

**Capacity recommendation for owner review:** at least **10GB production** for a
30–90-day observed beta and **20GB recovery** if retaining two copies at a possible
90-day ~6.3GB source, plus current allocation, WAL/migration/safety headroom. Refit
these numbers with real inventory and measured growth; these are not approved
resizes or guarantees. With only one short-horizon retained copy, a smaller recovery
budget may suffice but requires separately reviewed retention/coordination; this
PR does not enable PR #25, delete copies or assume cleanup. Stage autonomy to bound
writes; watch daily disk growth and 25% free-space reserve. Re-evaluate before
every independent restore and after population append.

### Minimal owner-only preflight through existing private Console

No infrastructure change or workflow repurposing is required. In each PostgreSQL
service's existing authenticated private Console, use an already authorized local
`psql` session (never paste credentials). The following are read-only:

```sql
BEGIN READ ONLY;
SELECT oid, datname, pg_get_userbyid(datdba) AS owner,
       pg_database_size(oid) AS bytes,
       (SELECT count(*) FROM pg_stat_activity a WHERE a.datid=d.oid) AS connections
FROM pg_database d ORDER BY bytes DESC;
SELECT coalesce(sum(size),0) AS wal_bytes FROM pg_ls_waldir();
COMMIT;
```

If WAL listing is not permitted, record UNVERIFIED; do not broaden grants. Obtain
filesystem/volume used/free via existing Console/provider telemetry, and reconcile
retained exact DB/OIDs/cluster/release/artifact references through prior retention
procedure. Inspect current protected GitHub recovery artifact ID, run/attempt,
manifest/cipher hashes, expiry and offline key/decryption evidence through the
existing owner release process. No fresh production artifact was fabricated or
certified here. A missing/expired backup or insufficient headroom blocks promotion.
