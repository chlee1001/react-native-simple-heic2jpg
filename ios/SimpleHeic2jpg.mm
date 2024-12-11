#import "SimpleHeic2jpg.h"
#import <React/RCTLog.h>
#import <UIKit/UIKit.h>
#import <ImageIO/ImageIO.h>
#import <CoreImage/CoreImage.h>

@implementation SimpleHeic2jpg

RCT_EXPORT_MODULE(SimpleHeic2jpg)

// New Architecture에서 TurboModule 지원
#ifdef RCT_NEW_ARCH_ENABLED
// TurboModule 메서드 구현
- (void)convertImageAtPath:(NSString *)path
resolve:(RCTPromiseResolveBlock)resolve
reject:(RCTPromiseRejectBlock)reject {
  [self convertImageAtPathImplementation:path resolve:resolve reject:reject];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
(const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeSimpleHeic2jpgSpecJSI>(params);
}
#else
// Old Architecture 메서드
RCT_EXPORT_METHOD(convertImageAtPath:(NSString *)path
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  [self convertImageAtPathImplementation:path resolve:resolve reject:reject];
}
#endif

// 공통 구현 (Old/New Architecture에서 호출)
- (void)convertImageAtPathImplementation:(NSString *)path
                                 resolve:(RCTPromiseResolveBlock)resolve
                                  reject:(RCTPromiseRejectBlock)reject {
  @try {
    if (!path || [path isEqualToString:@""]) {
      reject(@"Invalid Path", @"The path is invalid or empty", nil);
      return;
    }

    NSURL *url = [NSURL URLWithString:path];
    if (!url) {
      reject(@"Invalid URL", @"The URL is invalid", nil);
      return;
    }

    CGImageSourceRef imageSource = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
    if (!imageSource) {
      reject(@"Error Creating Image Source", @"Cannot create image source", nil);
      return;
    }

    CFStringRef imageType = CGImageSourceGetType(imageSource);
    if (!imageType) {
      CFRelease(imageSource);
      reject(@"Error Getting Image Type", @"Cannot get image type", nil);
      return;
    }

    NSString *filePath = [path stringByReplacingOccurrencesOfString:@"file://" withString:@""];
    NSString *outputImagePath = [[filePath stringByDeletingPathExtension] stringByAppendingPathExtension:@"jpeg"];
    NSURL *destinationURL = [NSURL fileURLWithPath:outputImagePath];

    // Handle HEIC or HEIF conversion to JPEG
    if (CFStringCompare(imageType, CFSTR("public.heic"), 0) == kCFCompareEqualTo ||
        CFStringCompare(imageType, CFSTR("public.heif"), 0) == kCFCompareEqualTo) {

      NSData *tempImageData = [NSData dataWithContentsOfURL:url];
      UIImage *image = [UIImage imageWithData:tempImageData];
      if (!image) {
        CFRelease(imageSource);
        reject(@"Error Loading Image", @"Failed to load image from path", nil);
        return;
      }

      CGImageRef cgImage = image.CGImage;
      CGColorSpaceRef colorSpace = CGImageGetColorSpace(cgImage);
      if (!cgImage || !colorSpace) {
        CFRelease(imageSource);
        reject(@"Error Processing Image", @"Failed to process image data", nil);
        return;
      }

      CIImage *ciImage = [CIImage imageWithCGImage:cgImage];
      CIContext *context = [CIContext context];
      NSData *jpegData = [context JPEGRepresentationOfImage:ciImage
                                                 colorSpace:colorSpace
                                                    options:@{}];
      if (!jpegData) {
        CFRelease(imageSource);
        reject(@"Image Conversion Failed", @"Image conversion to JPEG representation failed", nil);
        return;
      }

      // Save the converted JPEG file with metadata
      [self createImageDestination:jpegData
                       imageSource:imageSource
                    destinationURL:destinationURL
                           resolve:resolve
                            reject:reject];
    } else if (CFStringCompare(imageType, CFSTR("public.jpeg"), 0) == kCFCompareEqualTo ||
               CFStringCompare(imageType, CFSTR("public.png"), 0) == kCFCompareEqualTo) {
      CFRelease(imageSource);
      resolve(path);
    } else {
      CFRelease(imageSource);
      reject(@"Unsupported Image Format", @"Unsupported image format", nil);
    }
  } @catch (NSException *exception) {
    reject(@"Error", exception.reason, nil);
  }
}

- (void)createImageDestination:(NSData *)imageData
                   imageSource:(CGImageSourceRef)imageSource
                destinationURL:(NSURL *)destinationURL
                       resolve:(RCTPromiseResolveBlock)resolve
                        reject:(RCTPromiseRejectBlock)reject {
  @try {
    CFDictionaryRef options = (__bridge CFDictionaryRef) @{(id)kCGImageSourceShouldCache : @NO};
    CGImageSourceRef source = CGImageSourceCreateWithData((__bridge CFDataRef)imageData, options);
    if (!source) {
      reject(@"Error Creating Image Source", @"Failed to create image source with JPEG data", nil);
      return;
    }

    CFStringRef type = CGImageSourceGetType(source);
    CGImageDestinationRef destination = CGImageDestinationCreateWithURL((__bridge CFURLRef)destinationURL, type, 1, NULL);
    if (!destination) {
      CFRelease(source);
      reject(@"Error Creating Image Destination", [NSString stringWithFormat:@"Failed to create image destination at URL: %@", destinationURL], nil);
      return;
    }

    CFDictionaryRef imageProperties = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, NULL);
    CGImageDestinationAddImageFromSource(destination, source, 0, imageProperties);

    if (!CGImageDestinationFinalize(destination)) {
      CFRelease(destination);
      CFRelease(source);
      reject(@"Error Writing Image", @"Failed to finalize image destination", nil);
      return;
    }

    CFRelease(destination);
    CFRelease(source);
    resolve(destinationURL.path);
  } @catch (NSException *exception) {
    reject(@"Error Writing Image", exception.reason, nil);
  }
}

@end
