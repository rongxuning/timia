#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Whether this OS build implements the Contacts Me-card fetch.
/// Creating the store and checking the selector does not prompt.
BOOL TimiaOwnCardPhoneSupported(void);

/// Labeled numbers on the user's Me card (`label`, `number`).
/// Empty when the card API is missing, access is denied, or there is no number.
/// Does not request permission and does not call private Contacts selectors.
NSArray<NSDictionary<NSString *, NSString *> *> *TimiaOwnCardPhoneCandidates(void);

NS_ASSUME_NONNULL_END
