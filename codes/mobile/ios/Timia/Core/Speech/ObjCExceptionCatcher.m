#import "ObjCExceptionCatcher.h"

static NSString * const ObjCExceptionCatcherErrorDomain = @"ObjCExceptionCatcher";

@implementation ObjCExceptionCatcher

+ (BOOL)perform:(NS_NOESCAPE void (^)(void))block
          error:(NSError * _Nullable * _Nullable)error
{
    @try {
        block();
        return YES;
    } @catch (NSException *exception) {
        if (error != NULL) {
            *error = [NSError errorWithDomain:ObjCExceptionCatcherErrorDomain
                                         code:1
                                     userInfo:@{
                NSLocalizedDescriptionKey:
                    exception.reason ?: exception.name ?: @"Objective-C exception",
                @"exception.name": exception.name ?: @"",
                @"exception.reason": exception.reason ?: @"",
            }];
        }
        return NO;
    }
}

@end
