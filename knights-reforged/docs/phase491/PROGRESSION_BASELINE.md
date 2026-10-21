# Accepted-policy paced progression baseline

These are seeded offline scenarios, not live telemetry or a new reward policy. See `paced-baseline.json` for full assumptions and resource blocks.
Gold is transferred from real simulated bot purses; property income and equipment/healing costs are journaled in the conservation equation. Gear is fixed during each run. No new army policy is active.

|Start level|Hours|Loadout|End level|Wins/losses|Gold transferred|XP|Healing gold|Upkeep paid (all actors)|Spirit recovered/refilled|End Health/Spirit|
|---:|---:|---|---:|---|---:|---:|---:|---:|---|---|
|1|1|natural|3|34/7|2054|34|0|126082|32/6|84/0|
|1|1|established|3|40/1|2416|40|0|126082|32/6|94/0|
|1|2|natural|4|65/11|3829|65|0|252164|65/9|75/1|
|1|2|established|4|76/1|4708|76|0|252164|65/9|94/0|
|1|6|natural|5|149/63|7779|150|168|756492|198/12|79/1|
|1|6|established|6|213/2|12382|215|0|756492|197/15|100/0|
|5|1|natural|5|36/0|2770|36|0|126085|33/0|94/0|
|5|1|established|5|36/0|3100|36|0|126112|33/0|94/0|
|5|2|natural|6|71/0|5133|71|0|252170|66/3|97/1|
|5|2|established|6|71/0|5879|71|0|252224|66/3|97/1|
|5|6|natural|7|176/31|10198|193|169|756510|199/6|73/1|
|5|6|established|7|207/0|13622|207|0|756672|199/6|97/1|
|8|1|natural|8|36/0|3577|72|0|126091|33/0|94/0|
|8|1|established|8|36/0|2418|38|0|126202|33/0|94/0|
|8|2|natural|8|69/0|6025|116|0|252182|66/0|97/0|
|8|2|established|8|69/0|3942|71|0|252404|66/0|97/0|
|8|6|natural|9|203/2|13532|298|0|756546|199/3|97/0|
|8|6|established|9|205/0|12886|219|0|757212|199/3|100/0|
|15|1|natural|15|24/12|4861|388|358|126145|33/0|94/0|
|15|1|established|15|36/0|8899|345|0|126352|33/0|94/0|
|15|2|natural|16|47/24|10454|855|696|252290|66/3|97/1|
|15|2|established|16|71/0|17650|730|0|252704|66/3|97/1|
|15|6|natural|22|170/50|53754|4169|1218|756870|197/21|70/1|
|15|6|established|22|215/5|91253|4287|0|758112|197/21|50/1|
|17|1|natural|18|29/9|7405|686|180|126163|32/3|79/0|
|17|1|established|18|38/0|16424|799|0|126352|33/3|100/1|
|17|2|natural|19|59/15|14573|1308|344|252326|65/6|88/0|
|17|2|established|19|74/0|32201|1525|0|252704|65/6|97/0|
|17|6|natural|26|198/27|82400|6905|344|756978|196/27|87/1|
|17|6|established|28|206/25|148895|8732|1326|758112|195/33|74/0|
|25|1|natural|26|23/15|13076|1195|861|126238|33/3|95/1|
|25|1|established|27|38/3|38103|2120|0|126612|32/6|71/0|
|25|2|natural|27|54/20|29204|2444|1113|252476|66/6|100/1|
|25|2|established|28|73/4|71908|3675|0|253224|65/9|94/0|
|25|6|natural|33|175/48|143811|8819|2390|757428|197/24|32/1|
|25|6|established|37|212/22|298947|14659|937|759672|195/36|87/0|
|40|1|natural|41|21/15|31687|1641|1108|126562|33/3|100/3|
|40|1|established|41|29/9|63189|2842|392|127222|32/3|100/0|
|40|2|natural|42|52/22|90501|3999|1518|253124|66/6|44/1|
|40|2|established|43|68/9|149613|5548|392|254444|65/9|94/0|
|40|6|natural|46|164/54|285592|10399|5173|759372|197/18|97/0|
|40|6|established|47|190/31|370066|12313|1742|763332|197/21|28/0|
|50|1|natural|51|34/4|81971|2373|490|127000|33/3|95/1|
|50|1|established|51|30/6|78817|2046|490|127822|33/3|100/3|
|50|2|natural|51|64/8|148112|3840|490|254000|66/3|44/0|
|50|2|established|51|61/11|157497|3526|1048|255644|66/3|94/0|
|50|6|natural|53|194/16|387877|8177|1030|762000|198/9|100/0|
|50|6|established|53|181/29|387202|7506|2146|766932|199/9|62/1|

Every run asserts `endingCombined = initialCombined + generatedPropertyGold − upkeepPaid − healingGold`, unchanged Vaults and nonnegative purses. The first and last resolved battles are retained. Losses and resource blocks count; level-up refills cannot be ignored in pacing analysis.
The fixed legal inventories and perfect opponent-selection heuristic are limitations: these are neither novice forecasts nor evidence for changing XP. Long-term accepted 65% policy remains provisional for alpha testing.
