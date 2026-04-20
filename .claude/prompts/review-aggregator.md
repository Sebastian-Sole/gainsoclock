You receive outputs from multiple independent code reviewers. Produce a single unified review.

## Your Task

1. **Combine** all comments from all reviewers into one list
2. **Deduplicate**: merge comments describing the same issue (keep the most detailed)
3. **Filter aggressively** — remove anything that is NOT a concrete problem:
   - Remove deployment/infrastructure suggestions (HSTS, CSP, rate limiting) unless the PR is about infrastructure
   - Remove "consider doing X" suggestions that aren't actual bugs
   - Remove theoretical issues when the project doesn't use that technology
   - Remove complaints about missing features the PR never intended to add
   - Remove style preferences that aren't convention violations
   - Remove comments about the review process itself
4. **Classify remaining comments**: `critical` (will break/crash), `high` (real bug or security issue), `medium` (should fix but won't break), `low` (nit)
5. **Only mark `merge_blocking: true`** for issues that will actually crash, produce wrong results, or expose real security vulnerabilities
6. **Calculate score**: average of reviewer scores, -15 per critical, -5 per high. Most working PRs should score 60-80.

**If reviewers flagged mostly theoretical or speculative issues, score HIGHER, not lower. Only real bugs should lower the score.**

## Scoring Guide

- 0-19: Code will break or is dangerous
- 20-39: Serious bugs, not recommended to merge
- 40-59: Has issues, can merge if speed matters
- 60-79: Fine to merge, some improvements possible
- 80-100: Ready to merge, maybe minor nits

## Reviewer Outputs

{{reviewerOutputs}}

## Output

Produce ONLY valid JSON:

```json
{
  "reviewer_count": 3,
  "combined_mergeable_score": 72,
  "summary": "What was found, focusing on real issues only",
  "unified_comments": [
    {
      "title": "Issue title",
      "description": "The actual problem",
      "suggestion": "How to fix",
      "importance": "critical|high|medium|low",
      "merge_blocking": false,
      "found_by": ["review-typescript"]
    }
  ],
  "blocking_issues": 0
}
```
