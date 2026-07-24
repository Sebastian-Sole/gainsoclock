// Compiled into BOTH the app target and the widget extension (_shared/).
// Persistence + wire types for the workout Live Activity session.
//
// Everything lives in the app's standard UserDefaults — no App Group. That
// works because every reader/writer runs in the APP process: the JS bridge
// (Expo module) and the LiveActivityIntents (which iOS executes in-process in
// the app, launching it in the background if needed). The widget process only
// ever renders ActivityKit content state; it never reads this store.
//
// JSON shapes mirror lib/activity-projection.ts (PLAN_SCHEMA_VERSION 1) —
// that file is the contract; change them together.
import Foundation

// MARK: - Plan (JS → native)

struct SessionPlanRow: Codable {
  var metricId: String
  var field: String
  var label: String
  /// "integer" | "decimal" | "duration" | "pace"
  var kind: String
  var value: Double
  var step: Double
}

struct SessionPlanEntry: Codable {
  var exerciseId: String
  var setId: String
  var exerciseName: String
  var setIndex: Int
  var setCount: Int
  var rows: [SessionPlanRow]
  var moreLabel: String?
  var derivePace: Bool
  var restSeconds: Double
  var openAppOnly: Bool
}

struct SessionPlan: Codable {
  var schemaVersion: Int
  var workoutId: String
  var workoutName: String
  var startedAtEpochMs: Double
  var queue: [SessionPlanEntry]
  var totalSets: Int
  var completedSets: Int
  var restEndsAtEpochMs: Double?
  var restExerciseName: String?
  var restNotificationsEnabled: Bool
  /// Native-only: set by FinishWorkoutIntent, never sent by JS.
  var pendingFinish: Bool?
}

// MARK: - Adjust-mode UI state (native-only, per current set)

struct AdjustState: Codable {
  var setId: String
  var open: Bool
  /// Stepped values keyed by WorkoutSet field name.
  var values: [String: Double]
}

// MARK: - Events (native → JS; drained by lib/live-activity.ts)

struct ActivityEventRecord: Codable {
  /// "setLogged" | "restStarted" | "restSkipped" | "finishRequested"
  var type: String
  var workoutId: String
  var exerciseId: String?
  var setId: String?
  var values: [String: Double]?
  var endsAtEpochMs: Double?
  var exerciseName: String?
  /// Epoch ms.
  var at: Double
}

// MARK: - Store

enum WorkoutSessionStore {
  private static let planKey = "fitbull.activity.plan"
  private static let adjustKey = "fitbull.activity.adjust"
  private static let eventsKey = "fitbull.activity.events"
  private static let finishArmedKey = "fitbull.activity.finishArmedAt"

  private static var defaults: UserDefaults { .standard }

  static func loadPlan() -> SessionPlan? {
    guard let data = defaults.data(forKey: planKey) else { return nil }
    return try? JSONDecoder().decode(SessionPlan.self, from: data)
  }

  static func savePlan(_ plan: SessionPlan) {
    guard let data = try? JSONEncoder().encode(plan) else { return }
    defaults.set(data, forKey: planKey)
  }

  static func loadAdjust() -> AdjustState? {
    guard let data = defaults.data(forKey: adjustKey) else { return nil }
    return try? JSONDecoder().decode(AdjustState.self, from: data)
  }

  static func saveAdjust(_ state: AdjustState?) {
    guard let state, let data = try? JSONEncoder().encode(state) else {
      defaults.removeObject(forKey: adjustKey)
      return
    }
    defaults.set(data, forKey: adjustKey)
  }

  /// Finish arming (two-tap confirm). Stored as epoch seconds; nil = disarmed.
  static func loadFinishArmedAt() -> Double? {
    let value = defaults.double(forKey: finishArmedKey)
    return value > 0 ? value : nil
  }

  static func saveFinishArmedAt(_ value: Double?) {
    if let value {
      defaults.set(value, forKey: finishArmedKey)
    } else {
      defaults.removeObject(forKey: finishArmedKey)
    }
  }

  static func appendEvent(_ event: ActivityEventRecord) {
    var events = loadEvents()
    events.append(event)
    guard let data = try? JSONEncoder().encode(events) else { return }
    defaults.set(data, forKey: eventsKey)
  }

  private static func loadEvents() -> [ActivityEventRecord] {
    guard let data = defaults.data(forKey: eventsKey) else { return [] }
    return (try? JSONDecoder().decode([ActivityEventRecord].self, from: data)) ?? []
  }

  /// Return the raw pending-events JSON and clear the log in one step, so
  /// each event reaches JS exactly once.
  static func drainEventsJSON() -> String {
    let raw = defaults.data(forKey: eventsKey)
    defaults.removeObject(forKey: eventsKey)
    guard let raw, let json = String(data: raw, encoding: .utf8) else { return "[]" }
    return json
  }

  static func clearSession() {
    defaults.removeObject(forKey: planKey)
    defaults.removeObject(forKey: adjustKey)
    defaults.removeObject(forKey: finishArmedKey)
    // Events are intentionally kept — JS drains (and clears) them itself, and
    // stale ones are filtered by workoutId during replay.
  }
}
