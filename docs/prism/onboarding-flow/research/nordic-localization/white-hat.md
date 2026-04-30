# White Hat — Nordic-first Localization

**Perspective:** White Hat (facts only, no opinions, no recommendations)
**Session:** `onboarding-flow`
**Topic:** Nordic launch (NO / SE / DK / FI / IS) — payments, pricing, copy, GDPR, App Store plumbing. US/EU secondary.
**Date:** 2026-04-21

Confidence tags: 🟢 primary (official docs / repo code), 🟡 secondary (industry summary), 🔴 unverified.

## 0. Codebase baseline (🟢)

- `app.json`: bundle id `com.soleinnovations.fitbull`. **No** `locales` map, **no** `expo-localization` plugin, **no** `CFBundleAllowMixedLocalizations`. `NSHealthShareUsageDescription` / `NSHealthUpdateUsageDescription` are English-only. `ios/Fitbull/Info.plist` has `CFBundleDevelopmentRegion = $(DEVELOPMENT_LANGUAGE)` (Xcode default English).
- `package.json`: no i18n library (no `expo-localization`, `i18n-js`, `i18next`, `react-intl`, `lingui`, `formatjs`). No `lib/i18n.ts`, no `locales/` directory.
- `lib/format.ts`: no locale awareness. Hardcoded `kg`/`lbs`/`km`/`mi`/`h`/`m`/`s`; no `Intl` usage. Comma-decimal support cited in `CLAUDE.md` lives **only** in `components/workout/set-input.tsx` (regex `^\d*[.,]?\d*$` + `text.replace(',', '.')` before `parseFloat`) — input-only, not routed through `lib/format.ts`.
- `hooks/use-purchases.ts`: reads `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS`, `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID` (default `"Fitbull Pro"`). No product ids / prices / currencies hardcoded — Offerings fetched at runtime. `convex/subscriptions.ts` verifies entitlements server-side via `https://api.revenuecat.com/v1/subscribers/{userId}`.
- `convex/schema.ts` / `user.ts`: no `locale`, `country`, `currency`, `language` field per user.

## 1. Payment methods usable for iOS IAP in the Nordics (🟢 / 🟡)

Apple rule: digital goods / auto-renewable subscriptions in App Store apps must use StoreKit IAP. RevenueCat 2025 (🟢): *"For apps available outside the U.S. App Store, Apple still requires that digital goods and subscriptions be purchased through in-app purchases."*

StoreKit-accepted Apple ID funding in NO/SE/DK/FI/IS (🟡 Apple Support + Apple country methods list): **Visa / Mastercard credit/debit** (Norwegian BankAxept is usually co-branded); **Apple Pay** (available in all five — card-presentation only, IAP still hits the stored Apple ID method); **Apple Account balance / gift cards**. **Carrier billing** not generally offered (🔴).

Local wallets that are **not** IAP funding instruments:

- **Vipps MobilePay** — full Apple Pay alternative for in-store NFC and merchant e-commerce after EU DMA forced Apple to open NFC in 2024 ("Tap with Vipps" launched NO 2024-12-09; DK/SE/FI rolling through 2025 — 🟢 Vipps press; 🟢 MacRumors 2024-12-09). **Not** an Apple ID method.
- **Klarna on Apple Pay** (iOS 18+, 2024) — Klarna (🟢): *"may not be available for all types of purchases, such as subscriptions and recurring transactions."*
- **MobilePay** standalone, **Swish** (SE), **BankID payments**, **BankAxept-only debit** — none are App Store methods.

**EU/EEA DMA external-purchase option.** Since 2025-06-26, apps on EU storefronts may add tappable external-purchase links to web checkouts outside IAP under Apple's new EU terms, with a 5% Core Technology Commission + additional fees; cannot offer both IAP and external on the same EU storefront (🟢 RevenueCat 2025-06; 🟢 Apple DMA page). **Norway and Iceland are EEA but not EU** — DMA does not apply to their storefronts. Only DK / SE / FI qualify.

## 2. App Store pricing — NOK / SEK / DKK / EUR (🟢 Apple + 🟡 equinux)

Apple 2025 (post-November 2022 overhaul): **800 price points** per auto-renewable subscription, up to 900 on request. Dev picks a base storefront; Apple **auto-equalises** across 174 storefronts with periodic FX/tax adjustment; any storefront can be manually overridden (🟢 App Store Connect Help — "In-App Purchase and subscriptions pricing and availability").

Values at ~$9.99 equivalent (🟡 equinux pricematrix 2026-04-21): **Norway NOK 109,00** (proceeds 61,04); **Sweden SEK 109,00** (61,04); **Denmark DKK 89,00** (49,84); **Finland EUR 9,99** (6,58); **Iceland USD $9.99**; **EU reference EUR 10,99**; **US $9.99** (proceeds $6.99). Tier snapshots (🟡): ~$4.99 → NOK 55 / SEK 50 / DKK 45 / EUR 5,49; ~$14.99 → NOK 159 / SEK 159 / DKK 129 / EUR 16,99; ~$19.99 → NOK 219 / SEK 209 / DKK 169 / EUR 21,99. Exact 2026 numbers must be pulled from App Store Connect directly.

**Iceland is priced in USD** on the iOS App Store, not ISK — atypical vs. other Nordics (🟡). EU storefront prices are tax-inclusive; Apple remits VAT, Norwegian MVA (25%), and Icelandic VSK (🟡 Apple tax-update posts; precise 2025 rates 🔴).

**Custom Product Pages** (October 2025): up to **70 per app**, up to **3 localized versions** each counting as one page, unique URLs, keyword-assignable since mid-2025 (🟡 Adapty 2026). Metadata localization supported in 21 territory languages (🟡).

## 3. Apple review scrutiny for health/fitness apps (🟢)

No published guideline singles out Nordic markets. Applicable global rules:

- **1.4.1 Physical harm** — medical apps that could produce inaccurate data or be used for diagnosis/treatment get greater scrutiny.
- **5.1.1(v)** — account deletion required if account creation is offered (since 2022).
- **5.1.3 Health and Health Research** — HealthKit / CareKit data may not be used for advertising, marketing, or use-based data mining. Apple's September 2025 "Health & Fitness Apps Privacy Overview" PDF (🟢): *"any app that interacts with data from the Apple Health app is never allowed to use Health data for tracking purposes."* Apple's stated review posture: **data minimization, on-device processing, transparency and control, security**.
- **3.1.2** — before the purchase sheet, the app must display title, duration, per-period price, cancellation info, Terms + Privacy links, in the storefront's language.

Nordic-specific scrutiny is downstream at the DPA level (§5), not App Review.

## 4. Nordic copy / tone — documented patterns (🟡 / 🔴)

Citable "Nordic UX tone" material is thin. What exists:

- Cultural frames — *lagom* (SE "just right"), *hygge* (DK cozy), *koselig* (NO), *sisu* (FI perseverance; different axis) (🟡 Modern Dane; not a UX primary).
- Ainoa Agency "Nordic Marketing Playbook" (🟡): simplicity, data-backed claims, transparency about data collection, conversational-but-credible tone, minimal superlatives. Brands cited: Fjällraven, IKEA, Oatly.
- **NN/g "Four Dimensions of Tone of Voice"** — canonical UX framework (funny/serious, formal/casual, respectful/irreverent, enthusiastic/matter-of-fact) (🟡 nngroup.com). No Nordic-specific guidance from NN/g.
- **CLDR locale formatting (🟡):** nb-NO, sv-SE, da-DK, fi-FI, is-IS all use **comma** as decimal separator, **space / U+00A0 NBSP** as digit-group separator; 24-hour time; Celsius; metric.

No single primary "Nordic copywriting spec" from a major platform (Apple, Google, Meta) located. Directness claims defensible only at 🟡.

## 5. GDPR obligations on intake (🟢)

GDPR applies in all five targets: DK/SE/FI via EU, NO/IS via EEA Agreement. DPAs: **Datatilsynet** (NO), **Integritetsskyddsmyndigheten/IMY** (SE), **Datatilsynet** (DK), **Tietosuojavaltuutetun toimisto** (FI), **Persónuvernd** (IS). DK/SE/FI/NO DPAs coordinate (May 2024 Oslo joint adoption on children's online rights + AI under GDPR — 🟡 Didomi).

**Article 9 special-category data.** Art. 9(1) prohibits processing *"data concerning health"* unless an exemption applies. Operative exemption for a commercial fitness app: **Art. 9(2)(a) explicit consent** per specified purpose (🟢 GDPR text; 🟢 EDPB Guidelines 05/2020). Art. 4(15) + Recital 35 define "data concerning health" as *"information about past, current or future physical or mental health"*; EDPB reads this as covering fitness-app data when inferences about health status are possible (🟡 EDPB 03/2020 applied analogically).

**Art. 9(2)(a) requires (🟢):** (1) **Freely given** — not bundled with terms, not a precondition for core-service use unless strictly necessary (Art. 7(4); EDPB 05/2020 §3.1.2). (2) **Specific** per purpose — separate consents for training personalisation, AI-coach inference, analytics, marketing. (3) **Informed** — controller identity, purposes, retention, recipients incl. non-EU processors and transfer mechanism, right to withdraw. (4) **Unambiguous** — affirmative act; pre-ticked boxes invalid (Recital 32). (5) **Explicit** — express statement referring to the sensitive category, e.g. *"I consent to the processing of my health and fitness data for [purpose]"* (🟢 EDPB 05/2020 §7.1). (6) **Withdrawable** — Art. 7(3), as easy to withdraw as to give; withdrawal does not affect pre-withdrawal lawfulness.

**Other rights the intake UX must surface:** **Art. 17 erasure** — account-delete mechanically possible in-app (overlaps Apple 5.1.1(v)); **Art. 20 portability** — machine-readable export of user-provided data (AI-derived outputs contested — conservative read is user inputs must be exportable, 🟡 EDPB WP242 rev.01); **Arts. 13-14 information** — privacy notice **at the point of collection**, before submission, listing controller identity/contact, DPO if any, purposes + legal basis per purpose, recipients, transfer mechanism, retention, rights, right to complain to the DPA; **Art. 5(1)(c) minimisation** — only data necessary for the stated purpose.

**Onboarding implications:** combined "I accept Terms and Privacy" **cannot** cover health-data consent — needs a distinct, explicit control. Privacy notice reachable **before** submission, not only Settings. Record of which user gave which consent at which timestamp is required (Art. 7(1)). Art. 8 age of digital consent is **13** in NO, SE, DK, FI, IS (🟡 dlapiperdataprotection per-country).

## 6. Apple Privacy Nutrition Label — categories Fitbull trips (🟢)

Taxonomy: Contact Info, Health & Fitness, Financial Info, Location, Sensitive Info, Contacts, User Content, Browsing History, Search History, Identifiers, Purchases, Usage Data, Diagnostics, Other Data. Per type: declare (a) collected, (b) linked to identity, (c) used for tracking.

Applied to Fitbull (all linked to user unless noted): **Contact Info → Email** (Convex auth); **Identifiers → User ID** (Convex auth); **Identifiers → User ID / Device ID** (RevenueCat `$RCAnonymousID`); **Identifiers → Device ID** (PostHog `$device_id` / `distinct_id` if default config); **Health & Fitness → Health + Fitness** (intake body stats, HealthKit reads via `lib/healthkit.ts`, meal logs via `convex/mealLogs.ts`); **Health & Fitness → Fitness** (`convex/workoutLogs.ts`); **User Content → Other User Content** (AI-coach transcripts, `convex/chat.ts`); **Purchases → Purchase History** (`convex/subscriptions.ts`); **Usage Data / Diagnostics** (PostHog events, planned); third-party processor disclosure for OpenAI (`convex/aiTools.ts`) under App Functionality.

Mandatory outcomes: **Health & Fitness** declared the moment intake body-stats or HealthKit reads ship; Apple treats as "linked to user" for accounted apps (🟢). **Tracking / ATT:** PostHog configured without IDFA and without cross-app/SDK sharing is **not** "tracking" in Apple's ATT sense (🟡 TelemetryDeck, aligned with Apple's definition). **But:** HealthKit-derived data forbidden from tracking by 5.1.3 and the Sep-2025 PDF (🟢) — PostHog must not receive HealthKit-derived metrics for ads/measurement. PostHog with `captureAppLifecycleEvents: true` and no identifier scrubbing → declare **Identifiers → Device ID — linked — Analytics**.

## 7. `expo-localization` and minimal Nordic setup (🟢)

Expo SDK 54 (pinned) supports `expo-localization` first-party. **Not installed today.**

**API (🟢 docs.expo.dev):** hooks `useLocales()`, `useCalendars()` (re-render on OS locale change; SDK-54 TZ-rerender bug fixed in PR #36382); sync accessors `getLocales()`, `getCalendars()`. Each `Locale` returns `languageTag` (BCP-47 — `nb-NO`), `languageCode` (`nb`), `regionCode` (`NO`), `decimalSeparator` (`,` Nordics), `digitGroupingSeparator` (space / NBSP), `measurementSystem` (`metric`), `currencyCode` (`NOK`/`SEK`/`DKK`/`EUR`/`ISK`), `currencySymbol`, `textDirection` (`ltr`), `temperatureUnit` (`celsius`).

Minimal config for NO/SE/DK/FI/IS/EN (🟢 Expo guide pattern):

```json
"plugins": [["expo-localization", { "supportedLocales": { "ios": ["en", "nb-NO", "sv-SE", "da-DK", "fi-FI", "is-IS"] } }]],
"ios": { "infoPlist": { "CFBundleAllowMixedLocalizations": true } },
"locales": { "nb-NO": "./locales/system/nb-NO.json", "sv-SE": "./locales/system/sv-SE.json", "da-DK": "./locales/system/da-DK.json", "fi-FI": "./locales/system/fi-FI.json", "is-IS": "./locales/system/is-IS.json" }
```

`locales/system/*.json` hold **native-iOS strings** (display name, `NSHealthShareUsageDescription`). In-app UI copy is a separate layer via `i18n-js` / `i18next` keyed off `getLocales()[0].languageCode`. **Encoding / plurals (🟢):** UTF-8 handles `æ`/`ø`/`å`/`ä`/`ö`/`þ`/`ð`/`ý`/`á` natively. Plurals not in `expo-localization`; use `Intl.PluralRules` (Hermes ICU) or a library. Per CLDR, Swedish, Norwegian, Danish, Finnish, Icelandic each have **2 plural forms**. Existing `set-input.tsx` comma-decimal handling is compatible with all five locales; `lib/format.ts` would need `decimalSeparator` awareness for output (additive, not blocking).

## 8. App Store submission surfaces onboarding touches (🟢)

**Age rating** — one-to-AI chat does not trigger user-generated-content bumps; user-to-user would. Medical-advice claims get scrutiny. **App Privacy questionnaire** — see §6. **Export compliance** (ITSAppUsesNonExemptEncryption) — HTTPS-only is exempt. **Kids Category** — imposes strict constraints (no third-party analytics with identifiers, parental gates, no behavioural ads, no ungated external links); operationally incompatible with Fitbull's intake + AI coach. **Account deletion** — 5.1.1(v). **3.1.2** — subscription disclosure before the purchase sheet, in storefront language.

## 9. Store-level A/B and segmentation (🟢 / 🟡)

**Custom Product Pages** — up to 70/app, 3 localizations each, unique URLs, keyword-assignable mid-2025+; vary screenshots/previews/promo text, not price (🟢 + 🟡 Adapty). **Product Page Optimization (PPO)** — native A/B on default-page treatments, up to 3 variants vs. baseline (🟡 MobileAction). **Per-territory pricing** — set per storefront; auto-equalise or manual override across 174 (🟢). **Per-territory availability + scheduled start/end dates** — supported (🟢). **In-app experiments** (paywall copy / price variants) — not an App Store feature; RevenueCat Experiments supports up to 2 price variants (🟡) or PostHog flags. **Promoted in-app purchases** — featurable on product page with localizable metadata; Nordic storefronts supported (🟢).

## 10. Real Nordic apps — recurring patterns (🟡)

Brief lists Oda, DNB, Vipps, Klarna, Linas Matkasse, Yousee. Observable from public listings / press (🟡, not primary teardowns): short functional app names; low-contrast pastel / photographic illustration (Oda, Vipps, Linas Matkasse); descriptive headlines over aspirational — Oda *"Matvarer levert hjem"*, Vipps *"Send penger med Vipps"*; explicit privacy surfacing early (regulatory for DNB/Vipps/Klarna under PSD2/FIDA + GDPR — 🟢); **BankID-first auth** — DNB, Vipps, Klarna (SE), Oda default to BankID (NO/SE) / MitID (DK) / Mobiilivarmenne (FI). Fitbull has no BankID integration; `@convex-dev/auth@0.0.90` has no BankID provider in the pinned version (🟢 absence in `package.json`). Pricing on-screen in local currency, never USD-anchored (🟡). Units kg, km, °C, dl/ml — CLDR-consistent (🟡). **Finnish is linguistically distant from Scandinavian** (agglutinative, 15 cases, partitive/accusative) — FI copy written separately, not machine-translated from a Scandinavian base. **Icelandic** is also separate (strong declension, national policy preferring native neologisms — 🟡 Stofnun Árna Magnússonar). No primary UX teardown of these apps' onboarding located (🔴).

## Evidence gaps

Exact 2026 price-point values at $9.99 equivalent — 🟡 via equinux; confirm in App Store Connect. 2025 MVA / VSK rates for Norway / Iceland — 🟢 general rule, 🔴 precise rate. Country-granular Nordic vs. US subscription-app conversion benchmarks — 🔴, public primaries not located; Appfollow / Similarweb paywalled. DNB / Vipps / Oda onboarding teardowns at primary-source quality — not located (🔴). DPA enforcement decisions on fitness-app intake (NO/SE/DK/FI/IS) — DPA sites reachable, no specific fitness-app decision retrieved. Whether `@convex-dev/auth@0.0.90` supports BankID / MitID / Vipps Login — `auth.config.ts` not read in this pass (🟡 assumed no).
