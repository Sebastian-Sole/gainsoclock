// Widget-extension-only file: the Live Activity presentation (lock screen +
// Dynamic Island). All interaction goes through the LiveActivityIntents in
// _shared/ — the extension itself runs no business logic.
//
// Layout budgets are hard OS caps, not suggestions: the lock-screen card and
// the expanded island each get ~160pt and clip anything taller. Every mode
// body below is designed against that budget — header and progress dots are
// dropped in adjust mode, and the island uses single-row layouts instead of
// reusing the lock-screen bodies. (No `.invalidatableContent()` — its
// dim-while-pending flash read as jank and froze the timer text.)
import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

private let deepLink = URL(string: "fitbull://workout/active")!

struct WorkoutLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: WorkoutActivityAttributes.self) { context in
      LockScreenCard(state: context.state)
        .padding(12)
        .activityBackgroundTint(Color.black.opacity(0.55))
        .activitySystemActionForegroundColor(Color("AccentColor"))
        .widgetURL(deepLink)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Image(systemName: "dumbbell.fill")
            .foregroundStyle(Color("AccentColor"))
            .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(context.state.setLabel)
            .font(.caption2)
            .foregroundStyle(.white.opacity(0.55))
            .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.bottom) {
          IslandBottom(state: context.state)
        }
      } compactLeading: {
        Image(systemName: "dumbbell.fill")
          .foregroundStyle(Color("AccentColor"))
      } compactTrailing: {
        CompactTrailing(state: context.state)
      } minimal: {
        Image(systemName: "dumbbell.fill")
          .foregroundStyle(Color("AccentColor"))
      }
      .widgetURL(deepLink)
    }
  }
}

private func plannedLine(_ state: WorkoutActivityAttributes.ContentState) -> String {
  state.rows.map { "\($0.display) \($0.label)" }.joined(separator: " × ")
}

// MARK: - Lock screen

private struct LockScreenCard: View {
  let state: WorkoutActivityAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      // Adjust mode spends the header's + progress bar's height on the
      // stepper rows instead — the ~160pt budget doesn't fit all three.
      if state.mode != "adjust" {
        HStack(alignment: .firstTextBaseline) {
          Label("Fitbull", systemImage: "dumbbell.fill")
            .font(.caption2.weight(.bold))
            .foregroundStyle(Color("AccentColor"))
            .textCase(.uppercase)
          Spacer()
          Text(state.mode == "resting" ? (state.nextLabel ?? state.setLabel) : state.setLabel)
            .font(.caption2)
            .foregroundStyle(.white.opacity(0.55))
            .lineLimit(1)
        }
      }

      switch state.mode {
      case "resting":
        RestingBody(state: state)
      case "adjust":
        AdjustBody(state: state)
      case "done":
        DoneBody(state: state)
      case "pendingFinish":
        PendingFinishBody()
      default:
        WorkingBody(state: state)
      }

      if state.mode == "working" || state.mode == "resting" {
        ProgressBar(completed: state.completedSets, total: state.totalSets)
      }
    }
    .foregroundStyle(.white)
  }
}

private struct WorkingBody: View {
  let state: WorkoutActivityAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(state.exerciseName)
        .font(.subheadline.weight(.bold))
        .lineLimit(1)

      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text(state.rows.isEmpty ? state.setLabel : plannedLine(state))
          .font(.title3.weight(.heavy))
          .monospacedDigit()
        Text("planned")
          .font(.caption2)
          .foregroundStyle(.white.opacity(0.55))
        if let summary = state.summaryLine {
          Text("· \(summary)")
            .font(.caption2)
            .foregroundStyle(.white.opacity(0.5))
            .lineLimit(1)
        }
      }

      if state.canLog {
        HStack(spacing: 8) {
          if !state.rows.isEmpty {
            Button(intent: ToggleAdjustIntent()) {
              Image(systemName: "slider.horizontal.3")
                .frame(maxWidth: 40)
            }
            .buttonStyle(.bordered)
            .tint(.white.opacity(0.25))
          }
          Button(intent: LogSetIntent()) {
            Label("Log set", systemImage: "checkmark")
              .font(.callout.weight(.bold))
              .frame(maxWidth: .infinity)
          }
          .buttonStyle(.borderedProminent)
          .tint(Color("AccentColor"))
        }
      } else {
        Text("Timing in progress — open Fitbull to log this set")
          .font(.caption)
          .foregroundStyle(.white.opacity(0.7))
      }
    }
  }
}

private struct AdjustBody: View {
  let state: WorkoutActivityAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      Text(state.exerciseName)
        .font(.footnote.weight(.bold))
        .lineLimit(1)

      ForEach(state.rows, id: \.field) { row in
        HStack(spacing: 6) {
          StepButton(field: row.field, direction: -1, symbol: "minus")
          HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(row.display)
              .font(.body.weight(.heavy))
              .monospacedDigit()
            Text(row.label)
              .font(.caption2)
              .foregroundStyle(.white.opacity(0.55))
          }
          .frame(maxWidth: .infinity)
          StepButton(field: row.field, direction: 1, symbol: "plus")
        }
      }

      Button(intent: LogSetIntent()) {
        Label("Log \(plannedLine(state))", systemImage: "checkmark")
          .font(.footnote.weight(.bold))
          .frame(maxWidth: .infinity)
      }
      .buttonStyle(.borderedProminent)
      .tint(Color("AccentColor"))
    }
  }
}

private struct StepButton: View {
  let field: String
  let direction: Int
  let symbol: String

  var body: some View {
    Button(intent: StepMetricIntent(field: field, direction: direction)) {
      Image(systemName: symbol)
        .font(.footnote.weight(.bold))
        .frame(minWidth: 40)
    }
    .buttonStyle(.bordered)
    .tint(.white.opacity(0.25))
  }
}

private struct RestingBody: View {
  let state: WorkoutActivityAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(state.exerciseName)
        .font(.subheadline.weight(.bold))
        .lineLimit(1)

      if let endsAt = state.restEndsAt {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          // Text(timerInterval:) is greedy, so it gets a fixed box — but a
          // tight one truncates the digits to "1:--"; 100pt fits "88:88".
          Text(timerInterval: Date.now...max(Date.now, endsAt), countsDown: true)
            .font(.title3.weight(.heavy))
            .monospacedDigit()
            .frame(maxWidth: 100, alignment: .leading)
          Text("rest remaining")
            .font(.caption2)
            .foregroundStyle(.white.opacity(0.55))
        }
      }

      HStack(spacing: 8) {
        Button(intent: AdjustRestIntent(deltaSeconds: -15)) {
          Text("−15s").font(.footnote.weight(.semibold)).monospacedDigit()
        }
        .buttonStyle(.bordered)
        .tint(.white.opacity(0.25))
        Button(intent: SkipRestIntent()) {
          Text("Skip rest")
            .font(.callout.weight(.bold))
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(Color("AccentColor"))
        Button(intent: AdjustRestIntent(deltaSeconds: 15)) {
          Text("+15s").font(.footnote.weight(.semibold)).monospacedDigit()
        }
        .buttonStyle(.bordered)
        .tint(.white.opacity(0.25))
      }
    }
  }
}

private struct DoneBody: View {
  let state: WorkoutActivityAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("All sets done · \(state.completedSets) of \(state.totalSets) logged")
        .font(.subheadline.weight(.bold))
      FinishButton(armed: state.finishArmed)
    }
  }
}

/// Two-tap confirm: first tap arms via FinishWorkoutIntent, second confirms.
private struct FinishButton: View {
  let armed: Bool

  var body: some View {
    Button(intent: FinishWorkoutIntent()) {
      Label(
        armed ? "Tap again to finish" : "Finish workout",
        systemImage: armed ? "exclamationmark.circle" : "flag.checkered"
      )
      .font(.callout.weight(.bold))
      .frame(maxWidth: .infinity)
    }
    .buttonStyle(.borderedProminent)
    .tint(armed ? .white.opacity(0.9) : Color("AccentColor"))
    .foregroundStyle(armed ? .black : .white)
  }
}

private struct PendingFinishBody: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Label("Workout saved", systemImage: "checkmark.circle.fill")
        .font(.subheadline.weight(.bold))
        .foregroundStyle(Color("AccentColor"))
      Text("Open Fitbull to see your summary.")
        .font(.caption)
        .foregroundStyle(.white.opacity(0.7))
    }
  }
}

private struct ProgressBar: View {
  let completed: Int
  let total: Int

  var body: some View {
    let segments = min(total, 12)
    if segments > 1 {
      let filled = total > 0 ? Int((Double(completed) / Double(total) * Double(segments)).rounded(.down)) : 0
      HStack(spacing: 3) {
        ForEach(0..<segments, id: \.self) { index in
          RoundedRectangle(cornerRadius: 1.5)
            .fill(index < filled ? Color("AccentColor") : Color.white.opacity(0.18))
            .frame(height: 3)
        }
      }
      .accessibilityLabel("\(completed) of \(total) sets completed")
    }
  }
}

// MARK: - Dynamic Island

private struct CompactTrailing: View {
  let state: WorkoutActivityAttributes.ContentState

  var body: some View {
    if state.mode == "resting", let endsAt = state.restEndsAt {
      Text(timerInterval: Date.now...max(Date.now, endsAt), countsDown: true)
        .font(.caption2.weight(.semibold))
        .monospacedDigit()
        .frame(maxWidth: 44)
    } else {
      Text("\(state.completedSets)/\(state.totalSets)")
        .font(.caption2.weight(.semibold))
        .monospacedDigit()
    }
  }
}

/// Expanded-island bottom region. One name line + one action row per mode —
/// the expanded island clips anything taller than ~160pt total.
private struct IslandBottom: View {
  let state: WorkoutActivityAttributes.ContentState

  var body: some View {
    content
      // Inset from the island's rounded shape — content at the region edge
      // gets visually clipped by the corner radius.
      .padding(.horizontal, 8)
      .padding(.bottom, 4)
  }

  private var content: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(state.exerciseName)
        .font(.footnote.weight(.bold))
        .lineLimit(1)

      switch state.mode {
      case "resting":
        HStack(spacing: 8) {
          if let endsAt = state.restEndsAt {
            Text(timerInterval: Date.now...max(Date.now, endsAt), countsDown: true)
              .font(.title3.weight(.heavy))
              .monospacedDigit()
              .frame(maxWidth: 100, alignment: .leading)
          }
          Spacer()
          Button(intent: SkipRestIntent()) {
            Text("Skip rest").font(.footnote.weight(.bold))
          }
          .buttonStyle(.borderedProminent)
          .tint(Color("AccentColor"))
        }
      case "done":
        FinishButton(armed: state.finishArmed)
      case "pendingFinish":
        Label("Workout saved — open Fitbull", systemImage: "checkmark.circle.fill")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(Color("AccentColor"))
      default:
        HStack(spacing: 8) {
          Text(state.rows.isEmpty ? state.setLabel : plannedLine(state))
            .font(.callout.weight(.heavy))
            .monospacedDigit()
            .lineLimit(1)
          Spacer()
          if state.canLog {
            Button(intent: LogSetIntent()) {
              Label("Log set", systemImage: "checkmark")
                .font(.footnote.weight(.bold))
            }
            .buttonStyle(.borderedProminent)
            .tint(Color("AccentColor"))
          }
        }
      }
    }
  }
}
