# Paced before/after sessions

Fixed seed49101. Each arrow is baseline → calibrated; gold is actual ordinary loot transferred, not profit after healing/upkeep. Human gear/army stay fixed during each session; ordinary level-up/resource rules still apply. Both sides assert finite-purse conservation and unchanged Vaults. Natural and equipped10 refer to the accepted paced fixtures, not the separate static21-member benchmark. Full resource/blocking data: sessions.json.

|Start level|Hours|Player gear|Wins/losses|End level|Gold transferred|XP|Paid healing gold|Natural Spirit|Level-up Spirit refills|
|---:|---:|---|---|---|---|---|---|---|---|
|8|1|natural|35/1 → 31/5|8 → 8|3478 → 3193|69 → 57|0 → 0|33 → 33|0 → 0|
|8|1|equipped10|36/0 → 36/0|8 → 8|2418 → 4109|38 → 36|0 → 0|33 → 33|0 → 0|
|8|2|natural|67/2 → 59/10|8 → 8|5883 → 5702|112 → 95|0 → 0|66 → 66|0 → 0|
|8|2|equipped10|69/0 → 69/0|8 → 8|3942 → 7460|71 → 69|0 → 0|66 → 66|0 → 0|
|8|6|natural|203/2 → 178/27|9 → 9|13550 → 13133|298 → 258|0 → 0|199 → 199|3 → 3|
|8|6|equipped10|205/0 → 205/0|9 → 9|12886 → 20266|219 → 205|0 → 0|199 → 199|3 → 3|
|17|1|natural|30/8 → 32/6|18 → 18|7613 → 8336|709 → 844|198 → 162|32 → 33|3 → 3|
|17|1|equipped10|38/0 → 38/0|18 → 18|16424 → 16040|799 → 704|0 → 0|33 → 32|3 → 3|
|17|2|natural|59/15 → 63/11|19 → 19|14532 → 15902|1312 → 1545|398 → 162|65 → 66|6 → 6|
|17|2|equipped10|74/0 → 74/0|19 → 19|32201 → 32408|1525 → 1348|0 → 0|65 → 65|6 → 6|
|17|6|natural|200/26 → 188/35|27 → 25|85187 → 64853|7204 → 6143|578 → 681|196 → 196|30 → 24|
|17|6|equipped10|200/31 → 226/0|28 → 26|144823 → 145049|8451 → 6764|1059 → 0|195 → 196|33 → 27|
|25|1|natural|18/18 → 19/19|25 → 26|9647 → 12765|852 → 1124|1098 → 783|33 → 32|0 → 3|
|25|1|equipped10|38/3 → 38/0|27 → 26|38103 → 39088|2120 → 1767|0 → 0|32 → 32|6 → 3|
|25|2|natural|51/23 → 45/29|27 → 27|27393 → 26516|2238 → 2565|1347 → 1290|65 → 65|6 → 6|
|25|2|equipped10|73/4 → 76/0|28 → 28|71908 → 82674|3675 → 3513|0 → 0|65 → 65|9 → 9|
|25|6|natural|172/51 → 138/85|33 → 33|143118 → 108441|8755 → 8553|2725 → 4407|196 → 196|24 → 24|
|25|6|equipped10|217/19 → 230/8|38 → 39|308471 → 380445|15391 → 17307|300 → 328|195 → 194|39 → 42|
|40|1|natural|19/17 → 22/16|40 → 41|28751 → 44176|1474 → 2572|1524 → 1228|33 → 32|0 → 3|
|40|1|equipped10|29/9 → 41/0|41 → 42|62883 → 112821|2803 → 4555|696 → 0|32 → 32|3 → 6|
|40|2|natural|47/27 → 54/23|42 → 43|83966 → 106472|3761 → 5895|2434 → 1643|65 → 65|6 → 9|
|40|2|equipped10|67/10 → 78/0|43 → 44|147565 → 191773|5439 → 6654|696 → 0|65 → 65|9 → 12|
|40|6|natural|160/58 → 167/54|46 → 47|281453 → 327988|10296 → 13180|5689 → 3918|197 → 197|18 → 21|
|40|6|equipped10|193/28 → 223/0|47 → 48|378860 → 502493|12735 → 15300|2046 → 0|197 → 197|21 → 24|
|50|1|natural|35/3 → 29/9|51 → 51|85137 → 79569|2525 → 2495|0 → 890|32 → 32|3 → 3|
|50|1|equipped10|29/7 → 38/0|51 → 51|76587 → 106054|2015 → 2135|450 → 0|33 → 33|3 → 3|
|50|2|natural|62/9 → 63/9|51 → 51|143243 → 153051|3795 → 3976|510 → 890|66 → 66|3 → 3|
|50|2|equipped10|60/12 → 72/0|51 → 51|155829 → 188945|3472 → 3540|948 → 0|66 → 66|3 → 3|
|50|6|natural|193/17 → 196/17|53 → 54|385372 → 442058|8096 → 9742|510 → 890|198 → 198|9 → 12|
|50|6|equipped10|181/29 → 210/0|53 → 53|391683 → 423765|7759 → 6891|2592 → 0|198 → 198|9 → 9|

## Sustained targeting and multiple accounts

Ten players are simulated sequentially at each clock tick against one shared finite purse/Health pool. This is adversarial shared-target pressure, not a fair multiplayer scheduler or a substitute for PostgreSQL locking tests. Six active hours, level17, six-second attempts, Spirit capacity10.

|Players|Wins/losses|Gold transferred|XP|Knockouts|Blocked by target Health|Largest pair victory count|Final levels|
|---:|---|---|---|---|---|---|---|
|1|124/1 → 125/3|7300 → 13464|1489 → 1035|120 → 120|3475 → 3472|124 → 125|19 → 18|
|10|124/1 → 125/3|7446 → 13847|1569 → 1126|120 → 120|35875 → 35872|119 → 117|19,17,17,17,17,17,17,17,17,17 → 18,17,17,17,17,17,17,17,17,17|
