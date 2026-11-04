# Kingdom Come to Crime RPG: System Equivalency Master Sheet

Status: DESIGN REFERENCE ONLY. No code fork, deployment, formula change or production mutation is authorized by this document.

## Owner's guiding rules
- Develop a distinct original mafia/crime RPG with classic iMobsters-style mechanics and modern original artwork/branding.
- Finish/stabilize Kingdom Come first, then fork a pinned stable codebase into a **separate repository, Railway project and database**.
- Keep the existing Kingdom Come tab/navigation structure unchanged in the first transfer. No home-screen redesign or casino tile screen conversion during isolation.
- Verify identical working baseline before rebalancing formulas, then replace content and artwork.
- Preserve mechanics where possible, but do not assume economic equivalence: research jobs, income cadence, upkeep, combat, and level scaling.
- Historical iMobsters screenshots are references only; do not reuse protected graphics or copied text.

## System mappings
| Kingdom Come system | Crime RPG equivalent | Adaptation note |
| --- | --- | --- |
| Army recruitment | Mob recruitment | Same invite/join foundation; mafia language; review mob participation caps |
| Army count / allies | Mob size / crew members | Keep current recruitment UI initially |
| Weapons | Firearms and melee weapons | Retheme item names/art, revisit level gates and combat values |
| Armor | Protective gear | Vests, outfits and other defensive equipment; preserve slot logic initially |
| Spells | Vehicles or special equipment | Present as vehicles/gear, retain third combat slot until design is confirmed |
| Armory | Equipment shop | Existing Buy/Sell/Owned structure; preserve navigation |
| Land | Real estate / businesses | Income properties; prices, payout cadence and scaling need separate formula work |
| Land ownership | Property holdings | Same ownership ledger, independent game database |
| Income cycle | Cash-flow payout timer | Research payout interval and return-on-investment curves |
| Gold | Cash | Replace display terminology, NOT simply multiply values by a constant |
| Income / upkeep | Cash flow / operating costs | Property revenue minus equipment upkeep |
| Equipment upkeep | Equipment upkeep | Consider negative-cash-flow behavior, including any automatic-sale policy only after deliberate approval |
| Quests | Crimes / jobs | Energy costs, rewards, requirements and XP rebalance |
| Quest rewards | Job payout / experience | Separate money and XP tuning |
| Health | Health | Keep resource logic |
| Energy | Energy | Fuels jobs |
| Stamina | Stamina | Fuels fights |
| Level / XP | Level / XP | Keep progression foundation; rebalance pacing |
| Player stats | Attack / defense / health / energy / stamina | Investigate actual iMobsters point assignment before changing |
| Rivals | Rival mobsters | Maintain rival discovery and attack navigation |
| PvP battles | Mob fights | Combat formulas and mob/equipment contribution require research |
| Battle records | Fight history | Victories, defeats, payouts and retaliation |
| Bounties | Hit list | Retheme posting, claiming and notifications |
| Leaderboards | Top crime bosses | Rank by appropriate existing metrics pending approval |
| Profile | Mobster profile | Alias, avatar, level, stats and possessions |
| Invitations / army code | Mob invitations / mob code | Preserve privacy and current anti-spam rules until reviewed |
| Bank / treasury | Bank / cash deposits | Include only if underlying mechanics exist or are separately specified |
| Healing | Hospital | Restore health, preserve current implementation initially |
| Premium currency / shop | Favor points or original branded premium currency | Require separate economic, policy and naming decisions |
| Notifications | Fight / hit-list / recruitment alerts | Preserve backend notification flow |
| Bots / simulated opponents | NPC mobsters / simulated rivals | Isolated synthetic users; no Kingdom Come player data |
| Admin / operator tools | Crime RPG administration | Strictly separate accounts, credentials and permissions |
| Visual equipment art | Original crime-themed item illustrations | Original visual identity, thumbnail legibility |
| Castle / fantasy environments | Urban / noir crime setting | Theme only; do not redesign tab layout in first clone |

## Historical screenshot findings (unverified game-wide)
- Home screenshots show cash, level/XP, health/energy/stamina, mob count/code, missions, attacks, equipment and real estate.
- Real estate screenshots show buy/sell, owned quantity, income per property, and one instance of a payout every 50 minutes.
- Equipment shows attack/defense, quantity owned and upkeep.
- One screenshot displays a negative cash-flow warning mentioning equipment liquidation; this is evidence for later research, not an automatic requirement.
- A different iMobsters version shows a casino-like icon grid. Do NOT adopt this as the initial target navigation.
- Screenshot price/income numbers are examples, not established universal formulas.

## Recommended execution stages
1. Pin/approve stable Kingdom Come source.
2. Produce isolated code copy with fresh database, independent secrets, workers and deployments; block production endpoints.
3. Pass baseline tests without gameplay or UI restructuring.
4. Replace naming and content in deliberate batches, preserving existing tabs.
5. Research and modify formulas behind configuration and automated test fixtures.
6. Integrate original art and run end-to-end mobile tests; require explicit owner approval before release.

This sheet is a conceptual mapping, not confirmation that every listed feature already exists in Kingdom Come.
