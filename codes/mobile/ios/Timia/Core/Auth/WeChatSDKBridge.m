#import "WeChatSDKBridge.h"

@implementation WeChatSDKBridge

static WeChatAuthCompletion _authCompletion = nil;
static WeChatSDKBridge *_delegate = nil;

+ (void)load {
    if (_delegate == nil) {
        _delegate = [WeChatSDKBridge new];
    }
}

+ (BOOL)sdkAvailable {
    return NSClassFromString(@"WXApi") != Nil && NSClassFromString(@"SendAuthReq") != Nil;
}

+ (void)setAuthCompletion:(WeChatAuthCompletion)completion {
    _authCompletion = [completion copy];
}

+ (BOOL)sendAuthAppID:(NSString *)appID
        universalLink:(NSString *)universalLink
                state:(NSString *)state {
    Class api = NSClassFromString(@"WXApi");
    Class reqClass = NSClassFromString(@"SendAuthReq");
    if (api == Nil || reqClass == Nil || appID.length == 0) {
        return NO;
    }
    if (![self invokeBoolOnClass:api
                        selector:@"registerApp:universalLink:"
                           first:appID
                          second:universalLink]) {
        return NO;
    }
    id req = [[reqClass alloc] init];
    @try {
        [req setValue:@"snsapi_userinfo" forKey:@"scope"];
        [req setValue:state forKey:@"state"];
    } @catch (NSException *exception) {
        return NO;
    }
    return [self sendReq:req api:api];
}

+ (BOOL)handleOpenURL:(NSURL *)url {
    Class api = NSClassFromString(@"WXApi");
    if (api == Nil || _delegate == nil || url == nil) {
        return NO;
    }
    return [self invokeBoolOnClass:api selector:@"handleOpenURL:delegate:" first:url second:_delegate];
}

+ (BOOL)handleUniversalLink:(NSUserActivity *)activity {
    Class api = NSClassFromString(@"WXApi");
    if (api == Nil || _delegate == nil || activity == nil) {
        return NO;
    }
    return [self invokeBoolOnClass:api
                          selector:@"handleOpenUniversalLink:delegate:"
                             first:activity
                            second:_delegate];
}

- (void)onResp:(id)resp {
    if (_authCompletion == nil || resp == nil) {
        return;
    }
    NSInteger err = -1;
    NSString *code = nil;
    NSString *state = nil;
    @try {
        if ([resp respondsToSelector:NSSelectorFromString(@"errCode")]) {
            err = [[resp valueForKey:@"errCode"] integerValue];
        }
        if ([resp respondsToSelector:NSSelectorFromString(@"code")]) {
            id value = [resp valueForKey:@"code"];
            if ([value isKindOfClass:[NSString class]]) {
                code = value;
            }
        }
        if ([resp respondsToSelector:NSSelectorFromString(@"state")]) {
            id value = [resp valueForKey:@"state"];
            if ([value isKindOfClass:[NSString class]]) {
                state = value;
            }
        }
    } @catch (NSException *exception) {
        err = -1;
        code = nil;
    }
    WeChatAuthCompletion callback = _authCompletion;
    dispatch_async(dispatch_get_main_queue(), ^{
        callback(err, code, state);
    });
}

+ (BOOL)invokeBoolOnClass:(Class)cls selector:(NSString *)name first:(id)first second:(id)second {
    SEL sel = NSSelectorFromString(name);
    NSMethodSignature *sig = [cls methodSignatureForSelector:sel];
    if (sig == nil) {
        return NO;
    }
    NSInvocation *inv = [NSInvocation invocationWithMethodSignature:sig];
    inv.selector = sel;
    inv.target = cls;
    id arg0 = first;
    id arg1 = second;
    if (sig.numberOfArguments > 2) {
        [inv setArgument:&arg0 atIndex:2];
    }
    if (sig.numberOfArguments > 3) {
        [inv setArgument:&arg1 atIndex:3];
    }
    [inv invoke];
    if (strcmp(sig.methodReturnType, @encode(BOOL)) != 0) {
        return YES;
    }
    BOOL result = NO;
    [inv getReturnValue:&result];
    return result;
}

+ (BOOL)sendReq:(id)req api:(Class)api {
    SEL sel = NSSelectorFromString(@"sendReq:completion:");
    NSMethodSignature *sig = [api methodSignatureForSelector:sel];
    if (sig == nil) {
        return NO;
    }
    NSInvocation *inv = [NSInvocation invocationWithMethodSignature:sig];
    inv.selector = sel;
    inv.target = api;
    id request = req;
    [inv setArgument:&request atIndex:2];
    void (^completion)(BOOL) = ^(BOOL success) {
        if (!success && _authCompletion != nil) {
            _authCompletion(-1, nil, nil);
        }
    };
    void (^copied)(BOOL) = [completion copy];
    [inv setArgument:&copied atIndex:3];
    [inv retainArguments];
    [inv invoke];
    return YES;
}

@end
