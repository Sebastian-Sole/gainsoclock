---
name: screen-reader-test
description: "Fires when asked to generate screen reader test scripts, prepare for VoiceOver/NVDA testing, or verify screen reader accessibility."
user-invocable: true
allowed-tools:
  - Read
  - Glob
  - Grep
---

# Screen Reader Test Script Generator

Generate step-by-step screen reader testing scripts for VoiceOver (macOS) and NVDA (Windows). Maps directly to the 17 user test tasks for the May 2026 evaluation.

## Usage

```
/screen-reader-test                # Generate for all critical flows
/screen-reader-test L-3            # Generate for specific user test
/screen-reader-test /search        # Generate for specific route
```

## Process

### 1. Determine Scope

Parse `$ARGUMENTS`:
- User test IDs: read `docs/synthesis/01-user-test-spec.md` for task details
- Route paths: read source files to understand page structure
- Empty: generate for the 5 critical flows (see below)

### 2. Read Page Structure

For each page, understand:
- Landmarks (`<nav>`, `<main>`, `<aside>`, `<footer>`)
- Heading hierarchy (`<h1>` through `<h6>`)
- Form controls and their labels
- Dynamic content regions (`aria-live`)
- Base UI components (cross-ref 005 findings for known SR issues)

### 3. Generate VoiceOver Script

For each flow, output a testing script with exact keystrokes:

```markdown
## Screen Reader Test: <Flow Name>
**Route**: <url>
**User Test**: <A-X or L-X>
**Screen Reader**: VoiceOver (macOS)
**Browser**: Safari
**Tester**: _______________
**Date**: _______________

### Setup
1. Open Safari, navigate to <url>
2. Enable VoiceOver: Cmd + F5
3. Press VO+A to start reading page from top

### Expected Announcements

| Step | Action | VoiceOver Keys | Expected Announcement | Pass? |
|------|--------|---------------|----------------------|-------|
| 1 | Page loads | (automatic) | "Bergen Offentlige Bibliotek - <page title>" | [ ] |
| 2 | Navigate to main | VO + Cmd + J (landmarks) | "main landmark" | [ ] |
| 3 | Find heading | VO + Cmd + H | "heading level 1, <page heading>" | [ ] |
| 4 | <next step> | <keys> | <expected> | [ ] |

### VoiceOver Quick Reference
| Action | Keys |
|--------|------|
| Start/stop VoiceOver | Cmd + F5 |
| VO modifier | Ctrl + Option (VO) |
| Read next item | VO + Right |
| Read previous item | VO + Left |
| Activate element | VO + Space |
| Navigate landmarks | VO + Cmd + J, then arrows |
| Navigate headings | VO + Cmd + H |
| Navigate links | VO + Cmd + L |
| Navigate form controls | VO + Cmd + F |
| Open rotor | VO + U |
| Read from cursor | VO + A |
| Stop reading | Ctrl |

### Findings
| # | Severity | Description | WCAG SC |
|---|----------|-------------|---------|
| | | | |
```

### 4. Generate NVDA Script

Same flow but with NVDA-specific keystrokes:

```markdown
### NVDA Quick Reference
| Action | Keys |
|--------|------|
| Start NVDA | Ctrl + Alt + N |
| Stop reading | Ctrl |
| Read next item | Down Arrow |
| Read previous item | Up Arrow |
| Activate element | Enter or Space |
| Browse mode | NVDA + Space (toggle) |
| Navigate headings | H (next), Shift+H (prev) |
| Navigate landmarks | D (next), Shift+D (prev) |
| Navigate form fields | F (next), Shift+F (prev) |
| Navigate links | K (next), Shift+K (prev) |
| Navigate buttons | B (next), Shift+B (prev) |
| Elements list | NVDA + F7 |
| Read title | NVDA + T |
```

## Critical Flows (Default Scope)

When no arguments given, generate scripts for these 5 flows:

| Priority | Flow | User Tests | Why Critical |
|----------|------|-----------|--------------|
| 1 | Search + reserve book | L-3, L-4 | Core UX, Combobox has known SR issues |
| 2 | My Page (loans, reservations) | L-5 | Personal data, notification prefs |
| 3 | Event discovery + interest | L-7 | Interactive cards, dynamic state |
| 4 | CMS content creation | A-1, A-2 | Rich editor, metadata linking |
| 5 | Registration + login | L-2 | Form-heavy, ID-porten flow |

## Gotchas

- **VoiceOver + Safari** is the primary combo for macOS testing. VoiceOver + Chrome has known quirks.
- **NVDA + Firefox** is the primary combo for Windows testing. Most screen reader users use this.
- Sara Soueidan warns: testing ONLY with VoiceOver is insufficient. Most real users are on Windows with NVDA or JAWS.
- Base UI Combobox has known issues with NVDA, JAWS, and VoiceOver announcements -- test search thoroughly.
- Base UI Toast's undo action is unreachable by screen reader -- flag if used.
- Dynamic content needs `aria-live` regions that are **already in the DOM** before content changes.
- Norwegian text must be announced correctly -- verify `lang="nb"` is on `<html>`.
- Screen readers pronounce Norwegian differently depending on language setting -- test with Norwegian voice.

## What This Skill Does NOT Do

- Does NOT automate screen reader testing (not possible)
- Does NOT replace actually running VoiceOver/NVDA (generates the script TO run)
- Does NOT test with JAWS (paid, enterprise) or TalkBack (Android) -- focus on VoiceOver + NVDA
