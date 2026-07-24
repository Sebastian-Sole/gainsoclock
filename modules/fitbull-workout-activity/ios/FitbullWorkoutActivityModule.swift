// Thin JS ↔ native shim for the workout Live Activity.
//
// This pod deliberately contains NO ActivityKit code and NO copy of the
// activity attributes. All Live Activity logic lives in the app target
// (targets/workout-widget/_shared/WorkoutActivityController.swift, compiled
// into the app by @bacons/apple-targets), reached here through the ObjC
// runtime — pods can't import app-target Swift, but every image in the
// process shares one ObjC class table. This keeps a single definition of the
// wire format instead of the duplicated-Attributes pattern.
import ExpoModulesCore

public class FitbullWorkoutActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FitbullWorkoutActivity")

    Function("syncPlan") { (planJson: String) in
      Self.callBridge("syncPlan:", argument: planJson)
    }

    Function("endActivity") { (reason: String) in
      Self.callBridge("endActivity:", argument: reason)
    }

    Function("drainEvents") { () -> String in
      Self.callBridgeReturningString("drainEvents") ?? "[]"
    }
  }

  // MARK: ObjC-runtime bridge to the app-target WorkoutActivityBridge class.
  // Missing class (widget target removed from the build) degrades to no-ops,
  // matching the JS wrapper's silent-no-op contract in lib/live-activity.ts.

  private static var bridge: NSObjectProtocol? {
    // A class object is itself an ObjC object; perform(_:) on it dispatches
    // the +class methods declared @objc on WorkoutActivityBridge.
    NSClassFromString("WorkoutActivityBridge") as? NSObjectProtocol
  }

  private static func callBridge(_ selectorName: String, argument: String) {
    let selector = NSSelectorFromString(selectorName)
    guard let bridge, bridge.responds(to: selector) else { return }
    _ = bridge.perform(selector, with: argument)
  }

  private static func callBridgeReturningString(_ selectorName: String) -> String? {
    let selector = NSSelectorFromString(selectorName)
    guard let bridge, bridge.responds(to: selector) else { return nil }
    return bridge.perform(selector)?.takeUnretainedValue() as? String
  }
}
