#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^WeChatAuthCompletion)(NSInteger errCode, NSString *_Nullable code, NSString *_Nullable state);

/// Talks to WeChat OpenSDK (WXApi / SendAuthReq) by name.
/// The XCFramework is not in this repo. Until it is linked, sdkAvailable is NO
/// and send returns NO. Do not fall back to a browser session.
@interface WeChatSDKBridge : NSObject
+ (BOOL)sdkAvailable;
+ (void)setAuthCompletion:(WeChatAuthCompletion _Nullable)completion;
+ (BOOL)sendAuthAppID:(NSString *)appID
        universalLink:(NSString *)universalLink
                state:(NSString *)state;
+ (BOOL)handleOpenURL:(NSURL *)url;
+ (BOOL)handleUniversalLink:(NSUserActivity *)activity;
@end

NS_ASSUME_NONNULL_END
