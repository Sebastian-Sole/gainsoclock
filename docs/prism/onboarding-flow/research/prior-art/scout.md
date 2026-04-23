# Scout: Prior Art for Onboarding Overhaul

**Session:** `onboarding-flow`
**Date:** 2026-04-21
**Scout:** prior-art sweep — 10 case studies + 8 competitor teardowns

## Executive framing

Two bodies of work were swept:

1. **Case studies / A/B tests** the brief references (Grammarly, Mural, Dollar Shave Club, Houzz, Headspace, and the two truncated insidergrowthhq / abtest.design URLs — recovered). These supply the *evidence base* for the overhaul.
2. **Fitness-app teardowns** (Cal AI, Noom, Simple, Fastic, Future, Ladder, MacroFactor, Hevy/Strong). These supply the *pattern library* — the screen-by-screen vocabulary that sets the "modern fitness app" bar.

Confidence tags: 🟢 primary (publisher case study, first-party benchmark, screen-by-screen teardown with timestamps), 🟡 secondary (third-party summary or review), 🔴 speculation / unable to verify.

---

## Part A — Case Studies

### A1. Mural — Onboarding Checklist 🟢
**Source:** https://abtest.design/tests/onboarding-checklist (accessed 2026-04-21); cross-referenced at https://www.insidergrowthhq.com/p/3-onboarding-and-checkout-secrets.

**What they tested:** Swapping "confusing pop-ups and banners" (app-cues, banners, chat overlays firing simultaneously) for a single linear five-step checklist tied to actions known to predict long-term engagement (create a board, add a sticky note, etc.).

**Winner / delta:** Checklist variant. **"10% relative increase in 1 week retention."** (Direct quote, abtest.design.)

**Mechanism:** Zeigarnik/completion psychology — open loops pull users toward closure. Replacing competing CTAs with one linear path reduces cognitive load *and* gives a measurable progress signal the user can self-reward on. Folk and Deel were spotted running the same pattern, suggesting cross-vertical reproducibility.

**Applicability to Fitbull:** High. The current post-signup tour is exactly the "multiple pop-ups" anti-pattern Mural abandoned. A five-item post-paywall checklist anchored on known activation signals (log first workout, generate first plan, send first chat to the AI coach, import HealthKit, set weekly target) maps cleanly to our three success metrics. Our (tabs) layout can host it as a pinned card on the home tab or a dismissible bottom sheet.

---

### A2. Dollar Shave Club — Conversational Tone 🟢
**Source:** https://conversion.com/case-study/dollar-shave-club/ (accessed 2026-04-21); also summarized at https://abtest.design/tests/conversational-tone-in-onboarding.

**What they tested:** Rewriting subscription funnel copy from a formal/marketing voice to DSC's brand-native conversational tone.

**Winner / delta:** **"5.24% increase in subscriptions"** from the conversational copy alone. Two adjacent tests (product debundling with itemized bullets, and default-checkbox removal + "You qualify for a 15% Handsome discount") added 11.2% and 6.8% respectively, for a **17%+ combined subscription lift** across experiments one and two.

**Mechanism:** Tone aligns with the ad-driven acquisition promise; users arriving from a playful ad don't want to hit a corporate-sounding funnel. Emotional resonance reduces the cognitive "gear-shift" between ad and funnel.

**Applicability to Fitbull:** Medium-high. Our current copy is neutral/functional. Because the AI coach is the differentiator, conversational tone doubles as character foreshadowing — every intake question is the coach "meeting" the user. The specific tactics (defaults off, itemized value breakdowns, discount-qualification callouts) transfer 1:1 to the paywall step.

---

### A3. Houzz — Separating Contact Information Into Multiple Screens 🟢
**Source:** https://abtest.design/tests/separating-contact-information-into-multiple-screens; https://www.insidergrowthhq.com/p/3-experiments-to-boost-conversion.

**What they tested:** Single contact form (name + email + phone in one screen) vs. the same three fields split across three sequential screens.

**Winner / delta:** Multi-screen variant. **"15+% increase in conversion rate"** (abtest.design). Insidergrowthhq adds the detail that this was "less than 1 week's work."

**Mechanism:** Perceived-effort reduction. One question per screen feels shorter than one form — the Zeigarnik/commitment effect kicks in after the first tap. Also known as "the slot-machine effect" in onboarding literature.

**Applicability to Fitbull:** Directly applicable to the intake (goal, experience, days/week, equipment, age, sex, height, weight, activity). This is the empirical justification for **one-question-per-screen over single scroll**, answering orient Q#8.

---

### A4. Headspace — Multi-Intent Queries 🟢
**Source:** https://abtest.design/tests/onboarding-with-multi-intent-queries.

**What they tested:** Single-select vs. multi-select for "Why are you here?" during onboarding. The variant let users pick multiple reasons (e.g., anxiety + mindfulness + sleep).

**Winner / delta:** Multi-select variant. **"10% increase in free trial conversion."** The pattern has since propagated to Thrive Market, Duolingo, and How We Feel.

**Mechanism:** Single-select forces users to flatten reality. Multi-select respects that most users arrive with compound motivations, and — critically — gives the app more signal for downstream personalization ("content relevant to X *and* Y").

**Applicability to Fitbull:** High. The "primary goal" question (lose fat / build muscle / strength / endurance / general fitness) should accept multiple selections, with one flagged as primary for pinning. This alone is a one-day change that the AI coach's prompt context can consume.

---

### A5. Grammarly — Personalized Pricing Based on Onboarding Data 🟢
**Sources:** https://abtest.design/patterns/onboarding (lists "Personalized pricing recommendations, Grammarly, +20% upgrade rates"); https://www.insidergrowthhq.com/p/3-experiments-to-boost-conversion; summary at https://growth.design/case-studies/grammarly-onboarding-survey (direct fetch 403ed, verified via Google cache + search snippets).

**What they tested:** Generic pricing page vs. pricing page whose H1, feature highlights, and SKU description reflect the user's onboarding answers. Example headline pattern: *"Based on what you told us we would recommend X plan."*

**Winner / delta:** Personalized pricing. **"10–20% increase in upgrade rates"** (insidergrowthhq); **"+20% upgrade rates"** (abtest.design). Growth.design confirms: *"upgrade rates increased by 10%+"* when Grammarly combined the survey with a contextual paywall.

**Mechanism:** Reciprocity + effort justification. After answering questions, users *expect* a payoff; a generic paywall breaks that implicit contract. Personalized paywall redeems the effort.

**Applicability to Fitbull:** This is the single strongest argument for putting the aha moment *before* the paywall. The paywall copy ("Here's your personalized 4-day strength plan — unlock to start Monday") should explicitly reference the intake answers. Direct input to orient Q#5 (paywall timing).

---

### A6. Grammarly — Premium Feature Exposure During Onboarding 🟢
**Source:** https://www.insidergrowthhq.com/p/3-experiments-to-boost-conversion; reinforced by https://growth.design/case-studies/grammarly-onboarding-survey.

**What they tested:** Surfacing premium options during onboarding via a split-screen "Continue for Free" vs "Upgrade" choice — not a forced paywall, just awareness.

**Winner / delta:** **"20–30% of a cohort's upgrades originated from the onboarding paywall upsell."**

**Mechanism:** Users who didn't know premium existed can't opt in; users who did know were served faster. No pressure, high discoverability.

**Applicability to Fitbull:** Relevant for the soft-paywall variant. Even if Fitbull goes with a hard paywall, a "See what Pro unlocks" view inside the intake (before the paywall screen) can pre-seed consideration.

---

### A7. HubSpot — In-House KYC Onboarding 🟢
**Source:** https://www.insidergrowthhq.com/p/3-onboarding-and-checkout-secrets.

**What they tested:** Moving KYC/payment onboarding from a Stripe redirect to HubSpot's native UI.

**Winner / delta:** **"Double-digit percentage increase in weekly KYC enrollments."** Quoted mechanism: *"Users tend to have greater trust in the brand and platform they're signing up for, in comparison to third parties."*

**Mechanism:** Context-preserving handoffs beat redirects. Every brand swap during a flow is a trust tax.

**Applicability to Fitbull:** Medium. Relevant because our paywall is RevenueCat's native UI — the chrome is ours, Apple's StoreKit sheet is Apple's (accepted friction). But it argues *against* punting the user to any external screen during intake (no Safari, no email verification detour if avoidable).

---

### A8. E-Commerce Checkout Cost Transparency 🟢 (applicability: low)
**Source:** https://www.insidergrowthhq.com/p/3-onboarding-and-checkout-secrets.

**What they tested:** Removing cart-page shipping estimates; only showing the true total at checkout.

**Winner / delta:** **"$22 million in annual revenue increase with one day of engineering work."**

**Mechanism:** Minimizes cognitive dissonance from estimate-vs-actual drift.

**Applicability to Fitbull:** Low — Apple IAP already enforces final-price disclosure at the StoreKit sheet. Noted only because the broader principle ("show the right number at the right moment, not a speculative one") applies to showing weight-loss or strength-progression projections during intake (Noom does this — see B2).

---

### A9. Headspace "3 Case Studies" (bonus, noted in search) 🟡
**Source:** https://www.insidergrowthhq.com/p/3-case-studies-from-headspace-on (surfaced but not deep-fetched).

Not one of the 10 brief URLs, but worth flagging to the monetization explorer — Headspace is the most-cited wellness-vertical reference in this corpus.

---

### A10. Truncated URLs — recovered 🟢
- `insidergrowthhq.com/p/3-e…` → **https://www.insidergrowthhq.com/p/3-experiments-to-boost-conversion** (A5 / A6 / A3). Confirmed.
- `abtest.design/tests/personali…` → **https://abtest.design/tests/personalized-pricing-recommendations** (Grammarly, +20% upgrade rates — confirmed via `/patterns/onboarding` index). Not deep-fetched; the three paragraph summary from the index is sufficient and is consistent with A5.

---

## Part B — Competitor Teardowns

### B1. Cal AI (AI calorie tracker) 🟢
**Sources:**
- https://screensdesign.com/showcase/cal-ai-calorie-tracker (timestamped teardown, accessed 2026-04-21)
- https://mobbin.com/explore/flows/579da5dd-453a-4e7c-9c11-d20708a4db82 (frame-by-frame screenshots)
- César Álvarez X thread: https://x.com/cesaralvarezll/status/2036873854455255505
- Adam Lyttle's teardown + Claude skill: https://github.com/adamlyttleapps/claude-skill-app-onboarding-questionnaire; YouTube https://www.youtube.com/watch?v=QMo2T5apdYw

**Step sequence (≈28 steps, 00:15–02:30 in the reference video):**
1. Short app demo video / hero intro.
2. Goal selection (multi-select permitted, per Headspace pattern).
3. Basic demographics (age, sex, height, weight).
4. Activity level & training frequency.
5. Interactive weight-loss-speed selector at 01:05 — drag to set pace, goal date updates live.
6. Deep personalization questions (barriers, eating habits).
7. Mid-onboarding App Store review prompt (controversial but used).
8. Animated loading screen — "Generating your plan" with perceived-work bar.
9. **Aha moment:** personalized plan card with daily calorie + macro targets.
10. Soft paywall — 3-day free trial → yearly conversion at ~75% off anchor; monthly plan without trial as a decoy.

**Data collected:** goal, pace, age, sex, height, weight, activity, eating-pattern signals. Cal AI explicitly uses the inputs to produce visible per-screen feedback.

**Paywall placement:** After aha moment, ~03:25 mark. Trial terms transparent.

**Aha moment:** Personalized daily calorie/macro targets + projected goal date — all *shown* before asking for payment. The weight-loss-speed slider at 01:05 is the micro-aha seeding this.

**Social proof:** Mid-onboarding review prompt (Apple review sheet), not testimonials. Gamified badges post-paywall.

**Trial strategy:** 3-day free trial on annual (soft paywall). Monthly = no trial (friction to push annual).

**Applicability to Fitbull:** This is the closest analogue to our target bar. Patterns to steal:
- Interactive goal-pace selector with live feedback (applies to strength target or fat-loss date)
- "Generating your plan" loader masking the real OpenAI/Convex-action latency — doubles as operational-transparency theater (Noom's trick)
- Personalized plan card as the aha moment
- Annual-with-trial vs monthly-without-trial as the paywall frame
- **Caution:** Mid-onboarding review prompt is policy-risky and ethically borderline; skip.

---

### B2. Noom (psychology-led weight loss) 🟢
**Sources:**
- https://www.retention.blog/p/the-longest-onboarding-ever (Jacob Rushfinn, ~96 screens cited)
- https://growthwaves.substack.com/p/the-113-screen-onboarding-that-doesnt (113 screens, ~15 min)
- https://www.paddle.com/studios/shows/fix-that-funnel/noom (Andrey Shakhtin interview)
- https://pageflows.com/post/ios/onboarding/noom/
- https://www.thebehavioralscientist.com/articles/noom-product-critique-onboarding

**Step sequence:** 113 screens, ~15 minutes, structured in three sections — demographics → weight loss goals → eating habits. Interleaved with:
- Progress bars per section.
- Loading screens framed as "analyzing your profile" (operational transparency).
- Stats and testimonials as interstitials between question clusters.
- Educational screens (calorie density, green/yellow/red food system) that double as intake.
- Goal-weight projection updated live — "We predict you'll be 148 lbs by May 22" — with the date updating ~21 screens later to reinforce input weight.

**Data collected:** demographics, weight history, health conditions (aggressively early, a known ethical critique), lifestyle events ("any weddings or vacations coming up?" — urgency-anchoring), eating triggers, time available, attribution question.

**Paywall placement:** Late. After substantial trust-building via stats/testimonials, goal projections, and a countdown-timer urgency frame. Pricing ~$100/2mo paired with a money-back guarantee (which the Behavioral Scientist critique notes is effectively unclaimable — conditional on daily activity).

**Aha moment:** The live goal-date projection (updated repeatedly) *is* the aha — the user literally watches their future get closer. Plus the "behavioral profile" mini-quiz they get back as a takeaway.

**Social proof:** "3,627,436 people lose weight" counter, partner-brand logos, named testimonials with specific numbers ("I've lost 20 pounds"), science-backed stat ("~78% of participants lost weight").

**Trial strategy:** Paid trial (low-cost, not free) in many markets. Localized pricing and local payment methods. Web-to-app funnel (attribution + avoiding the 30% App Store tax) — not applicable to our iOS-first shape but worth noting.

**Applicability to Fitbull:**
- **Steal:** live projection updates, per-screen acknowledgement ("Thank you for sharing — that's an important first step"), section progress bars, loading screens as operational-transparency theater, stat interstitials between question clusters.
- **Steal with care:** the length model. Rushfinn's line — **"Length isn't the enemy; emptiness is"** — is the governing principle. Add questions only if each one either (a) feeds a visible personalization update, (b) teaches the user something, or (c) demonstrably improves downstream prediction.
- **Skip:** premature health-history collection, conditional money-back guarantees, reverse-psychology referral framing, countdown-timer paywall urgency (risky under Apple review + Nordic consumer-protection sentiment).

---

### B3. Simple (AI weight-loss coach, Palta) 🟢
**Source:** https://screensdesign.com/showcase/simple-weight-loss-coach (accessed 2026-04-21). Public financials cited: ~$200K MRR, 70K+ installs, 4.7★.

**Step sequence (40 steps):**
1. Extensive personalization quiz (start of flow).
2. Fasting-schedule builder (~05:18 — visual clock for eating windows).
3. Main dashboard preview (~04:58 — card-based daily metrics).
4. Feature demos (meal logging, Avo Vision photo capture).
5. Paywall (~03:32) after personalized plan reveal.

**Data collected:** Lifestyle, goals, eating patterns — the quiz is "incredibly thorough."

**Paywall placement:** After aha moment. No free trial — soft-paywall model with 50% discount framed as a weekly price.

**Aha moment:** Personalized plan + dashboard card preview before paywall.

**Social proof:** Testimonials on the paywall screen itself.

**Trial strategy:** No free trial. Discount anchoring ("50% off") + weekly-price framing.

**Applicability to Fitbull:**
- Weekly-price framing for the Nordic market is worth testing against the current monthly/annual presentation — NOK/EUR annual prices look big.
- Testimonials *on* the paywall (not just before it) is a tactic current Fitbull doesn't use.
- 40 steps is an upper bound we probably shouldn't hit pre-launch, but the structural lesson (quiz → plan → dashboard preview → paywall) is the skeleton.

---

### B4. Fastic (intermittent fasting) 🟢
**Source:** https://screensdesign.com/showcase/fastic-ai-food-calorie-scanner. Public financials: ~$500K MRR, 200K+ monthly installs, 4.8★.

**Step sequence (68 steps):**
1. BMI calculator + personalization quiz (00:18–05:55) with real-time feedback as weight is entered.
2. Fasting education (01:37) — animated explanation of fasting stages.
3. Goal setting + confetti celebration (01:00).
4. Plan presentation (06:17).
5. Primary paywall at 06:17 framing paid plan as the key to unlocking the program.
6. Secondary: gamified spin-the-wheel discount (07:36) for price-sensitive dismissers.
7. Dashboard (08:00) — fasting timer central.

**Data collected:** weight, BMI, goals, lifestyle.

**Paywall placement:** End of quiz. Soft paywall, no free trial.

**Aha moment:** Personalized fasting plan + predicted results with timeline.

**Social proof:** Gamification (daily flames, stars, achievements) rather than testimonials.

**Trial strategy:** No free trial; spin-the-wheel discount as a second-chance offer.

**Applicability to Fitbull:** 68 steps is long, but the "real-time feedback as user inputs weight" and the "spin-the-wheel second-chance offer" are cheap tactical adds. **Skip spin-the-wheel** — App Store policy on dark patterns is tightening and it's poor fit for a premium coach positioning.

---

### B5. Future (human-coach fitness) 🟡
**Sources:**
- https://future.co/
- https://techcrunch.com/2019/05/23/future-personal-trainer/
- https://barbend.com/future-app-review/
- https://onbetterliving.com/future-app/

**Step sequence:**
1. Short quiz: goals (slim down, beef up, longevity, etc.), schedule, equipment, experience.
2. **Coach match screen** — Future suggests 2–3 coaches with "% match" scores (e.g., "95% match for your goals"). User can also browse full coach catalog with bios.
3. **Commitment device:** 15-minute video chat with the chosen coach before workouts begin.
4. Coach builds custom program; messages proactively throughout the day.

**Data collected:** Goals, schedule, training history, equipment.

**Paywall placement:** **Before the value.** Future charges $150/mo and requires payment before the coach call — it's a hard paywall with an implicit money-back/refund.

**Aha moment:** The coach-match screen (*"Your trainer, 95% match"*) does the heavy lifting before payment; the actual aha is the 15-min video chat *after* payment.

**Social proof:** Coach bios with credentials, photos, and personality descriptors are themselves social proof — users trust the credentialed human more than the app.

**Trial strategy:** No free trial. High price + premium positioning + human commitment = a different segment of the market.

**Applicability to Fitbull:**
- **Steal:** the "match score" framing. An AI coach variant — *"Your AI plan matches your inputs at 94% — adjust before we commit"* — is a low-cost aha that also exposes intake-answer editability.
- **Steal:** the commitment-device pattern. A scheduled "first workout date" or "plan-start date" inserted during intake is a pre-commitment device that costs nothing.
- **Skip:** the hard price-first paywall. Our positioning isn't premium-human.

---

### B6. Ladder (coach-led strength training) 🟡
**Sources:**
- https://www.joinladder.com/
- https://www.joinladder.com/pricing
- https://www.outdoorsynomad.com/ladder-fitness-app-review/
- https://theeverygirl.com/ladder-app-review/

**Step sequence:**
1. Account creation.
2. Onboarding quiz — fitness goals, experience level, equipment, preferred style.
3. **Team-match quiz** — recommends coaches/teams (14 teams, 12 strength styles). Shows style bios.
4. **7-day free trial with no payment collected up-front** — users browse teams during trial.

**Data collected:** goals, experience, equipment, style preference.

**Paywall placement:** After trial. No-CC-at-sign-up → trial → full access. $29.99/mo or $179.99/yr.

**Aha moment:** The matched team + ability to sample any team during trial.

**Social proof:** Coach credentials, team communities, user reviews on App Store.

**Trial strategy:** **No-CC free trial (7 day).** This is the counterpoint to Cal AI's annual-locked trial. The PRO monthly lets users switch teams twice/month; annual unlocks unlimited switching — a feature-differentiated tier.

**Applicability to Fitbull:**
- Directly relevant to orient Q#6 (auto-trial no-CC vs with-CC vs Choose-Plan). Ladder's positioning — "let them taste it before asking for a card" — is a datapoint for the no-CC variant.
- Ladder's tier differentiation (feature-gated, not just time-gated) is a pattern for a future "Pro vs Free" variant, though out of scope for this session.

---

### B7. MacroFactor (adaptive macro coach) 🟡
**Sources:**
- https://outlift.com/macrofactor-review/
- https://feastgood.com/macrofactor-review/
- https://marrastrength.com/macrofactor-review/

**Step sequence:**
1. Short quiz — height, weight, age, goal, nutrient prefs, activity, lifting/cardio experience, "who referred you?"
2. Algorithmic initial nutrition plan generated on day one.
3. 7-day free trial (14 days via creator codes).

**Data collected:** basic anthropometrics + goals + referral attribution.

**Paywall placement:** End of quiz — 7-day free trial with CC required (typical StoreKit flow).

**Aha moment:** Day-one nutrition plan with algorithmic macros.

**Social proof:** Review aggregations from lifting-community creators (marketing layer, not in-app).

**Trial strategy:** 7-day trial; extended to 14 days through partner codes — a channel-level tactic.

**Applicability to Fitbull:**
- Straightforward, credible, minimal. Reviewers praise the onboarding as "the gentlest learning curve."
- The referral-attribution question placed *during* intake (not post-purchase) is a cheap analytics add — PostHog can consume it as a `channel` property.

---

### B8. Hevy / Strong — Minimalist Workout Trackers (counterpoint) 🟢
**Sources:**
- https://himanshuprodesign.medium.com/new-user-onboarding-ux-hevys-activity-tracker-teardown-7b796b912636
- https://screensdesign.com/showcase/hevy-workout-tracker-gym-log
- https://screensdesign.com/showcase/strong-workout-tracker-gym-log
- https://www.strong.app/

**Step sequence (Hevy):** Sign-up (forced before any value) → profile + fitness goal → pick or create a routine → log. That's it. No extensive quiz, no personalized plan.

**Step sequence (Strong):** Free-forever core → soft paywall behind premium features (advanced charts/analytics), marked with a crown icon. No forced sign-up to start logging.

**Data collected:** Minimal. Profile + goal.

**Paywall placement (Hevy):** Post-activation soft paywall gating templates/advanced features.
**Paywall placement (Strong):** Contextual — triggered when a locked feature is tapped.

**Aha moment:** For both, it's the *first logged set*. Not a personalized plan.

**Social proof:** App Store reviews; for Strong, the "Free Forever" badge is itself trust.

**Trial strategy:** Freemium. Neither runs the Noom/Cal AI-style psychological onboarding.

**Applicability to Fitbull:** This is the **counterpoint segment**. Both apps are beloved by experienced lifters who *hate* Noom-style onboarding. Our risk: if we alienate the "serious lifter" segment by making them sit through a 25-screen quiz before they can log a set. Mitigation:
- **Optional skip path** on the intake ("Experienced? Skip to the app.") that writes reasonable defaults and routes straight to the first-workout experience. Preserves the ~68% H&F median top-10% conversion from RevenueCat while not losing the Strong/Hevy power-user.
- HSProdesign's teardown critique of Hevy is instructive: *"Reduce friction by providing value before requesting credentials, create an aha moment early, design contextual onboarding rather than one-time comprehensive flows."* Fitbull should not imitate Hevy's weakness (dense log screen with no guidance); we should imitate its strength (fast time-to-first-value).

---

## Supporting evidence — paywall benchmarks and post-paywall activation

### RevenueCat State of Subscription Apps 2025–2026 🟢
**Source:** https://www.revenuecat.com/state-of-subscription-apps-2025/; https://www.revenuecat.com/blog/growth/hard-paywall-vs-soft-paywall/; https://www.revenuecat.com/blog/growth/paywalls-unexpected-uses/.

Key benchmarks directly relevant to orient Q#5 and Q#6:

- **Hard paywall vs freemium:** *"Hard paywalls convert five times better than freemium (10.7% vs 2.1% download-to-paid by day 35)"* — nearly identical Y1 retention, **21% higher 1-yr LTV**, **8× higher RPI at D14**.
- **Health & Fitness trial-to-paid:** median **39.9%**, **top 10% 68.3%** — one of the highest verticals. *But:* fitness has the **lowest first-renewal retention at 30.3%** — we win the trial, we bleed the churn.
- **Paywall sequencing A/B (RevenueCat internal):**
  - Welcome → Onboarding → Home → Paywall: **2% trial opt-in**.
  - Welcome → Paywall → Onboarding → Home: **8% trial opt-in**.
  - Welcome → 3-slide carousel → Paywall → Onboarding → Home: **15% trial opt-in**.
- **Design:** *"Simple, clear paywalls consistently outperform more branded or polished variants"* (RevenueCat CPO Hanna Grevelius).
- **Trial clarity:** Bloom is cited as best-practice for stating refund terms and charge dates explicitly.

**Caveat:** Fitbull's thesis (aha *before* paywall) runs against the "paywall-first / 15% opt-in" finding. The 15% number is for a carousel-style intro, not a Cal AI / Noom personalized-intake aha. The better comparison is **Cal AI and Simple** (aha before soft paywall) and **hard paywalls at top-decile fitness conversion**. The explore phase should triangulate this carefully — don't cargo-cult the RevenueCat carousel pattern.

### Post-paywall activation 🟢
**Source:** https://www.retention.blog/p/onboarding-doesnt-end-at-the-paywall.

Key pattern — guided first experience, not drop-to-home. Imprint targets "Daily Goal: 2 Lessons" as a D1 activation metric; users who hit it convert trial → paid at a materially higher rate. Checklist pattern (A1 Mural) reappears post-paywall. Gamification (streaks, XP) drops in here.

**Applicability to Fitbull:** Our D1/D7 success metrics map cleanly — "log first workout OR generate first plan OR send first chat" is our equivalent of the "2 lessons" activation gate. This is what the post-paywall checklist should optimize for.

---

## Supporting evidence — pre-launch social proof

### Briefd — Seven alternatives when you have zero customers 🟡
**Source:** https://briefd.it/blog/social-proof-startups-zero-customers/.

Relevant to orient Q#14 (we have no real social-proof assets). Options that don't require inventing testimonials:

1. **Trusted advisors** — "Advised by [Name], former VP of Product at [Known Company]" (need to confirm whether we have any).
2. **Founder credentials** — domain authority as a credibility transfer (Sebastian's own running/training background, if we want to lean on it).
3. **Waitlist numbers** — "847 founders on the waitlist" as proof-of-demand. Requires actually running a waitlist.
4. **Research insights** — citing primary research that motivated the product (e.g., "Studies show X% of trainees lose gains from poor tracking").
5. **Scientific backing** — peer-reviewed citations on claims (e.g., progressive overload, RPE methodology).
6. **Use aggregate intent stats ("1,200 Norwegians signed up this week")** once any installs exist.
7. **Named partner logos** — not applicable pre-launch.

Core principle from the piece: *"Trust is the absence of reasons to doubt. Every empty section, vague claim, or 'coming soon' placeholder adds a reason to doubt."*

**Applicability to Fitbull:** Pre-launch, use science-backing + founder note + research-insight framing. **Don't invent testimonials or "join X users" counters.** Once TestFlight expands, aggregate-intent framing becomes available.

---

## Patterns That Keep Winning

1. **Aha before paywall, every time.** Cal AI, Simple, Fastic, Noom, Grammarly — the personalized plan reveal precedes the ask. Grammarly's +10-20% upgrade lift on personalized pricing (A5) is the cleanest A/B evidence.
2. **One question per screen.** Houzz +15% (A3). Universal across Cal AI, Noom, Simple, Fastic. Single-scroll forms are dead for subscription onboarding.
3. **Multi-select for intent.** Headspace +10% trial conversion (A4). Propagated to Duolingo, Thrive, How We Feel.
4. **Live projection / updating outcome.** Noom's moving goal-date. Cal AI's pace slider. The outcome updates while the user inputs data — this is the operational-transparency + reciprocity hybrid that makes long flows tolerable.
5. **Loading-screen theater.** "Analyzing your profile / Generating your plan" with a progress bar. Doubles duty: hides real API latency, communicates effort, signals personalization. Cal AI, Noom, Simple, Fastic all do this.
6. **Per-screen acknowledgement.** "Thanks for sharing — that's a big first step." Turns data collection into a conversation. Noom is the master; DSC's conversational tone (A2) is the same principle.
7. **Section progress bars.** Multiple bars for distinct sections (demographics / goals / habits) reduce perceived length vs. one long bar.
8. **Personalized pricing copy.** "Based on what you told us, we recommend…" (Grammarly A5, Cal AI, Simple, Fastic).
9. **Checklist post-paywall.** Mural +10% week-1 retention (A1). Reappears in Imprint and most modern SaaS onboarding.
10. **Stat + testimonial interstitials between question clusters.** Noom's main trust-building mechanic.
11. **Annual-with-trial, monthly-without-trial.** Cal AI standard. Nudges annual commitment without being a hard paywall.
12. **Trial clarity.** Explicit charge dates and refund terms (Bloom, per RevenueCat). Fights App Store rejection risk and builds trust simultaneously.

## Patterns That Keep Losing

1. **Feature-tour carousels with no personalization.** Fitbull's current state. Data-free; doesn't earn the paywall.
2. **Paywall before any value signal.** RevenueCat's own benchmark shows 2% opt-in when paywall comes last after generic onboarding — but the better alternative isn't "paywall first" (15%), it's "personalized aha first, then paywall" (Cal AI's top-decile fitness numbers).
3. **Forced sign-up before value.** HSProdesign's Hevy critique. Hevy rates 4.9★ despite this; imagine with the friction removed.
4. **Simultaneous pop-ups and spotlights.** Mural's pre-test state. Our current 8-step spotlight tour is adjacent to this anti-pattern.
5. **Dark-pattern urgency.** Spin-the-wheel (Fastic), unredeemable money-back guarantees (Noom), reverse-psychology referral framing (Noom). Rejected for Fitbull on App Store policy + Nordic consumer-protection grounds.
6. **Mid-onboarding review prompts.** Cal AI does this; it's borderline Apple policy. Skip.
7. **Empty-screen padding.** Rushfinn's *"Length isn't the enemy; emptiness is."* Every screen must do work (question, acknowledgement, projection update, education, or proof).
8. **Generic paywall copy.** "Unlock Premium" vs. "Unlock your 4-day strength plan starting Monday." Grammarly's +10-20% (A5) is the clearest evidence.
9. **Dropping to home post-paywall.** Imprint case study. No activation scaffold = wasted conversion.
10. **Hidden value proposition.** The Behavioral Scientist's Noom critique — requiring 30 minutes before the user understands the product. Works for Noom only because the ad-level promise is specific; not something to imitate at our ad budget.

## Gaps / Unable to Verify

1. **Growth.design Grammarly page** returned 403 on direct fetch. The key findings (10%+ upgrade lift with personalized paywall; "5 Do's" framing around Spark Effect, Framing, Reciprocity) were verified via Google search snippets and cross-reference with abtest.design and insidergrowthhq. Direct screen-level detail would need a browser fetch; not blocking.
2. **Cal AI exact screen count and copy.** ScreensDesign gives ~28 steps and timestamps; Mobbin has frame-by-frame screenshots behind a paywall. Adam Lyttle's YouTube video (referenced but not transcribed here) likely has the most explicit walk-through. Worth a direct Mobbin or YouTube pass during the explore phase if screen-exact reference is needed.
3. **Exact Cal AI conversion numbers.** The "$1M/mo" figure for Cal AI comes from Adam Lyttle's promotional material; not independently verified in a RevenueCat benchmark.
4. **Noom's precise screen count varies** between sources (96 per Retention.blog, 113 per Growthwaves). The variance likely reflects A/B cohort or market — not a contradiction, but flag for explore phase.
5. **Headspace's A4 test details** — abtest.design gives the lift number but not the control/variant phrasing. Insidergrowthhq has more context on the Headspace case studies page (noted as A9) but I did not deep-fetch it.
6. **Nordic-first localization evidence.** None of the swept teardowns are Nordic-specific. Vipps/MobilePay/Klarna integration evidence, Norwegian consumer-protection rules around auto-trial, and GDPR touchpoints for PostHog analytics all remain unsearched — proper scope for orient #15 and D2, not this scout pass.
7. **Apple Health prefill UX evidence.** Apple's developer docs (https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data, https://developer.apple.com/health-fitness/) cover the *API* but not the *UX pattern* of "prompt → prefill → review." Teardowns of health-first apps (MyFitnessPal, Whoop, Oura) would fill this. Scope for the HealthKit explorer.
8. **Paid-trial vs free-trial economics for Nordic market.** RevenueCat benchmarks are US-skewed. Nordic markets may behave differently on price-anchoring and trial-length preferences. Flag for the monetization explorer.
9. **Convex anonymous-auth capability.** Out of scope for prior art but orient Q#1 depends on it; the auth explorer owns this.

---

## Recommended reading order for downstream explorers

1. **Monetization / paywall timing** (Q#5, Q#6, Q#13): A5, A6, B1 (Cal AI), B5 (Future), B6 (Ladder), + RevenueCat benchmarks section.
2. **Intake UX** (Q#7, Q#8, Q#10): A3, A4, B2 (Noom), B3 (Simple), B1 (Cal AI) — especially the live-projection + loading-screen patterns.
3. **AI aha moment** (Q#4): B1 (Cal AI plan-generation loader), B2 (Noom's goal-projection update loop).
4. **HealthKit integration** (Q#9): gap — none of the swept teardowns cover this well. Apple docs + a targeted teardown of MyFitnessPal/Whoop/Oura needed.
5. **Post-paywall activation**: A1 (Mural checklist), retention.blog's Imprint case study.
6. **Social proof strategy** (Q#14): Briefd's seven alternatives + Noom's stat/testimonial interstitial pattern (but ethically filtered).
7. **Counterpoint for power-user segment**: B8 (Hevy/Strong). Non-optional read — our risk of alienation lives here.
