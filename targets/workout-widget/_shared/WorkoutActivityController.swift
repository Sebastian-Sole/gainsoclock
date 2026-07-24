// Compiled into BOTH the app target and the widget extension (_shared/).
// All ActivityKit lifecycle + lock-screen tap handling lives here, in the APP
// target's copy: the JS bridge reaches it via the ObjC runtime
// (NSClassFromString("WorkoutActivityBridge")), and the LiveActivityIntents
// call the handle* methods directly — iOS runs those in the app process, with
// or without the app foregrounded, which is what makes logging work while the
// React Native runtime is asleep. The widget target compiles this file too
// but never executes it (its Button(intent:) types are what reference it).
import Foundation
import ActivityKit
import UserNotifications

@objc(WorkoutActivityBridge)
public final class WorkoutActivityBridge: NSObject {

  // MARK: JS entry points (called from modules/fitbull-workout-activity via
  // the ObjC runtime — keep these availability-free and guard inside).

  @objc public static func syncPlan(_ json: String) {
    guard #available(iOS 16.2, *) else { return }
    guard let data = json.data(using: .utf8),
          let plan = try? JSONDecoder().decode(SessionPlan.self, from: data)
    else { return }
    syncPlanDecoded(plan)
  }

  @available(iOS 16.2, *)
  private static func syncPlanDecoded(_ plan: SessionPlan) {

    // A new set became current (logged in-app, or reordered) — stale adjust
    // state must not leak onto it.
    if let adjust = WorkoutSessionStore.loadAdjust(),
       adjust.setId != plan.queue.first?.setId {
      WorkoutSessionStore.saveAdjust(nil)
    }
    // Any JS-driven refresh disarms a half-confirmed Finish.
    WorkoutSessionStore.saveFinishArmedAt(nil)

    WorkoutSessionStore.savePlan(plan)
    // JS-driven paths run with the app foregrounded, so fire-and-forget is
    // safe here (unlike the intent paths, which must await — see below).
    Task { await Engine.startOrUpdate(plan: plan) }
  }

  @objc public static func endActivity(_ reason: String) {
    guard #available(iOS 16.2, *) else { return }
    WorkoutSessionStore.clearSession()
    Task { await Engine.endAll(finished: reason == "finished") }
  }

  @objc public static func drainEvents() -> String {
    return WorkoutSessionStore.drainEventsJSON()
  }

  // MARK: Intent entry points (iOS 17+, app process, JS asleep).

  @available(iOS 17.0, *)
  static func handleLogSet() async {
    guard var plan = WorkoutSessionStore.loadPlan(),
          let entry = plan.queue.first,
          !entry.openAppOnly
    else { return }

    let adjust = WorkoutSessionStore.loadAdjust()
    var values: [String: Double] = [:]
    for row in entry.rows {
      values[row.field] = Engine.effectiveValue(row: row, adjust: adjust)
    }

    let now = Date().timeIntervalSince1970 * 1000
    WorkoutSessionStore.appendEvent(
      ActivityEventRecord(
        type: "setLogged", workoutId: plan.workoutId, exerciseId: entry.exerciseId,
        setId: entry.setId, values: values, endsAtEpochMs: nil, exerciseName: nil, at: now
      )
    )

    plan.queue.removeFirst()
    plan.completedSets += 1

    // Mirror the in-app rule (app/workout/active.tsx): rest only runs when a
    // next set exists to rest for.
    if entry.restSeconds > 0 && !plan.queue.isEmpty {
      let endsAt = Date().addingTimeInterval(entry.restSeconds)
      plan.restEndsAtEpochMs = endsAt.timeIntervalSince1970 * 1000
      plan.restExerciseName = entry.exerciseName
      WorkoutSessionStore.appendEvent(
        ActivityEventRecord(
          type: "restStarted", workoutId: plan.workoutId, exerciseId: nil, setId: nil,
          values: nil, endsAtEpochMs: plan.restEndsAtEpochMs, exerciseName: entry.exerciseName,
          at: now
        )
      )
      if plan.restNotificationsEnabled {
        Engine.scheduleRestNotification(after: entry.restSeconds)
      }
    } else {
      plan.restEndsAtEpochMs = nil
      plan.restExerciseName = nil
    }

    WorkoutSessionStore.savePlan(plan)
    WorkoutSessionStore.saveAdjust(nil)
    await Engine.startOrUpdate(plan: plan)
  }

  @available(iOS 17.0, *)
  static func handleToggleAdjust() async {
    guard let plan = WorkoutSessionStore.loadPlan(),
          let entry = plan.queue.first
    else { return }

    if let adjust = WorkoutSessionStore.loadAdjust(), adjust.setId == entry.setId, adjust.open {
      WorkoutSessionStore.saveAdjust(nil)
    } else {
      var values: [String: Double] = [:]
      for row in entry.rows { values[row.field] = row.value }
      WorkoutSessionStore.saveAdjust(AdjustState(setId: entry.setId, open: true, values: values))
    }
    await Engine.startOrUpdate(plan: plan)
  }

  @available(iOS 17.0, *)
  static func handleStepMetric(field: String, direction: Int) async {
    guard let plan = WorkoutSessionStore.loadPlan(),
          let entry = plan.queue.first,
          let row = entry.rows.first(where: { $0.field == field })
    else { return }

    var adjust = WorkoutSessionStore.loadAdjust() ?? AdjustState(setId: entry.setId, open: true, values: [:])
    if adjust.setId != entry.setId {
      adjust = AdjustState(setId: entry.setId, open: true, values: [:])
    }
    for seedRow in entry.rows where adjust.values[seedRow.field] == nil {
      adjust.values[seedRow.field] = seedRow.value
    }

    let current = adjust.values[field] ?? row.value
    var next = max(0, current + Double(direction) * row.step)
    // Integers and second-counts stay whole; decimals round to 2 dp so
    // repeated 2.5 steps can't accumulate float dust.
    next = row.kind == "decimal" ? (next * 100).rounded() / 100 : next.rounded()
    adjust.values[field] = next
    adjust.open = true

    WorkoutSessionStore.saveAdjust(adjust)
    await Engine.startOrUpdate(plan: plan)
  }

  @available(iOS 17.0, *)
  static func handleSkipRest() async {
    guard var plan = WorkoutSessionStore.loadPlan() else { return }
    plan.restEndsAtEpochMs = nil
    plan.restExerciseName = nil
    WorkoutSessionStore.appendEvent(
      ActivityEventRecord(
        type: "restSkipped", workoutId: plan.workoutId, exerciseId: nil, setId: nil,
        values: nil, endsAtEpochMs: nil, exerciseName: nil,
        at: Date().timeIntervalSince1970 * 1000
      )
    )
    Engine.cancelRestNotification()
    WorkoutSessionStore.savePlan(plan)
    await Engine.startOrUpdate(plan: plan)
  }

  @available(iOS 17.0, *)
  static func handleAdjustRest(deltaSeconds: Int) async {
    guard var plan = WorkoutSessionStore.loadPlan(),
          let endsAtMs = plan.restEndsAtEpochMs
    else { return }

    let now = Date()
    let current = Date(timeIntervalSince1970: endsAtMs / 1000)
    let next = max(now, current.addingTimeInterval(Double(deltaSeconds)))
    plan.restEndsAtEpochMs = next.timeIntervalSince1970 * 1000

    WorkoutSessionStore.appendEvent(
      ActivityEventRecord(
        type: "restStarted", workoutId: plan.workoutId, exerciseId: nil, setId: nil,
        values: nil, endsAtEpochMs: plan.restEndsAtEpochMs, exerciseName: plan.restExerciseName,
        at: now.timeIntervalSince1970 * 1000
      )
    )
    if plan.restNotificationsEnabled {
      Engine.scheduleRestNotification(after: next.timeIntervalSince(now))
    }
    WorkoutSessionStore.savePlan(plan)
    await Engine.startOrUpdate(plan: plan)
  }

  @available(iOS 17.0, *)
  static func handleFinish() async {
    guard var plan = WorkoutSessionStore.loadPlan() else { return }

    // Two-tap confirm: the first tap arms ("Tap again to finish"), only a
    // second tap within the window actually finishes — an accidental brush
    // against the button can't end a workout.
    let now = Date().timeIntervalSince1970
    let armedAt = WorkoutSessionStore.loadFinishArmedAt()
    guard let armedAt, now - armedAt < Engine.finishConfirmWindow else {
      WorkoutSessionStore.saveFinishArmedAt(now)
      await Engine.startOrUpdate(plan: plan)
      return
    }

    WorkoutSessionStore.saveFinishArmedAt(nil)
    plan.pendingFinish = true
    plan.restEndsAtEpochMs = nil
    plan.restExerciseName = nil
    WorkoutSessionStore.appendEvent(
      ActivityEventRecord(
        type: "finishRequested", workoutId: plan.workoutId, exerciseId: nil, setId: nil,
        values: nil, endsAtEpochMs: nil, exerciseName: nil,
        at: now * 1000
      )
    )
    Engine.cancelRestNotification()
    WorkoutSessionStore.savePlan(plan)
    await Engine.startOrUpdate(plan: plan)
  }
}

// MARK: - Engine (ActivityKit + formatting; 16.2-gated as a whole)

@available(iOS 16.2, *)
private enum Engine {

  /// Seconds a first Finish tap stays armed awaiting confirmation.
  static let finishConfirmWindow: Double = 8

  static func startOrUpdate(plan: SessionPlan) async {
    let state = buildState(plan: plan, adjust: WorkoutSessionStore.loadAdjust())
    let existing = Activity<WorkoutActivityAttributes>.activities

    if let activity = existing.first(where: { $0.attributes.workoutId == plan.workoutId }) {
      // Awaited (not fire-and-forget): a LiveActivityIntent's process is only
      // kept alive until perform() returns — a detached Task here may not run
      // until the NEXT wake, which rendered taps one interaction late.
      await activity.update(ActivityContent(state: state, staleDate: nil))
      return
    }

    // A different workout's activity is still up (finish raced discard, or a
    // stale card survived a crash) — replace it.
    for stale in existing {
      await stale.end(nil, dismissalPolicy: .immediate)
    }

    let attributes = WorkoutActivityAttributes(
      workoutId: plan.workoutId,
      workoutName: plan.workoutName,
      startedAt: Date(timeIntervalSince1970: plan.startedAtEpochMs / 1000)
    )
    _ = try? Activity.request(
      attributes: attributes,
      content: ActivityContent(state: state, staleDate: nil)
    )
  }

  static func endAll(finished: Bool) async {
    for activity in Activity<WorkoutActivityAttributes>.activities {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
    _ = finished // Same dismissal either way today; kept for a farewell state later.
  }

  // MARK: State projection

  static func buildState(plan: SessionPlan, adjust: AdjustState?) -> WorkoutActivityAttributes.ContentState {
    let entry = plan.queue.first

    var mode = "working"
    var restEndsAt: Date?
    var nextLabel: String?

    if plan.pendingFinish == true {
      mode = "pendingFinish"
    } else if let endsAtMs = plan.restEndsAtEpochMs,
              endsAtMs / 1000 > Date().timeIntervalSince1970 {
      mode = "resting"
      restEndsAt = Date(timeIntervalSince1970: endsAtMs / 1000)
      if let entry {
        nextLabel = "Next: \(entry.exerciseName) · set \(entry.setIndex + 1) of \(entry.setCount)"
      }
    } else if entry == nil {
      mode = "done"
    } else if let adjust, adjust.open, adjust.setId == entry?.setId {
      mode = "adjust"
    }

    let activeAdjust = (mode == "adjust" || mode == "working") ? adjust : nil
    let rows = (entry?.rows ?? []).map { row in
      WorkoutActivityAttributes.ContentState.Row(
        field: row.field,
        label: row.label,
        display: format(value: effectiveValue(row: row, adjust: activeAdjust), kind: row.kind)
      )
    }

    let armedAt = WorkoutSessionStore.loadFinishArmedAt()
    let finishArmed = armedAt.map { Date().timeIntervalSince1970 - $0 < finishConfirmWindow } ?? false

    return WorkoutActivityAttributes.ContentState(
      mode: mode,
      exerciseName: entry?.exerciseName ?? plan.restExerciseName ?? plan.workoutName,
      setLabel: entry.map { "Set \($0.setIndex + 1) of \($0.setCount)" } ?? "All sets done",
      rows: rows,
      summaryLine: entry.flatMap { summaryLine(entry: $0, adjust: activeAdjust) },
      restEndsAt: restEndsAt,
      nextLabel: nextLabel,
      canLog: !(entry?.openAppOnly ?? true),
      finishArmed: finishArmed,
      completedSets: plan.completedSets,
      totalSets: plan.totalSets
    )
  }

  static func effectiveValue(row: SessionPlanRow, adjust: AdjustState?) -> Double {
    adjust?.values[row.field] ?? row.value
  }

  private static func summaryLine(entry: SessionPlanEntry, adjust: AdjustState?) -> String? {
    var parts: [String] = []
    if entry.derivePace,
       let time = entry.rows.first(where: { $0.field == "time" }),
       let distance = entry.rows.first(where: { $0.field == "distance" }) {
      let t = effectiveValue(row: time, adjust: adjust)
      let d = effectiveValue(row: distance, adjust: adjust)
      if t > 0 && d > 0 {
        parts.append("\(format(value: (t / d).rounded(), kind: "duration")) /\(distance.label)")
      }
    }
    if let more = entry.moreLabel {
      parts.append("\(more) in app")
    }
    return parts.isEmpty ? nil : parts.joined(separator: " · ")
  }

  private static func format(value: Double, kind: String) -> String {
    switch kind {
    case "duration", "pace":
      let total = Int(value.rounded())
      let hours = total / 3600
      let minutes = (total % 3600) / 60
      let seconds = total % 60
      return hours > 0
        ? String(format: "%d:%02d:%02d", hours, minutes, seconds)
        : String(format: "%d:%02d", minutes, seconds)
    case "integer":
      return String(Int(value.rounded()))
    default:
      // Locale-aware so comma-decimal locales see "82,5" (matches the app's
      // comma-decimal input support, lib/format.ts).
      let formatter = NumberFormatter()
      formatter.numberStyle = .decimal
      formatter.minimumFractionDigits = 0
      formatter.maximumFractionDigits = 2
      return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }
  }

  // MARK: Rest notification (parity with lib/notifications.ts — same
  // identifier, so JS-side cancel/reschedule interoperates).

  private static let restNotificationId = "rest-timer"

  static func scheduleRestNotification(after seconds: TimeInterval) {
    guard seconds > 0 else { return }
    let center = UNUserNotificationCenter.current()
    center.removePendingNotificationRequests(withIdentifiers: [restNotificationId])

    let content = UNMutableNotificationContent()
    content.title = "Rest Complete"
    content.body = "Time to start your next set!"
    content.sound = .default

    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, seconds), repeats: false)
    center.add(UNNotificationRequest(identifier: restNotificationId, content: content, trigger: trigger))
  }

  static func cancelRestNotification() {
    UNUserNotificationCenter.current()
      .removePendingNotificationRequests(withIdentifiers: [restNotificationId])
  }
}
