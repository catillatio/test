# Kingdoms Live 1.6.3 offline reference

The supplied APK is preserved as `KingdomsLive-1.6.3.apk`. Its SHA-256 is:

`671e7650511e2c2dbfbd010dd85813e9ec6bf1d77c7c4ca8f459b6d141a1b5e0`

Read [../ORIGINAL_GAME_SPEC.md](../ORIGINAL_GAME_SPEC.md) for findings, evidence levels, navigation, asset placement, mechanics that remain unknown, the prototype comparison, and the proposed implementation order.

- `extracted/`: the unchanged contents of all 60 APK ZIP entries.
- `analysis/decoded/`: readable manifest and all resource XML files.
- `analysis/disassembly/`: all 273 classes, with every method that has code disassembled.
- `analysis/dex-index.json`: complete class, field and method-reference tables.
- `analysis/string-xrefs.json`: literal → defining method and instruction offset references.
- `analysis/resource-table.json`, `resource-id-map.json`: decoded Android resources.
- `analysis/apk-inventory.json`, `image-inventory.json`: file provenance and dimensions.
- `analysis/asset-gallery.html`: all original raster images and audio links, using local files only.
- `analysis/prototype-baseline.json`: SHA-256 hashes of the 63 pre-existing project files, captured before this analysis made additions.
- `analysis/verification.json`: final offline validation and preservation results.
- `tools/`: Python analysis tools; not application/gameplay code.

The tools require Python 3.9 or later and only the standard library. From the project root:

```bash
PYTHONDONTWRITEBYTECODE=1 python original-reference/tools/analyze.py
PYTHONDONTWRITEBYTECODE=1 python original-reference/tools/assets.py
PYTHONDONTWRITEBYTECODE=1 python original-reference/tools/verify.py
```

The tools read the already extracted APK. They never run it, request network resources, or contact any historical service. `analyze.py` writes analysis artifacts only; `assets.py` writes the image inventory and local gallery; `verify.py` writes its verification report and returns a nonzero exit code on failure. None writes application source, migrations, public assets, or gameplay data. Keep the original baseline file unchanged so later verification still detects any edits to pre-existing files.

`dex_reader.py` and `android_binary.py` were adapted from the offline readers already used in this workspace for the separate Knights Reforged analysis. They decode DEX 035 instructions and this APK's Android binary formats. Their output is disassembly, not original Java source. Structural checks do not replace an Android runtime verifier or establish server behavior.

Useful disassembly anchors:

- `com/storm8/kingdoms12/Main.dex.txt`: `getTabButtons`, `onOptionsItemSelected`, `getHostPrefix`, background getters.
- `com/storm8/base/Storm8MainActivity.dex.txt`: `onCreate`, `checkPlayerlogin`, `loadPage`, `refreshTabBar`, `onKeyDown`, `onCreateOptionsMenu`.
- `com/storm8/base/Storm8WebViewClient.dex.txt`: `shouldOverrideUrlLoading`, `getSessionToken`, residual hashing helpers.
- `com/storm8/base/Storm8WebViewClient$2.dex.txt`: exact page-background selection.

Two cautions matter when reading the output: the Land menu resource/handler exists, but `onCreateOptionsMenu()` returns false; the request hash helper exists, but its loading entry point has no identified invocation. Definitions must not be confused with proven live navigation or wire traffic.

There are no recovered original item prices, Land yields, upkeep fees, mission rewards, healing/banking fees, or combat formulas. The 60-minute Land income cycle is documented as player recollection. The existing prototype's rules remain unchanged and provisional.
