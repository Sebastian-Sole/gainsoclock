# Session Metrics: onboarding-flow

## Explore

| Agent | Topic | Perspective | Tokens | Tools | Duration |
|-------|-------|-------------|--------|-------|----------|
| loadout | Tool/MCP recommendations | — | 31,814 | 11 | 81s |
| scout | Prior art sweep (10 case studies + 8 competitor teardowns) | Scout | 80,057 | 47 | 425s |
| explorer | Auth & Data Spine | White Hat | 78,518 | 46 | 277s |
| explorer | HealthKit + Privacy (Ingrid, Nordic user) | Stakeholder | 63,084 | 21 | 428s |
| explorer | PostHog Measurement | White Hat | 57,923 | 30 | 318s |
| explorer | AI Aha Moment | White Hat | 108,950 | 43 | 346s |
| explorer | AI Aha Moment | Pre-mortem | 58,010 | 16 | 185s |
| explorer | Intake UX | Naive | 67,828 | 25 | 287s |
| explorer | Intake UX | Green Hat | 59,155 | 20 | 459s |
| explorer | Nordic Localization | White Hat | 136,787 | 63 | 944s |
| explorer | Monetization | White Hat | 86,573 | 45 | 321s |
| explorer | Monetization | Black Hat | 101,928 | 30 | 424s |
| explorer | Intake UX (evidence from cases) | White Hat | 71,035 | 19 | 387s |
| explorer | Social Proof & Trust | Yellow Hat | 63,441 | 17 | 294s |
| **Phase total** | | | **1,065,103** | **433** | **5,176s** |

*Wall-clock time was lower than summed duration — scout + 8 explorers ran in parallel (wave 1), then 4 scout-dependent explorers in parallel (wave 2).*

## Rotate

| Agent | Topic (reviewed) | Perspective | Tokens | Tools | Duration |
|-------|------------------|-------------|--------|-------|----------|
| rotation | Yellow Hat — Social Proof | Black Hat | 68,447 | 15 | 301s |
| rotation | Black Hat — Monetization | Yellow Hat | 59,520 | 12 | 278s |
| rotation | White Hat — AI Aha | Naive | 55,205 | 8 | 263s |
| rotation | Green Hat — Intake (9 shapes) | Pre-mortem | 54,568 | 8 | 260s |
| rotation | Stakeholder — HealthKit (Ingrid) | White Hat | 65,528 | 19 | 360s |
| rotation | Pre-mortem — AI Aha | Green Hat | 72,330 | 9 | 406s |
| rotation | Naive — Intake | Black Hat | 66,834 | 11 | 196s |
| rotation | White Hat — Nordic Localization | Stakeholder (Ingrid) | 45,167 | 9 | 148s |
| **Phase total** | | | **487,599** | **91** | **2,212s** |

*All 8 rotations ran in parallel. Wall-clock ≈ 406s (longest agent).*

## Synthesize

| Agent | Topic | Tokens | Tools | Duration |
|-------|-------|--------|-------|----------|
| synthesizer | Unified analysis (14 explore + 8 rotations) | 264,518 | 27 | 1,122s |

## Plan

| Agent | Domain | Tokens | Tools | Duration |
|-------|--------|--------|-------|----------|
| planner | Master plan | 113,957 | 24 | 500s |
| reviewer | Security | 62,519 | 12 | 171s |
| reviewer | HealthKit & Privacy | 72,486 | 13 | 190s |
| reviewer | AI Coach Safety | 86,429 | 12 | 180s |
| reviewer | Convex Realtime | 72,637 | 11 | 160s |
| reviewer | Performance | 72,327 | 9 | 147s |
| reviewer | RevenueCat / Subscriptions | 94,975 | 14 | 230s |
| reviewer | Mobile Accessibility | 55,058 | 9 | 161s |
| reviewer | Offline Sync | 57,747 | 8 | 135s |
| reviewer | UX Evaluation | 108,592 | 12 | 254s |
| **Phase total** | | **796,727** | **124** | **2,128s** |

*Planner ran first. All 9 reviewers ran in parallel (wall-clock ≈ 254s, longest reviewer).*

## Plan v2 (revision + re-review)

| Agent | Domain | Tokens | Tools | Duration | v1 → v2 Verdict |
|-------|--------|--------|-------|----------|-----------------|
| planner | Revised master plan + changelog | 170,548 | 14 | 851s | — |
| reviewer | Security | 75,064 | 8 | 111s | CHANGES NEEDED → APPROVED |
| reviewer | HealthKit & Privacy | 58,255 | 11 | 124s | CHANGES NEEDED → APPROVED |
| reviewer | AI Coach Safety | 50,512 | 9 | 97s | CHANGES NEEDED → APPROVED |
| reviewer | Convex Realtime | 53,689 | 9 | 92s | CHANGES NEEDED → APPROVED |
| reviewer | Performance | 56,178 | 16 | 108s | CHANGES NEEDED → APPROVED |
| reviewer | RevenueCat / Subscriptions | 53,818 | 8 | 109s | CHANGES NEEDED → APPROVED |
| reviewer | Mobile Accessibility | 64,673 | 9 | 115s | CHANGES NEEDED → APPROVED |
| reviewer | Offline Sync | 50,328 | 9 | 90s | CHANGES NEEDED → APPROVED |
| reviewer | UX Evaluation | 55,883 | 11 | 104s | CHANGES NEEDED → APPROVED |
| **Phase total** | | **688,948** | **104** | **1,801s** | **9/9 APPROVED** |

*Planner v2 ran first. All 9 reviewers ran in parallel (wall-clock ≈ 124s).*

## Cumulative

| Phase | Tokens | Tools | Duration |
|-------|--------|-------|----------|
| Explore | 1,065,103 | 433 | 5,176s |
| Rotate | 487,599 | 91 | 2,212s |
| Synthesize | 264,518 | 27 | 1,122s |
| Plan | 796,727 | 124 | 2,128s |
| Plan v2 | 688,948 | 104 | 1,801s |
| Split | 213,419 | 21 | 1,907s |
| **Total so far** | **3,516,314** | **800** | **14,346s** |

## Split

| Agent | Output | Tokens | Tools | Duration |
|-------|--------|--------|-------|----------|
| splitter | 11 sub-plans (3,886 lines total) | 213,419 | 21 | 1,907s |
