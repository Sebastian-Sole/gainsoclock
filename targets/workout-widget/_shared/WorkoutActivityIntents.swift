// Compiled into BOTH the app target and the widget extension (_shared/).
// LiveActivityIntent conformance is what makes the buttons work with the app
// backgrounded or terminated: iOS launches the app process and runs perform()
// there (when the same intent type exists in both targets, the app's copy
// wins — Apple-documented behavior, and why this file must be in _shared/).
// None of these open the app; the card updates in place.
import AppIntents
import os

// Timing instrumentation for the tap → update path. Read with:
//   log show --predicate 'subsystem == "fitbull.activity"' --last 5m
enum WorkoutIntentLog {
  static let logger = Logger(subsystem: "fitbull.activity", category: "intent")

  static func timed(_ name: StaticString, _ work: () async -> Void) async {
    let start = CFAbsoluteTimeGetCurrent()
    logger.notice("\(name, privacy: .public) perform start")
    await work()
    let ms = (CFAbsoluteTimeGetCurrent() - start) * 1000
    logger.notice("\(name, privacy: .public) perform done in \(ms, format: .fixed(precision: 0), privacy: .public)ms")
  }
}

@available(iOS 17.0, *)
public struct LogSetIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Log set"
  public static var description = IntentDescription("Log the current set as completed.")
  public init() {}

  public func perform() async throws -> some IntentResult {
    await WorkoutIntentLog.timed("logSet") { await WorkoutActivityBridge.handleLogSet() }
    return .result()
  }
}

@available(iOS 17.0, *)
public struct ToggleAdjustIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Adjust set"
  public static var description = IntentDescription("Show or hide the set adjustment steppers.")
  public init() {}

  public func perform() async throws -> some IntentResult {
    await WorkoutIntentLog.timed("toggleAdjust") { await WorkoutActivityBridge.handleToggleAdjust() }
    return .result()
  }
}

@available(iOS 17.0, *)
public struct StepMetricIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Step metric"
  public static var description = IntentDescription("Adjust a set value up or down.")

  @Parameter(title: "Field")
  public var field: String
  @Parameter(title: "Direction")
  public var direction: Int

  public init() {}
  public init(field: String, direction: Int) {
    self.field = field
    self.direction = direction
  }

  public func perform() async throws -> some IntentResult {
    await WorkoutIntentLog.timed("stepMetric") { await WorkoutActivityBridge.handleStepMetric(field: self.field, direction: self.direction) }
    return .result()
  }
}

@available(iOS 17.0, *)
public struct SkipRestIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Skip rest"
  public static var description = IntentDescription("Skip the running rest timer.")
  public init() {}

  public func perform() async throws -> some IntentResult {
    await WorkoutIntentLog.timed("skipRest") { await WorkoutActivityBridge.handleSkipRest() }
    return .result()
  }
}

@available(iOS 17.0, *)
public struct AdjustRestIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Adjust rest"
  public static var description = IntentDescription("Extend or shorten the running rest timer.")

  @Parameter(title: "Seconds")
  public var deltaSeconds: Int

  public init() {}
  public init(deltaSeconds: Int) {
    self.deltaSeconds = deltaSeconds
  }

  public func perform() async throws -> some IntentResult {
    await WorkoutIntentLog.timed("adjustRest") { await WorkoutActivityBridge.handleAdjustRest(deltaSeconds: self.deltaSeconds) }
    return .result()
  }
}

@available(iOS 17.0, *)
public struct FinishWorkoutIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Finish workout"
  public static var description = IntentDescription("Mark the workout finished; the app completes saving on next open.")
  public init() {}

  public func perform() async throws -> some IntentResult {
    await WorkoutIntentLog.timed("finish") { await WorkoutActivityBridge.handleFinish() }
    return .result()
  }
}
