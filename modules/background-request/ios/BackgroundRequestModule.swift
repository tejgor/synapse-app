import ExpoModulesCore
import UIKit

// Keys used in UserDefaults (shared with AppDelegate)
private let kTaskMapKey = "bgr_task_map"       // [String: String]  taskId -> entryId
private let kTempFileKey = "bgr_temp_files"    // [String: String]  taskId -> filePath
private let kPendingKey = "bgr_pending_results" // [[String: Any]]
private let kSessionId = "io.synapse.app.background-request"

// ─── URLSession delegate (must be NSObject) ──────────────────────────────────

private class SessionDelegate: NSObject, URLSessionDataDelegate, URLSessionDelegate {
  var responseBuffers: [Int: Data] = [:]
  var onComplete: ((_ taskId: String, _ response: HTTPURLResponse?, _ data: Data?, _ error: Error?) -> Void)?

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    let id = dataTask.taskIdentifier
    if responseBuffers[id] == nil { responseBuffers[id] = Data() }
    responseBuffers[id]?.append(data)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    let taskId = String(task.taskIdentifier)
    let httpResponse = task.response as? HTTPURLResponse
    let data = responseBuffers[task.taskIdentifier]
    responseBuffers.removeValue(forKey: task.taskIdentifier)
    onComplete?(taskId, httpResponse, data, error)
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    DispatchQueue.main.async {
      BackgroundRequestModule.backgroundCompletionHandler?()
      BackgroundRequestModule.backgroundCompletionHandler = nil
    }
  }
}

// ─── Expo Module ─────────────────────────────────────────────────────────────

public class BackgroundRequestModule: Module {
  private let sessionDelegate = SessionDelegate()
  private var session: URLSession?

  // Called by AppDelegate when iOS wakes the app to deliver background session events
  public static var backgroundCompletionHandler: (() -> Void)?

  public func definition() -> ModuleDefinition {
    Name("ExpoBackgroundRequest")

    Events("onRequestComplete")

    OnCreate {
      // Wire up the delegate callback
      self.sessionDelegate.onComplete = { [weak self] taskId, httpResponse, data, error in
        self?.handleTaskCompletion(taskId: taskId, httpResponse: httpResponse, data: data, error: error)
      }

      let config = URLSessionConfiguration.background(withIdentifier: kSessionId)
      config.sessionSendsLaunchEvents = true
      config.isDiscretionary = false
      config.timeoutIntervalForRequest = 300
      config.timeoutIntervalForResource = 300
      self.session = URLSession(configuration: config, delegate: self.sessionDelegate, delegateQueue: nil)
    }

    // Called from JS to start a background upload request
    Function("startRequest") { (entryId: String, url: String, bodyJson: String, headersJson: String) in
      guard let session = self.session, let requestUrl = URL(string: url) else {
        print("[BackgroundRequest] Invalid session or URL: \(url)")
        return
      }

      var request = URLRequest(url: requestUrl)
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")

      // Apply custom headers (e.g. API key)
      if let data = headersJson.data(using: .utf8),
         let headers = try? JSONSerialization.jsonObject(with: data) as? [String: String] {
        for (key, value) in headers {
          request.setValue(value, forHTTPHeaderField: key)
        }
      }

      // Background upload tasks require the body as a file
      let tempFile = FileManager.default.temporaryDirectory
        .appendingPathComponent("bgr_\(entryId).json")
      do {
        try bodyJson.data(using: .utf8)?.write(to: tempFile)
      } catch {
        print("[BackgroundRequest] Failed to write temp file: \(error)")
        return
      }

      let task = session.uploadTask(with: request, fromFile: tempFile)

      // Persist mapping so we survive termination
      let taskId = String(task.taskIdentifier)
      var taskMap = UserDefaults.standard.dictionary(forKey: kTaskMapKey) as? [String: String] ?? [:]
      taskMap[taskId] = entryId
      UserDefaults.standard.set(taskMap, forKey: kTaskMapKey)

      var tempFiles = UserDefaults.standard.dictionary(forKey: kTempFileKey) as? [String: String] ?? [:]
      tempFiles[taskId] = tempFile.path
      UserDefaults.standard.set(tempFiles, forKey: kTempFileKey)

      task.resume()
      print("[BackgroundRequest] Started task \(taskId) for entry \(entryId)")
    }

    // Returns results stored while app was dead/suspended
    Function("getPendingResults") { () -> [[String: Any]] in
      return UserDefaults.standard.array(forKey: kPendingKey) as? [[String: Any]] ?? []
    }

    // Call after processing a result to remove it from storage
    Function("clearResult") { (entryId: String) in
      var pending = UserDefaults.standard.array(forKey: kPendingKey) as? [[String: Any]] ?? []
      pending.removeAll { ($0["entryId"] as? String) == entryId }
      UserDefaults.standard.set(pending, forKey: kPendingKey)
    }

    // Returns entry IDs that have in-flight background URLSession tasks
    Function("getInFlightEntryIds") { () -> [String] in
      let taskMap = UserDefaults.standard.dictionary(forKey: kTaskMapKey) as? [String: String] ?? [:]
      return Array(Set(taskMap.values))
    }
  }

  private func handleTaskCompletion(taskId: String, httpResponse: HTTPURLResponse?, data: Data?, error: Error?) {
    let taskMap = UserDefaults.standard.dictionary(forKey: kTaskMapKey) as? [String: String] ?? [:]
    guard let entryId = taskMap[taskId] else {
      print("[BackgroundRequest] No entry found for task \(taskId)")
      return
    }

    var result: [String: Any] = ["entryId": entryId]

    if let error = error {
      print("[BackgroundRequest] Task \(taskId) failed: \(error.localizedDescription)")
      result["error"] = error.localizedDescription
    } else if let httpResponse = httpResponse {
      let statusCode = httpResponse.statusCode
      result["statusCode"] = statusCode
      if let data = data, let responseString = String(data: data, encoding: .utf8) {
        result["response"] = responseString
      }
      if statusCode != 200 {
        result["error"] = "HTTP \(statusCode)"
      }
      print("[BackgroundRequest] Task \(taskId) complete — status \(statusCode) entry=\(entryId)")
    }

    // Store in UserDefaults for app-relaunch case
    var pending = UserDefaults.standard.array(forKey: kPendingKey) as? [[String: Any]] ?? []
    pending.append(result)
    UserDefaults.standard.set(pending, forKey: kPendingKey)

    // Emit event for real-time case (app is alive)
    sendEvent("onRequestComplete", result)

    // Cleanup
    if var tempFiles = UserDefaults.standard.dictionary(forKey: kTempFileKey) as? [String: String],
       let path = tempFiles[taskId] {
      try? FileManager.default.removeItem(atPath: path)
      tempFiles.removeValue(forKey: taskId)
      UserDefaults.standard.set(tempFiles, forKey: kTempFileKey)
    }
    if var taskMap = UserDefaults.standard.dictionary(forKey: kTaskMapKey) as? [String: String] {
      taskMap.removeValue(forKey: taskId)
      UserDefaults.standard.set(taskMap, forKey: kTaskMapKey)
    }
  }
}
