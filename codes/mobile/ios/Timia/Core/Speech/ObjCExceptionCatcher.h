#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Catches Objective-C ``NSException`` and surfaces it as ``NSError``.
/// Needed because ``AVAudioEngine`` / ``installTap`` raise uncaught ObjC
/// exceptions that Swift ``do/catch`` cannot intercept — those kill the app.
@interface ObjCExceptionCatcher : NSObject

+ (BOOL)perform:(NS_NOESCAPE void (^)(void))block
          error:(NSError * _Nullable * _Nullable)error;

@end

NS_ASSUME_NONNULL_END
