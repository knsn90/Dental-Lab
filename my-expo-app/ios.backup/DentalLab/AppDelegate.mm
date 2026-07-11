#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"main";
  self.initialProps = @{};
  // Required for New Architecture / Fabric / TurboModules — registers all native components & modules
  self.dependencyProvider = [RCTAppDependencyProvider new];
  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  // Force packager host to localhost so jsBundleURLForBundleRoot can find it
  [[RCTBundleURLProvider sharedSettings] setJsLocation:@"localhost"];
  NSURL *url = [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@".expo/.virtual-metro-entry"];
  if (url) return url;
  // Fallback: hardcoded Metro URL
  return [NSURL URLWithString:@"http://localhost:8081/.expo/.virtual-metro-entry.bundle?platform=ios&dev=true&hot=false&lazy=true"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

// Deep link / Universal Link handling via RCTLinkingManager
- (BOOL)application:(UIApplication *)application
            openURL:(NSURL *)url
            options:(NSDictionary<UIApplicationOpenURLOptionsKey,id> *)options
{
  BOOL handled = [RCTLinkingManager application:application openURL:url options:options];
  if (!handled && [super respondsToSelector:@selector(application:openURL:options:)]) {
    return [super application:application openURL:url options:options];
  }
  return handled;
}

- (BOOL)application:(UIApplication *)application
continueUserActivity:(nonnull NSUserActivity *)userActivity
 restorationHandler:(nonnull void (^)(NSArray<id<UIUserActivityRestoring>> * _Nullable))restorationHandler
{
  BOOL result = [RCTLinkingManager application:application
                          continueUserActivity:userActivity
                            restorationHandler:restorationHandler];
  if ([super respondsToSelector:@selector(application:continueUserActivity:restorationHandler:)]) {
    return [super application:application
         continueUserActivity:userActivity
           restorationHandler:restorationHandler] || result;
  }
  return result;
}

@end
