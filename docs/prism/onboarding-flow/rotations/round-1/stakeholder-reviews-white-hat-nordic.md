# Stakeholder reviews White Hat — Nordic Localization

**Perspective:** Stakeholder (Ingrid Solheim, 34, Bergen)
**Reviewing:** `docs/prism/onboarding-flow/research/nordic-localization/white-hat.md`
**Session:** `onboarding-flow`
**Date:** 2026-04-21

---

Right. So someone made me read a compliance document. I'm Ingrid. I sell
category strategy at a mid-size Norwegian brand, I pay for Strava, I'm on my
third iPhone, and I don't love translated apps because they always get the
tone slightly wrong — "Gjenta passord" instead of "Bekreft passord", that
kind of thing. I'm going to tell you what in this White Hat actually lands
on me, what I'd never see, and what's compliance theater someone needs to do
correctly but I will forget instantly.

---

## Bucket 1 — Things that will make me like or dislike the app

These are the concrete moments the White Hat identifies that I will actually
experience on-screen.

**Price in NOK, with a comma.** The White Hat documents NOK 109,00 at the
$9.99 tier (🟡). This matters. When the RevenueCat sheet opens and I see
"kr 109 / måned" I stay. If I see "$12.99/mo" converted in a toast
somewhere, or worse, only USD in a screenshot earlier, I bail before I tap.
The White Hat is right that Apple auto-equalises, but "auto-equalised" is
the backend reality — my eyes want "kr" and the comma. NOK 99 vs NOK 109
vs NOK 89 is a minor lever compared to the *presence of the local currency
symbol and correct decimal glyph*. Price anchoring is a Strava-level
concern; currency-of-display is an *entry-ticket* concern.

**The GDPR Article 9 explicit-consent moment.** The White Hat says this has
to be a distinct control, not bundled with Terms. From my seat this is
actually the single biggest trust moment in the whole onboarding — bigger
than the paywall. If I see:

> *"I consent to Fitbull processing my weight, height, and workout data so
> the AI coach can personalise plans for me. You can withdraw this in
> Settings anytime."*

…with its own checkbox, separate from "I agree to Terms", my trust jumps.
It reads as *you know what you're asking for*. The White Hat is framing
this as a legal requirement; from the user seat it's a conversion moment.
The sister-in-law story I mentioned in my earlier walkthrough — that was
exactly this kind of quiet bundled consent going wrong. Get this right and
you don't just avoid a fine; you earn a Norwegian who tells her coworkers.

**The HealthKit / 5.1.3 ban on Apple Health data in PostHog.** This is
behind-the-scenes for most users, but I read privacy labels. If Fitbull's
nutrition label shows "Health & Fitness — Linked to You — Analytics", I
close the listing tab. The White Hat correctly says HealthKit-derived
metrics must never hit PostHog. From my seat, this means the privacy label
can legitimately say "Health & Fitness — Linked to You — App Functionality"
only. That's a completely different trust signal than the other one. Same
words, different category, massive difference in how I read it.

**English-only first ship.** The White Hat notes Expo has zero i18n
infrastructure today, and that Bokmål/Swedish/Danish/Finnish/Icelandic all
need separate translations (Finnish and Icelandic are linguistically
distant from Scandinavian — can't be machine-lifted from a Norwegian base).
Honest truth: I'd rather read clean, plain English than clumsy
Bokmål. Strava's English works on me. What *doesn't* work is
English-that-tries-to-be-fun ("unleash your potential", "crush your
goals"). If the English copy is in Strava's register — direct, a little
dry, specific — I read the app as "international, made in English", which
in Norway is a compliment. If it's in Cal-AI's register — American gym-bro
energy — I read it as lazy and uninterested in me. So the translation
backlog the White Hat flags is *not* a V1 blocker for me, but the *tone* of
the English is.

**The 3.1.2 subscription disclosure in storefront language.** Hidden inside
this clause: the price, cadence, cancellation info, Terms + Privacy links
must appear *before* the IAP sheet, in the storefront's language. From my
seat: this means the custom paywall screen that shows "kr 149/mnd, avbryt
når som helst, vilkår | personvern" before I tap to buy. That single
screen being in Norwegian while the rest of the app is in English is
actually fine — and actually better than a half-translated UI. This is the
one place where localization *must* happen on day one or Apple will reject
the build, and it's also the one place where localized copy directly moves
my willingness to pay.

**No Sign-in-with-Apple (implied by the absence of BankID auth discussion
plus my prior read on sign-up).** The White Hat mentions
`@convex-dev/auth@0.0.90` lacks a BankID provider. I don't care about
BankID for fitness (see next bucket). But the absence of SIWA is the
adjacent pain. I'd like hide-my-email for a health app. Not in the White
Hat, flagging it.

## Bucket 2 — Things I will never notice, but the team must handle right

These are the quiet plumbing items from the White Hat. Get them right.
Don't talk to me about them.

- **`CFBundleAllowMixedLocalizations = true`** and the `supportedLocales`
  array. I'll never know this flag exists. But if it's wrong, my iOS will
  show Fitbull's display name as "Fitbull" on a Norwegian phone and that
  looks cheap. The White Hat's one-paragraph config is correct; ship it.
- **Apple auto-equalisation across 174 storefronts.** I see one price. I
  don't know it's auto-equalised. The team just needs to pick a sensible
  base storefront and not manually break parity.
- **RevenueCat server-side entitlement verification via
  `api.revenuecat.com/v1/subscribers/{userId}`.** I'm never going to know
  this is how my "Pro" state is confirmed. It just needs to be there so
  restoring purchases on a new iPhone works — because *that* is the moment
  I'll notice (when I upgrade to iPhone 17 in 2027 and re-download).
- **Declaration of OpenAI as a third-party processor under "App
  Functionality"** in the privacy label. This is about the form Apple asks
  the developer to fill in. I might skim "data shared with service
  providers" once, but only if I'm already suspicious. Correctness here is
  table stakes, not a moment.
- **Art. 7(1) consent record-keeping** — storing which user gave which
  consent at which timestamp. I'll never see the database row. If there's
  ever a DPA inquiry, someone will thank past-Sebastian for having it.
- **Art. 20 data portability export.** I will almost certainly never use
  this. But the presence of "Export my data" in Settings is a trust
  signal I may notice once, then forget.
- **Icelandic storefront priced in USD.** Irrelevant to me personally —
  I'm in Norway, NOK. But the team should not assume Iceland behaves like
  the other Nordics.
- **Plural-forms handling via `Intl.PluralRules`.** Not visible; critical
  for "1 økt" vs "2 økter" sounding native when Bokmål eventually ships.
- **Custom Product Pages / Product Page Optimization.** This is an App
  Store marketing surface, not an onboarding surface. I'll never see a PPO
  treatment as "a PPO treatment"; I'll just see the listing I was A/B'd
  into.

## Bucket 3 — Red herrings: looks important, burns eng time, doesn't move me

Items in the White Hat that read as critical but from my seat are either
irrelevant or solvable trivially.

- **DMA external-purchase entitlement covers DK/SE/FI but not NO/IS.** The
  White Hat spends real column-inches on this. From my seat as a
  Norwegian: *I do not care*. I have never, in any app, thought "I wish I
  could pay outside the App Store to save Fitbull the 30%". I find the
  IAP sheet reassuring. "Cancel anytime in Apple ID subscriptions" is
  actually a *feature* to me, not a cost. Building a parallel web-checkout
  for DK/SE/FI users with a 5% CTC + new fees on top would be a massive
  eng undertaking for a rounding-error conversion lift, and it *excludes*
  Norwegian me entirely. Ship IAP-only on day one. Revisit if/when
  competitor pricing pressure forces it.
- **Vipps MobilePay as an IAP funding method.** Won't happen, per Apple
  rules. The White Hat is correct. From my seat: I pay with the Visa
  backing my Apple ID; I didn't expect Vipps to fund subscriptions. Where
  this *would* matter is if the app *lied* and showed a Vipps logo on the
  paywall suggesting I could pay that way — that's worse than silence.
  Don't put Vipps anywhere on the paywall. Just let Apple handle the
  payment. (If someday Fitbull sells physical goods or one-off non-digital
  services, Vipps is relevant. Today, not.)
- **BankID-first auth pattern.** The White Hat observes DNB, Vipps, Oda
  default to BankID. Of course they do — those are a *bank*, a *payment
  wallet*, and a *grocery service with credit*. I would be genuinely
  alarmed if a fitness app asked me for BankID on sign-up. BankID is for
  money, ID, and government. Using it for "track my squats" would read as
  absurd overreach. Email + password, or Sign-in-with-Apple, is the right
  bar. The White Hat is accurate but the Nordic-competitor comparison is a
  category error. Skip.
- **DCSA 6-monthly active-renewal notifications** (I note this wasn't
  explicitly in the White Hat but it's in the broader Nordic monetization
  space — flagging as red-herring adjacent). Do I read those? Once, in
  three years. Apple's subscription-management screen already shows me
  active subs. The DCSA notification is a compliance nicety; it doesn't
  move retention either way. Handle via RevenueCat's built-in; don't
  build a custom system.
- **Finnish and Icelandic needing separate translations.** True. Not a V1
  concern. If Fitbull launches Nordic-first with English + Bokmål only and
  adds Swedish + Danish in v1.1 + Finnish + Icelandic in v1.3, no Finnish
  person is going to write Apple demanding Finnish. They'll read English.
  Treat FI + IS as v2 work; don't let the White Hat's completeness drag
  the schedule.
- **Seven Apple Privacy Label categories all linked-to-user.** I look at
  App Store privacy labels, yes, but I look at the *shape* — how many
  categories, are any marked Tracking, does Health & Fitness appear under
  Analytics. The fact that Contact Info, Identifiers, Purchases, Usage
  Data, User Content are all linked-to-user is *normal* for a logged-in
  app. It's not a red flag. The red flag is Health & Fitness + Tracking,
  or Identifiers + Third-Party Advertising. As long as those two
  combinations don't appear, the seven-category breadth doesn't scare me.
  Fill in the form honestly; don't agonise over it.

---

## Ranked: Top 3 things in the White Hat that move my trust and conversion

**1. Explicit separate GDPR Art. 9(2)(a) health-data consent, with
Ingrid-readable copy.** This is the biggest lever. A plain-English
three-sentence consent statement, on its own screen, with its own checkbox,
pointing at a real purpose, is the single strongest trust moment in the
entire flow. Get it right and I convert. Get it wrong — bundled into ToS,
or written in EU-lawyer prose — and I sniff the network in Charles Proxy
and walk.

**2. NOK pricing with comma decimals on the paywall, and Apple billing
disclosure in Norwegian (3.1.2 compliance).** Currency-of-display is an
entry ticket. Getting "kr 149,00/mnd" right, under a "Start 7-dagers
prøveperiode" CTA, in the storefront language, with "Avbryt når som helst
i Apple-ID-abonnementer" below it, is the difference between a bail and a
trial start. This is the one screen that *has* to be localized on day one.

**3. Apple Privacy Label honest shape — specifically Health & Fitness
declared, and NOT linked to Tracking or Analytics.** I read labels before
I install. "Health & Fitness, linked to you, used for App Functionality"
reads as "sensible fitness app". Any Tracking declaration on Health &
Fitness, or any hint of Analytics pulling HealthKit data, and I'm gone
before I launch. This is upstream of every other moment — it's the gate
before the gate.

## Ranked: Top 3 things that are compliance theater from my seat

**1. DMA external-purchase entitlement for DK/SE/FI.** Big headline in
the White Hat. From the user seat: zero impact. Building a parallel
external-checkout flow to save commission is back-office work that costs
engineering time and adds a weird "pay on the web" path most users will
decline. Ship IAP-only; park DMA externalisation behind a flag for later.

**2. Full Nordic translation matrix on launch.** Shipping Bokmål on day
one is valuable; shipping Bokmål + Swedish + Danish + Finnish + Icelandic
on day one is a distraction that will delay the launch by two sprints and
nobody who actually would've installed will notice. English onboarding
with a NOK paywall and Norwegian subscription-disclosure screen converts
me fine.

**3. Custom Product Pages / PPO A/B story.** The White Hat describes the
App Store marketing surface in detail (70 pages, 3 localizations each,
PPO A/B). Useful eventually, not relevant to the onboarding overhaul this
session is scoped to. Don't let this eat roadmap time in the same quarter
as the in-app redesign.

## The 1 thing the White Hat did NOT cover that I care about

**Sign-in-with-Apple and hide-my-email as a trust moment for a health
app.** The White Hat covered `@convex-dev/auth@0.0.90`'s lack of BankID
providers, and implicitly confirmed it supports email/password. What it
did not address is **Sign-in-with-Apple**, which is the single auth
method that would most move my trust on sign-up. For a Norwegian user on
an iPhone 15, who has watched a family member get burned by a
health-app email leak, hide-my-email is a meaningful lever. It also sits
inside Apple's privacy narrative — the same narrative that HealthKit and
the privacy label sit inside — so it compounds.

Confirm whether `@convex-dev/auth@0.0.90` supports the Apple provider. If
it does, ship it as a primary sign-up option. If it doesn't, that's a
sharper gap than any translation or DMA question. Bullet for the next
White Hat pass: *Does `@convex-dev/auth@0.0.90` support
`AppleProvider` / Sign-in-with-Apple, and if so, is hide-my-email
routable via Convex's email-based user model?*

---

**Voice note to the synthesizer:** I'm one user. I'm a Norwegian
marketing manager, not a legal or eng signal. I'm probably wrong about
DMA commercially — for the business, 5% vs 30% is real money. But this
review is about what moves *me*, not what moves the P&L. The theater
items are still theater from my seat; whether they're theater from the
company's seat is the Black Hat / Yellow Hat's call, not mine.
