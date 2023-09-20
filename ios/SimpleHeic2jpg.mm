#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(SimpleHeic2jpg, NSObject)

RCT_EXTERN_METHOD(convertImageAtPath:(NSString *)path resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
