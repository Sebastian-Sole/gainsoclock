// Compiled into BOTH the app target and the widget extension (_shared/).
// The single definition of the Live Activity wire format — the app requests
// and updates activities with it, the widget renders it. Keep ContentState
// small: ActivityKit caps combined content at 4 KB.
import Foundation
import ActivityKit

@available(iOS 16.2, *)
public struct WorkoutActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// One ± stepper row (max 2, mirrors lib/activity-projection.ts).
    public struct Row: Codable, Hashable {
      /// WorkoutSet field name — the StepMetricIntent parameter.
      public var field: String
      /// Unit/label rendered beside the value ("kg", "reps", "km").
      public var label: String
      /// Pre-formatted, locale-aware display value ("82,5", "4:45").
      public var display: String

      public init(field: String, label: String, display: String) {
        self.field = field
        self.label = label
        self.display = display
      }
    }

    /// "working" | "adjust" | "resting" | "done" | "pendingFinish"
    public var mode: String
    public var exerciseName: String
    /// "Set 3 of 5"
    public var setLabel: String
    public var rows: [Row]
    /// Derived pace and/or not-steppable metrics ("4:45 /km · more in app").
    public var summaryLine: String?
    /// Resting mode countdown target.
    public var restEndsAt: Date?
    /// Resting mode: what comes after the rest.
    public var nextLabel: String?
    /// Logging from the lock screen is disabled for this set (in-app
    /// stopwatch owns the exercise) — show an open-app hint instead.
    public var canLog: Bool
    /// Done state: first Finish tap arms, second confirms (accidental-tap guard).
    public var finishArmed: Bool
    public var completedSets: Int
    public var totalSets: Int

    public init(
      mode: String,
      exerciseName: String,
      setLabel: String,
      rows: [Row],
      summaryLine: String?,
      restEndsAt: Date?,
      nextLabel: String?,
      canLog: Bool,
      finishArmed: Bool,
      completedSets: Int,
      totalSets: Int
    ) {
      self.mode = mode
      self.exerciseName = exerciseName
      self.setLabel = setLabel
      self.rows = rows
      self.summaryLine = summaryLine
      self.restEndsAt = restEndsAt
      self.nextLabel = nextLabel
      self.canLog = canLog
      self.finishArmed = finishArmed
      self.completedSets = completedSets
      self.totalSets = totalSets
    }
  }

  public var workoutId: String
  public var workoutName: String
  public var startedAt: Date

  public init(workoutId: String, workoutName: String, startedAt: Date) {
    self.workoutId = workoutId
    self.workoutName = workoutName
    self.startedAt = startedAt
  }
}
