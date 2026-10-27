# Approved compact classic UI refresh

Baseline: `d100a9a03b413b1947d1606db7c73cd37be278e3` on `release/production`. Branch: `feature/premium-classic-ui`. This continues the owner-approved compact Land correction across the existing game; no new layout framework or dependency is introduced.

## Shared system

`public/ui-components.css` owns the satin-bronze primary and dark-metal secondary finish, muted destructive accents, readable disabled controls, keyboard focus and distinct busy feedback. Existing gold/outline class names remain supported; primary/secondary aliases are available. A shared font token retains contextual button sizing. Twenty superseded common control-paint rules were retired, with no new `!important` overrides.

The charcoal palette removes green/teal UI surfaces, including resource backgrounds. Original red/blue/gold icons and functional progress indicators remain. Existing castle/environment and equipment/property artwork is unchanged. Input, tab, section, notice, inventory-preview and panel finishes now share restrained borders and highlights.

Home menus use less unnecessary desktop height; Quest spacing is tighter; Battle and bounty actions use the same finish; Armory and Land keep their original row structures and artwork sizes. Profiles, Recruit, Rankings, Vault, Settings, receipts and confirmations inherit the shared components. Empty recruitment feedback space and a redundant nested form border are removed. Desktop confirmation buttons are bounded rather than stretched. Vault policy remains available through a native disclosure beside unchanged balances and forms.

Land retains the approved compact net-income/payment summary, expandable accounting and byte-identical property-row template segment. The earlier enlarged-art/rearranged-row exploration is excluded.

## Before and after

| Screen | Before | After |
|---|---|---|
| Home, 390px | [Before](screenshots/before-390-home.png) | [After](screenshots/after-390-home.png) |
| Armory, 390px | [Before](screenshots/before-390-armory.png) | [After](screenshots/after-390-armory.png) |
| Profile, 1280px | [Before](screenshots/before-1280-profile.png) | [After](screenshots/after-1280-profile.png) |
| Attack Rivals, 1280px | [Before](screenshots/before-1280-rivals.png) | [After](screenshots/after-1280-rivals.png) |

The delivery includes a portable gallery and all **68 screenshots**: before/after mobile and desktop for 17 screens (Home, Quests, Rivals, Bounties, Report, Armory, Bulk, Land, own/public Profile, Recruit, Army, Rankings, Vault, Settings, receipt and confirmation). The exact-commit CI browser artifact also contains the complete after set.

All captures use native localhost Fastify/EJS and disposable PostgreSQL with actual registered accounts, purchases, holdings, paid contracts and saved combat. Before and after share the same prepared database. Data is synthetic and no production system is contacted. No screenshot editing, DOM art replacement or original-game assets are used.

## Verification

The CI-registered browser test exercises **119 responsive views** at 320/360/390/430/768/1280px, DPR 1/2/3 and 150% text, with long Unicode names and a large treasury. Local baseline comparison verifies all form fields, financial text, artwork references, dimensions, aspect/crop settings and compact row heights. Land row heights remain exact. All 119 baseline comparisons pass, with no green/teal UI backgrounds, horizontal overflow or footer content hidden by navigation. More than 1,000 primary finish checks confirm consistent material, typography and states.

Native equipment purchase, receipt reload, **Land Buy/Sell at authoritative prices**, Vault deposit, invitation, Quest and ordinary Attack pass. Keyboard focus, an actual delayed purchase response's loading state, disabled explanations and invalid-CSRF rejection pass. Read-only views preserve financial, combat, army and progression records.

Local validation: new browser wrapper **1/1**, focused existing browser/economy/shopping/rendering regressions **13/13**, typecheck/build, static **99/99 with 77 production EJS fixtures**. Final required exact-head CI results are recorded in the PR and delivery package.

[Preservation audit](preservation.json) confirms unchanged backend, rulesets, migrations, release/recovery code, workflows, packages, public JavaScript and image files. Bounty, Quests, Armory, Profile, header, navigation, artwork and command-field templates retain their established structures. No targeting, eligibility, combat, XP, currency, settlement, pagination, authentication or database behavior changes.

Draft for review. No merge, deployment, production SQL, settings operation or gameplay activation.
