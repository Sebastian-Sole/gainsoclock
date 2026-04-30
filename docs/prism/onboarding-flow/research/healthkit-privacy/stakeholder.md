# Stakeholder: Ingrid Solheim (Bergen, 34) — first-run walkthrough

> Marketing manager, iPhone 15, strength-trains 3x/week at Sats Bergen, pays
> for Strava, uses Apple Health lightly, reads privacy nutrition labels.
> English is her second language; clumsy translated Norwegian annoys her more
> than plain English does. Her sister-in-law had a health-app monetisation
> scare, so her default toward a new health app is a narrow-eyed "convince me".

Narrating in first person from App Store through sign-up, through the current
`app/onboarding.tsx` screen, into the spotlight tour in `lib/onboarding-steps.ts`,
with the HealthKit requests from `lib/healthkit.ts` firing somewhere inside.

---

## 00. App Store listing, before I open it

I read the Privacy section. Apple's nutrition labels apply to every app on the
store 🟢 ([Apple Privacy Labels](https://www.apple.com/privacy/labels/)). If
Fitbull's label says "Data Linked to You: Health & Fitness, Purchases,
Identifiers" with no clear purpose, I close the tab. "Data Not Collected" or
a short honest list earns a chance. 🔴 My perception — someone should
screenshot the current listing so we know what I'm actually reacting to.

Second gate: screenshots. First screenshot showing "$12.99/month" in dollars
and I close the tab. I live in NOK; I want "kr". No Vipps anywhere means this
isn't aimed at me — Vipps handles recurring charges and in-app subscription
management as of 2024–2025 🟢
([Vipps MobilePay news](https://vippsmobilepay.com/en-NO/news/vipps-mobilepay-launches-tap-to-pay-across-the-nordics)).
App Store subs go through Apple ID, fine, but I notice when an app pretends
the Nordics don't exist.

## 01. First launch + sign-up

`app/(auth)/sign-up.tsx` is email + password + confirm. No "Continue with
Apple". Real miss — Sign in with Apple gives me hide-my-email, and for a
health app that matters. If Convex auth can't do it yet, at least tell me
*why* you need my email. "Start tracking your workouts" tells me nothing.

Two copy tells that hurt:

- "Repeat your password" reads slightly translated. Native English is "Confirm
  password".
- No "By continuing you agree to…" with tappable privacy link *before* I tap.
  For a fitness app in EU/EEA that's a red flag. GDPR treats fitness and
  physiological data as Special Category (Article 9); explicit consent is the
  only plausible legal basis for most fitness apps 🟢
  ([Chino.io / GDPR digital health](https://www.chino.io/post/do-fitness-tracking-apps-need-to-be-complied-with-data-protection-law)).
  Norway's LOV-2018-06-15-38 mirrors this — sensitive personal data needs
  explicit consent, not a buried ToS checkbox 🟢
  ([White & Case Norway GDPR guide](https://www.whitecase.com/insight-our-thinking/gdpr-guide-national-implementation-norway)).

I want one line under the primary button: "By continuing, you agree to our
Terms and Privacy. We don't sell your data." Tappable. I'll read the first
two paragraphs. 12-page Lorem-Ipsum policy: trust drops. One honest screen:
trust jumps.

## 02. Current `app/onboarding.tsx` — where I'd probably bail

Crown icon, "Welcome to Fitbull", four generic bullets, "Choose Plan" primary,
"Skip and start free" as a grey underlined link. Reasons I'd close:

1. **I just signed up. I haven't done anything.** You're asking me to pick a
   paid plan before showing one workout, one chart, one chat. Strava, Future,
   MacroFactor, Apple Fitness+ all show me *something* real first.
2. **"Choose Plan" with no price visible** means I tap, get a RevenueCat sheet,
   see a dollar number I wasn't braced for, reflex-close.
3. **"Unlock Pro to get your full AI coaching setup"** — what's "full"? What
   do I get without it? Bullets underneath are generic. You don't know I'm
   female, you don't know I lift.
4. **Skip link is grey, small, underlined.** Dark-pattern tell. I notice it
   *hard*. If the skip is visually hostile, I assume the monetisation
   strategy is hostile.
5. **No mention of Apple Health here.** Fine for this screen, but means the
   HealthKit ask is coming later and I'm already annoyed.

Trust: dropping. Skimming for reasons to bail.

## 03. Skip — the spotlight tour

I land in tabs and get `lib/onboarding-steps.ts`: 8 steps of dark overlays and
arrows at each tab. "Welcome! Let's take a quick tour." "You're All Set!" at
step 8 with a party-popper.

This is a 2014 app. I can read icons. I'm *not* all set — no workouts, no
plan, no coach context. The one step that could matter, "AI Fitness Coach" at
step 7, is buried behind six tabs of geography. By then I've tapped Next six
times and I'm cranky.

## 04. The HealthKit ask

`lib/healthkit.ts` requests:
- Read: BodyMass, Height, BodyFatPercentage
- Write: ActiveEnergyBurned, Workout samples

Sensible, narrow set. Apple's authorization sheet is granular per data type
with separate read/write toggles 🟢
([Apple Health & Privacy](https://www.apple.com/legal/privacy/data/en/health-app/)).
If I see that sheet, I'm *more* comfortable than with most apps, because
**I trust Apple's sheet more than I trust Fitbull's form.**

Everything hinges on the **primer screen** before the Apple sheet. What works
on me:

1. **Say what you'll read, one sentence per item.** "We read your weight so
   you don't have to type it and your progress chart is accurate." "We write
   workouts so your Apple Fitness rings close."
2. **Say what you will NOT read.** "We don't read heart rate, sleep, cycle,
   or medications." Naming the things you're *not* asking for is the
   highest-trust move a health app can make — my default assumption is
   you're quietly grabbing everything.
3. **Remind me the toggles are mine.** "Apple's screen lets you turn each one
   off. Revoke anytime in Settings > Privacy > Health."
4. **Don't call it "Connect Apple Health".** "Import from Apple Health" or
   "Sync with Apple Health". "Connect" sounds like an OAuth linkage that
   survives uninstall; "Import" is honest.
5. **Skip equal weight.** "Not now" as a real button, not a grey link. If
   Allow is the only real choice, I read coercion and my answer is no.

Where I'd hesitate: if the primer says "Fitbull needs Apple Health to work"
— that's a lie (the code falls back to manual entry) and I'll catch it. Or
if `toShare: [ActiveEnergyBurned, Workout]` gets described as "sync your
data" without admitting Fitbull is *writing into* my Apple Health database.
I want to know what's being added, not just read.

🟡 Because Fitbull has no reputation, I won't grant HealthKit on the first
screen I see it on unless the primer is excellent. On the "show Apple Health
BEFORE asking for stats" question: positive *if* you've earned a tiny bit of
trust first. First-screen Apple Health ask feels greedy. After I've seen a
plan preview personalised to goal + gym days, it feels useful.

## 05. Entering my weight

If HealthKit is denied, or I haven't weighed in recently (I do it twice a
month), I'll enter it manually. Two things matter:

1. **Kilograms with a comma.** "68,4 kg". The repo already supports
   comma-decimal (commit `2629ff8`) — don't regress. Rejecting my comma means
   the team doesn't think about me, and I'm done.
2. **Do not make this a BMI reveal.** Cal-AI-style "Your BMI is 24.3 —
   Overweight" is the fastest path to a one-star review. I'm 34, I have
   body-image stuff, I did not ask for a verdict. Use the number; don't
   *judge* me with it on-screen.

## 06. Paywall

If it comes *after* a personalised preview that used my inputs and ideally
prefilled from Apple Health, I'll read it. What converts me:

- Price in kr. Monthly and annual, with annual's monthly-equivalent shown.
- A real free tier or no-CC trial. Keep "Start free" *real*, not a funnel back
  to the paywall.
- One line: "Manage or cancel anytime in your Apple ID subscriptions." I know
  this; saying it is still a trust signal.
- No countdown. "Offer ends in 09:47" drops trust instantly.
- Visible close X on iPhone 15 Dynamic Island region 🟡 — verify RevenueCat
  template.

## 07. Trust arc — when do I decide "ok this one's fine"?

Current flow: **I don't.** No screen gives me a moment to land on. The arc I
*want*:

| Screen | My trust |
|---|---|
| App Store listing, honest label | Slight lift |
| Welcome, Apple sign-in, honest one-liner | Holding |
| "What's your goal?" (one tap) | Small lift |
| "How many days/week?" (one tap) | Small lift |
| "Lift, cardio, both?" (one tap) | Small lift |
| Apple Health primer (honest, granular, specific about reads + writes) | **The test.** Excellent: big lift. Vague: drop. |
| Apple's own sheet | Flat — it's Apple, not you |
| "4-week starter plan for strength, 3x/week" using my inputs | Big lift |
| "Want the coach to adjust this weekly?" → paywall | Willing to read |
| Pricing in kr, Apple billing explained | Likely to start trial |

Earliest "ok this one's fine" is the **AI preview that clearly used my inputs**,
contingent on the Apple Health primer not having blown my trust five seconds
earlier.

## 08. Copy I'd change (Ingrid-voice)

- Sign-up subtitle "Start tracking your workouts" → "One account, syncs
  across your iPhone and iPad. We don't share your data with advertisers."
- "Repeat your password" → "Confirm password".
- Kill the current `app/onboarding.tsx` screen. Personalised intake first,
  paywall later.
- Generic bullet "AI fitness coach chat / Ask for workouts anytime" → "Your
  coach remembers what you lifted last week, not just what plan you're on."
- HealthKit primer: "Import from Apple Health (optional)". Body: "We'll read
  your weight and height so you don't have to type them. We'll save finished
  workouts to Apple Health so your activity rings close. We never read your
  sleep, heart rate, or cycle data."
- Paywall CTA: "Start 7-day free trial" not "Choose Plan". Price under the
  button: "Then 149 kr/mo, cancel anytime."
- Spotlight tour: delete. If anything survives, fire the chat-tab step the
  first time I open chat, not on first launch.

## 09. Patterns that lose me

- BMI verdict screen with colour-coded categories.
- Stock-photo before/after with a shredded man.
- Paywall without a visible close X on Dynamic Island iPhones 🟡.
- Haptics-heavy celebration on a screen where I haven't done anything.
  Completing the tour is not an achievement.
- "Level up", "crush your goals", "unleash your potential" — the "too American"
  tell. Strava's tone is direct and a little dry; that works on me.
- Push-notification permission ask in the first 60 seconds. Wait until I've
  done one workout.
- PostHog analytics sent during onboarding without a mention that analytics
  exist. GDPR-wise this is the kind of thing that burned my sister-in-law 🟡.
  A one-liner "Anonymous usage analytics; opt out in Settings" is cheap, and
  the difference between me trusting you and me sniffing the network in
  Charles Proxy.

## 10. Would I start a trial?

**Current flow: no.** I skip the paywall, poke around 90 seconds, realise the
AI coach is the differentiator but it looks paywalled, delete the app the
same afternoon. Give-to-get ratio is bad.

**Rebuilt flow with personalised preview + clean Apple Health primer +
NOK-priced paywall with a real trial: yes.** I'd convert on day 3 if the
coach noticed I'd skipped Wednesday and asked about it. That's the moment I
tell my coworker at Tag Kaffebar about the app.

## 11. The load-bearing nuance

"Show Apple Health connection **before** asking for stats" — **positive,
conditionally.** Positive because it saves typing and because Apple's sheet
is more trustworthy than your form. Conditional because a first-screen Apple
Health ask reads as a permission-grab. Right order: goal + days/week (three
taps) → primer → Apple sheet → "we pulled your weight, is this right?" →
rest of the intake.

Flip it — form first, then Apple Health as a bonus — and I've already typed
my weight, Apple Health becomes redundant, I decline, and you lose the
ongoing sync of workouts back into my Fitness rings. You want me on the
Apple Health side *before* I've committed to manual entry.

---

**Source confidence tags:**
🟢 first-party: Apple Privacy Labels, Apple Health & Privacy legal page,
White & Case Norway GDPR guide, Chino.io GDPR digital-health writeup,
Vipps MobilePay press. 🟡 secondary / inference. 🔴 Ingrid's perception,
flagged as not fact.
