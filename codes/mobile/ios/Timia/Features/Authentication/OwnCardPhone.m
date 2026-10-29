#import "OwnCardPhone.h"

#import <Contacts/Contacts.h>
#import <objc/message.h>

static SEL TimiaMeContactSelector(void) {
    // Public Contacts method. The SDK marks it macOS-only, but some iOS builds
    // still implement it. Private `_ios_meContact…` selectors are intentionally unused.
    return NSSelectorFromString(@"unifiedMeContactWithKeysToFetch:error:");
}

BOOL TimiaOwnCardPhoneSupported(void) {
    CNContactStore *store = [[CNContactStore alloc] init];
    return [store respondsToSelector:TimiaMeContactSelector()];
}

NSArray<NSDictionary<NSString *, NSString *> *> *TimiaOwnCardPhoneCandidates(void) {
    if (!TimiaOwnCardPhoneSupported()) {
        return @[];
    }
    @try {
        CNContactStore *store = [[CNContactStore alloc] init];
        SEL selector = TimiaMeContactSelector();
        NSArray *keys = @[CNContactPhoneNumbersKey];
        NSError *__autoreleasing error = nil;
        id (*invoke)(id, SEL, id, NSError *__autoreleasing *) =
            (id (*)(id, SEL, id, NSError *__autoreleasing *))(void *)objc_msgSend;
        id result = invoke(store, selector, keys, &error);
        if (error != nil || ![result isKindOfClass:[CNContact class]]) {
            return @[];
        }
        CNContact *contact = (CNContact *)result;
        if (![contact isKeyAvailable:CNContactPhoneNumbersKey]) {
            return @[];
        }
        NSMutableArray<NSDictionary<NSString *, NSString *> *> *rows = [NSMutableArray array];
        for (CNLabeledValue<CNPhoneNumber *> *labeled in contact.phoneNumbers) {
            NSString *number = labeled.value.stringValue;
            if (number.length == 0) {
                continue;
            }
            [rows addObject:@{
                @"label": labeled.label ?: @"",
                @"number": number,
            }];
        }
        return rows;
    } @catch (NSException *) {
        return @[];
    }
}
