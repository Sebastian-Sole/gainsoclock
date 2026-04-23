# White Hat — Intake UX

**Session:** `onboarding-flow`
**Perspective:** White Hat (facts only, no opinions, no recommendations)
**Date:** 2026-04-21
**Scope:** Distillation of `research/prior-art/scout.md` on intake-UX questions + targeted gap-fill fetches.

Confidence tags: 🟢 primary (A/B test number, case study, timestamped teardown), 🟡 secondary (third-party summary or vendor blog), 🔴 unable to verify.

---

## 1. Intake question count — what scout establishes

Scout surfaces **no single "optimal count" A/B test**; it establishes a range and a governing principle.

**Competitor step counts 🟢 (scout §B1–B8):**
- Cal AI: "≈28 steps, 00:15–02:30" (screensdesign timestamped teardown).
- Noom: "113 screens, ~15 minutes" (Growthwaves) / "~96 screens" (Retention.blog). Scout §Gaps #4 flags the variance as "likely reflects A/B cohort or market."
- Simple: "40 steps."
- Fastic: "68 steps."
- Future: "Short quiz" (no count).
- Ladder: quiz + team-match quiz (no count).
- MacroFactor: "Short quiz — height, weight, age, goal, nutrient prefs, activity, lifting/cardio experience, 'who referred you?'"
- Hevy / Strong: "Sign-up → profile + fitness goal → pick or create a routine → log. That's it."

**Governing principle 🟢 (scout §B2, quoting Rushfinn/Retention.blog):** **"Length isn't the enemy; emptiness is."** Scout's gloss: add a question only if it "(a) feeds a visible personalization update, (b) teaches the user something, or (c) demonstrably improves downstream prediction."

**Grammarly:** Scout §A5 cites Grammarly's onboarding survey as the personalized-pricing anchor (+10–20% upgrade rates) but pins no exact count. Growth.design returned 403; findings verified via Google snippets + cross-reference (scout §Gaps #1).

**Gap-fill 🟡:** [Userpilot 2025 benchmark](https://userpilot.com/blog/onboarding-checklist-completion-rate-benchmarks/) claims "reducing the number of onboarding steps by 30% can increase completion rates by up to 50%" — aggregate SaaS, not a single A/B, vendor source.

---

## 2. Single-scroll vs. one-question-per-screen

Scout §A3 is the direct A/B:

> **Houzz — Separating Contact Information Into Multiple Screens 🟢** (`abtest.design/tests/separating-contact-information-into-multiple-screens`)
> Single form (name + email + phone on one screen) vs. three sequential screens. Winner: multi-screen. **"15+% increase in conversion rate."** Insidergrowthhq adds: "less than 1 week's work."
> Mechanism: "Perceived-effort reduction. One question per screen feels shorter than one form — the Zeigarnik/commitment effect kicks in after the first tap. Also known as 'the slot-machine effect.'"

Scout "Patterns That Keep Winning" §2: **"One question per screen. Houzz +15% (A3). Universal across Cal AI, Noom, Simple, Fastic. Single-scroll forms are dead for subscription onboarding."** No counter-evidence in scout.

---

## 3. Conversational tone vs. form tone

Scout §A2:

> **Dollar Shave Club — Conversational Tone 🟢** (`conversion.com/case-study/dollar-shave-club/`; `abtest.design/tests/conversational-tone-in-onboarding`)
> "Rewriting subscription funnel copy from a formal/marketing voice to DSC's brand-native conversational tone… Winner: **'5.24% increase in subscriptions'** from conversational copy alone. Two adjacent tests added 11.2% and 6.8% respectively, for a **17%+ combined subscription lift** across experiments one and two."

**Supporting teardowns 🟢:**
- Noom (§B2): per-screen acknowledgement — *"Thank you for sharing — that's an important first step."*
- Cal AI (§B1): "deep personalization questions" phrased conversationally.
- Scout "Patterns That Keep Winning" §6: *"Per-screen acknowledgement… Noom is the master; DSC's conversational tone (A2) is the same principle."*

Adjacent DSC tactics: "defaults off, itemized value breakdowns, discount-qualification callouts."

---

## 4. Separating contact info into multiple screens (paste)

Same test as Q2. Full winning variant + mechanism:

> Winner: multi-screen variant. **"15+% increase in conversion rate"** (abtest.design). "Less than 1 week's work" (insidergrowthhq).
> Mechanism: perceived-effort reduction; Zeigarnik/commitment effect after first tap; slot-machine effect.

Scout applicability: "Directly applicable to the intake (goal, experience, days/week, equipment, age, sex, height, weight, activity)."

---

## 5. Ordering effects

Scout surfaces **no direct intra-intake A/B on question order**. Competitor practice is divided:

**🟢 scout §B1–B7:**
- Cal AI: demo → **goals (multi-select)** → age/sex/height/weight → activity → pace slider → psychographics → loader → plan → paywall.
- Noom: **demographics → weight-loss goals → eating habits**.
- Fastic: **BMI/weight → fasting education → goal setting**.
- Future: **goals → schedule → equipment → experience → coach match**.
- Simple: "extensive personalization quiz (start of flow)" — order not published.

Scout: no consensus; Noom + Fastic lead with body/demographics, Cal AI + Future lead with goals.

**RevenueCat whole-flow sequencing A/B 🟢 (scout §RevenueCat benchmarks) — applies to flow placement, not intra-intake order:**
- Welcome → Onboarding → Home → Paywall: **2% trial opt-in**.
- Welcome → Paywall → Onboarding → Home: **8% trial opt-in**.
- Welcome → 3-slide carousel → Paywall → Onboarding → Home: **15% trial opt-in**.

Scout caveat: "don't cargo-cult the RevenueCat carousel pattern" — compared set is generic onboarding, not Cal-AI-style personalized intake → soft paywall.

---

## 6. Multi-intent queries (Headspace)

Scout §A4:

> **Headspace — Multi-Intent Queries 🟢** (`abtest.design/tests/onboarding-with-multi-intent-queries`)
> Single-select vs. multi-select for "Why are you here?" Winner: multi-select. **"10% increase in free trial conversion."** Pattern propagated to Thrive Market, Duolingo, How We Feel.
> Mechanism: "Single-select forces users to flatten reality. Multi-select respects compound motivations and gives the app more signal for downstream personalization."

Scout applies: "The 'primary goal' question (lose fat / build muscle / strength / endurance / general fitness) should accept multiple selections, with one flagged as primary."

Scout §Gaps #5: "abtest.design gives the lift number but not the control/variant phrasing."

---

## 7. Onboarding checklist pattern (Mural)

Scout §A1 — positioned as **post-onboarding, not embedded during intake**:

> **Mural — Onboarding Checklist 🟢** (`abtest.design/tests/onboarding-checklist`)
> "Swapping confusing pop-ups and banners for a single linear five-step checklist tied to actions known to predict long-term engagement. Winner: **'10% relative increase in 1 week retention.'** Folk and Deel were spotted running the same pattern."

Scout placement: *"A five-item **post-paywall** checklist anchored on known activation signals (log first workout, generate first plan, send first chat to the AI coach, import HealthKit, set weekly target)."*

Reinforcement 🟢 (scout §Post-paywall activation, retention.blog): Imprint's "Daily Goal: 2 Lessons" gate; users who hit it "convert trial → paid at a materially higher rate. Checklist pattern (A1 Mural) reappears post-paywall."

Scout surfaces **no evidence of the checklist embedded inside intake**.

---

## 8. Competitor intake comparison table

Built from scout §B1–B8.

| App | Intake length | Ordering (first → last within intake) | Tone | Source |
|---|---|---|---|---|
| **Cal AI** | ~28 steps (00:15–02:30) 🟢 | Demo → goal (multi-select) → age/sex/height/weight → activity/frequency → pace slider (live goal-date) → psychographics → loader → plan | Conversational; "deep personalization questions (barriers, eating habits)" | §B1 |
| **Noom** | 96–113 screens (~15 min) 🟢 | Demographics → weight-loss goals → eating habits; interleaved stats, testimonials, loaders, education | Conversational; per-screen acknowledgement | §B2 |
| **Fastic** | 68 steps 🟢 | BMI calc → fasting education → goal setting (confetti) → plan → paywall → spin-the-wheel → dashboard | Gamified; education interleaved | §B4 |
| **Simple** | 40 steps 🟢 | Quiz (start) → fasting-schedule builder → dashboard preview → feature demos → paywall | Conversational; testimonials on paywall | §B3 |
| **Future** | "Short quiz" 🟡 | Goals → schedule → equipment → experience → coach-match (% match) → post-pay video chat | Premium/human-centered; coach bios as copy | §B5 |
| **Ladder** | Quiz + team-match 🟡 | Account → goals/experience/equipment/style → team match → 7-day no-CC trial | Team/coach-community framing | §B6 |
| **MacroFactor** | "Short quiz" 🟡 | Height/weight/age → goal → nutrient prefs → activity → lifting/cardio experience → referral attribution | Minimalist; "the gentlest learning curve" | §B7 |
| **Hevy / Strong** | Sign-up + profile + goal only (no quiz) 🟢 | Sign-up → profile + goal → pick/create routine → log (Hevy); Strong: no forced sign-up, contextual paywall | Minimalist/neutral | §B8 |

**Power-user caveat 🟢 (scout §B8):** "Both apps are beloved by experienced lifters who *hate* Noom-style onboarding. Our risk: if we alienate the 'serious lifter' segment by making them sit through a 25-screen quiz before they can log a set."

---

## 9. Progress indicators

Scout does **not** quote a direct A/B on progress bars. Pattern-level observation 🟢 (scout §B2): Noom uses "progress bars per section." Scout "Patterns That Keep Winning" §7: *"Section progress bars. Multiple bars for distinct sections (demographics / goals / habits) reduce perceived length vs. one long bar."* No delta attached.

**Gap-fill:**
- **University of Nebraska-Lincoln (via [Userpilot](https://userpilot.com/blog/onboarding-checklist-completion-rate-benchmarks/)) 🟡:** "Users who view an animated progress bar wait 3 times longer before clicking away than a control group who saw no progress indicator." Primary study not directly fetched.
- **Goal-gradient effect — Kivetz, Urminsky, Zheng (2006) 🟢:** peer-reviewed [U. Chicago PDF](https://home.uchicago.edu/ourminsky/Goal-Gradient_Illusionary_Goal_Progress.pdf). Loyalty-program purchase acceleration as users approach rewards thresholds. Foundational, not an onboarding A/B.
- **Endowed-progress effect 🟡:** starting a bar above 0% raises completion probability ([Learning Loop](https://learningloop.io/plays/psychology/goal-gradient-effect), [Laws of UX](https://lawsofux.com/goal-gradient-effect/)). No fitness-specific A/B delta.
- **Counter-evidence 🟡:** [Irrational Labs — "When Progress Bars Backfire"](https://irrationallabs.com/blog/knowledge-cuts-both-ways-when-progress-bars-backfire/). A "long, unfilled progress bar" can deter by visualizing remaining work. No quantitative delta.
- **Userpilot aggregate 🟡:** "progress indicators and milestone celebrations can boost onboarding completion rates by 33%." Vendor source.

---

## 10. Input types — wheel pickers vs. free text vs. sliders vs. dropdowns

Not covered in scout. Gap-fill:

**Birthday / memorized-data inputs 🟢 ([Smashing Magazine, 2021](https://www.smashingmagazine.com/2021/05/frustrating-design-patterns-birthday-picker/)):**
- Native date pickers: *"come along with plenty of accessibility nightmares"* and require *"dozens and dozens of taps or clicks."*
- Dropdowns: *"slow navigation, zooming issues on mobile, fatigue from pinching scrollable options, and excessive space consumption. The year list is particularly cumbersome."*
- Recommended: three separate labeled fields (day / month / year) because *"users have a particular string of digits in mind."*
- No measured time-on-task or error-rate numbers.

**Baymard mobile-form research 🟢 ([Baymard](https://baymard.com/blog/mobile-form-usability-single-input-fields), [Baymard input fields](https://baymard.com/learn/input-fields)):**
- *"89% of users ignored formatting examples and entered data differently."*
- *"38% of test participants abandoned checkout at the security code field."*
- *"10–15+ visible form fields intimidate users and harm conversion."*
- Baymard: subjects *"struggle with inputs that were split across multiple fields, such as a phone number divided into three fields."*
- Google (via Baymard) 🟡: *"auto-filling helps people fill out forms 30% faster."*

**Slider + live outcome (scout §B1, §B2, §B4) 🟢 — pattern, not A/B delta:**
- Cal AI: "Interactive weight-loss-speed selector at 01:05 — drag to set pace, goal date updates live."
- Fastic: "real-time feedback as user inputs weight."
- Noom: "goal-weight projection updated live."

**Verified gap:** No source produced a direct A/B quantifying wheel picker vs. numeric text input friction for age/weight in a fitness-app context.

---

## 11. Commitment moments — retention/conversion evidence

Scout surfaces commitment-device patterns but does **not** attach a retention/conversion A/B delta to any of them.

- **Future coach pledge 🟡 (scout §B5):** "15-minute video chat with the chosen coach before workouts begin… Future charges $150/mo and requires payment before the coach call." Scout: "A scheduled 'first workout date' or 'plan-start date' inserted during intake is a pre-commitment device that costs nothing." No delta.
- **Noom projection 🟢-pattern / 🟡-delta (scout §B2):** "The live goal-date projection (updated repeatedly) *is* the aha." "Lifestyle events ('any weddings or vacations coming up?' — urgency-anchoring)." Scout does not quote a Noom A/B number for the projection mechanic specifically.
- **Cal AI pace slider 🟢-pattern (scout §B1):** No A/B number attached.
- **Closest quantitative proxy 🟢:** Headspace multi-intent (§A4) — intent-declaration functions as soft commitment, lifted trial conversion **+10%**.

**Gap-fill 🟡:** [amalgama.co](https://amalgama.co/the-psychology-behind-fitness-apps-onboarding/) / [fitnessondemand247](https://www.fitnessondemand247.com/news/fitness-app-onboarding) assert *"users who complete their first workout show 2-3x higher lifetime value"* and *"well-optimized onboarding can push 7-day active rates from 25-35% to 45-55%+."* Neither is a controlled A/B on commitment-moment copy.

---

## 12. Gaps — what we still don't know about intake

1. **Optimal intake length with a fitness-vertical A/B delta.** Scout gives the range (3 screens Hevy → 113 Noom) and the "emptiness not length" principle. No controlled "20 vs. 30 questions" test surfaced.
2. **Intra-intake question-order A/B.** No controlled test of demographics-first vs. goals-first vs. easy-first. Competitor practice is split.
3. **Wheel picker vs. numeric text input A/B** for weight/height/age on mobile. Baymard + Smashing provide heuristics only.
4. **Progress-indicator A/B delta specific to fitness-app onboarding.** Nebraska 3× dwell-time figure is propagated through vendor blogs; primary source not directly fetched. No fitness-specific A/B.
5. **Segmented vs. single progress bar A/B.** Scout's "section bars reduce perceived length" is observational, not cited.
6. **Commitment-moment retention A/B.** Future pledge, Noom projection, Cal AI pace slider all lack attached deltas in reviewed sources.
7. **Cal AI exact conversion numbers** (scout §Gaps #3). "$1M/mo" figure is promotional.
8. **Noom screen count variance** (scout §Gaps #4). 96 vs. 113 unresolved.
9. **Apple Health prefill UX evidence** (scout §Gaps #7) — deferred to HealthKit explorer.
10. **Conversational-tone ceiling.** DSC's +5.24% is established; the inflection point at which tone reads gimmicky is not.
11. **Multi-intent query control/variant phrasing** (scout §Gaps #5). Lift known, wording not.
12. **Nordic-market intake behavior.** No Nordic-specific evidence surfaced; deferred to localization explorer.

---

## Sources cited (new fetches beyond scout)

- [Userpilot 2025 Onboarding Benchmark Report](https://userpilot.com/blog/onboarding-checklist-completion-rate-benchmarks/) 🟡
- [Kivetz, Urminsky, Zheng 2006 — Goal-Gradient Hypothesis, U. Chicago PDF](https://home.uchicago.edu/ourminsky/Goal-Gradient_Illusionary_Goal_Progress.pdf) 🟢
- [Learning Loop — Goal Gradient Effect](https://learningloop.io/plays/psychology/goal-gradient-effect) 🟡
- [Laws of UX — Goal-Gradient Effect](https://lawsofux.com/goal-gradient-effect/) 🟡
- [Irrational Labs — When Progress Bars Backfire](https://irrationallabs.com/blog/knowledge-cuts-both-ways-when-progress-bars-backfire/) 🟡
- [Smashing Magazine — Frustrating Design Patterns: Birthday Picker (2021)](https://www.smashingmagazine.com/2021/05/frustrating-design-patterns-birthday-picker/) 🟢
- [Baymard — Mobile Form Usability: Avoid Splitting Single Input Entities](https://baymard.com/blog/mobile-form-usability-single-input-fields) 🟢
- [Baymard — 8 Recommendations for Creating Effective Input Fields](https://baymard.com/learn/input-fields) 🟢
- [NN/g — Easier Input on Mobile Devices (video landing)](https://www.nngroup.com/videos/mobile-input-fields/) 🔴 (content in video, not extractable)
- [Amalgama — Psychology Behind Fitness App Onboarding](https://amalgama.co/the-psychology-behind-fitness-apps-onboarding/) 🟡
- [FitnessOnDemand247 — Fitness App Onboarding](https://www.fitnessondemand247.com/news/fitness-app-onboarding) 🟡

Scout citations (§A1–A10, §B1–B8, §RevenueCat benchmarks, §Post-paywall activation) are reproduced via quotation.
