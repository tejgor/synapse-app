const { withAppDelegate } = require('@expo/config-plugins');

/**
 * Adds `application(_:handleEventsForBackgroundURLSession:completionHandler:)` to
 * AppDelegate.swift so that our background URLSession results are delivered after
 * the app is relaunched by iOS. This survives `expo prebuild --clean`.
 */
module.exports = function withBackgroundURLSession(config) {
  return withAppDelegate(config, (mod) => {
    let contents = mod.modResults.contents;

    // Idempotent — don't add twice
    if (contents.includes('handleEventsForBackgroundURLSession')) {
      return mod;
    }

    // Add the import after the existing imports
    contents = contents.replace(
      'import ReactAppDependencyProvider',
      'import ReactAppDependencyProvider\ninternal import ExpoBackgroundRequest'
    );

    const insertion = `
  // Background URLSession — called when iOS wakes the app to deliver session events
  public override func application(
    _ application: UIApplication,
    handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
  ) {
    BackgroundRequestModule.backgroundCompletionHandler = completionHandler
  }
`;

    // Insert before the closing brace of AppDelegate class
    const marker = '}\n\nclass ReactNativeDelegate';
    mod.modResults.contents = contents.replace(marker, insertion + '}\n\nclass ReactNativeDelegate');

    return mod;
  });
};
