import ExpoModulesCore
import UIKit

public class BackgroundTaskModule: Module {
  private var taskIdentifier: UIBackgroundTaskIdentifier = .invalid

  public func definition() -> ModuleDefinition {
    Name("ExpoBackgroundTask")

    Function("beginBackgroundTask") { () -> Void in
      DispatchQueue.main.async {
        self.taskIdentifier = UIApplication.shared.beginBackgroundTask(withName: "SynapseProcessing") {
          // Expiration handler: iOS calls this when the time limit is reached
          UIApplication.shared.endBackgroundTask(self.taskIdentifier)
          self.taskIdentifier = .invalid
        }
      }
    }

    Function("endBackgroundTask") { () -> Void in
      DispatchQueue.main.async {
        guard self.taskIdentifier != .invalid else { return }
        UIApplication.shared.endBackgroundTask(self.taskIdentifier)
        self.taskIdentifier = .invalid
      }
    }
  }
}
