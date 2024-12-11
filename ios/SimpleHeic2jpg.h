#ifdef RCT_NEW_ARCH_ENABLED
#import <RNSimpleHeic2jpgSpec.h>
#else
#import <React/RCTBridgeModule.h> // Old Architecture
#endif

#ifdef RCT_NEW_ARCH_ENABLED
@interface SimpleHeic2jpg : NSObject <NativeSimpleHeic2jpgSpec>
#else
@interface SimpleHeic2jpg : NSObject <RCTBridgeModule>
#endif

@end
