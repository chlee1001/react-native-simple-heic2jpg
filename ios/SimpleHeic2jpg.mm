#import "SimpleHeic2jpg.h"
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
  CGImageSourceRef imageSource = NULL;

  @try {
    if (!path || [path isEqualToString:@""]) {
      reject(@"Invalid Path", @"The path is invalid or empty", nil);
      return;
    }

    NSURL *url = [self normalizedLocalFileURLForPath:path reject:reject];
    if (!url) {
      return;
    }

    imageSource = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
    if (!imageSource) {
      reject(@"Error Creating Image Source", @"Cannot create image source", nil);
      return;
    }

    CFStringRef imageType = CGImageSourceGetType(imageSource);
    if (!imageType) {
      reject(@"Error Getting Image Type", @"Cannot get image type", nil);
      return;
    }

    // Handle HEIC or HEIF conversion to JPEG
    if (CFStringCompare(imageType, CFSTR("public.heic"), 0) == kCFCompareEqualTo ||
        CFStringCompare(imageType, CFSTR("public.heif"), 0) == kCFCompareEqualTo) {
      NSString *outputImagePath = [self uniqueJPEGOutputPathForFilePath:url.path];
      NSURL *destinationURL = [NSURL fileURLWithPath:outputImagePath];

      NSData *tempImageData = [NSData dataWithContentsOfURL:url];
      UIImage *image = [UIImage imageWithData:tempImageData];
      if (!image) {
        reject(@"Error Loading Image", @"Failed to load image from path", nil);
        return;
      }

      CGImageRef cgImage = image.CGImage;
      CGColorSpaceRef colorSpace = cgImage ? CGImageGetColorSpace(cgImage) : NULL;
      if (!cgImage || !colorSpace) {
        reject(@"Error Processing Image", @"Failed to process image data", nil);
        return;
      }

      CIImage *ciImage = [CIImage imageWithCGImage:cgImage];
      CIContext *context = [CIContext context];
      NSData *jpegData = [context JPEGRepresentationOfImage:ciImage
                                                 colorSpace:colorSpace
                                                    options:@{}];
      if (!jpegData) {
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
      resolve(path);
    } else {
      reject(@"Unsupported Image Format", @"Unsupported image format", nil);
    }
  } @catch (NSException *exception) {
    reject(@"Error", exception.reason, nil);
  } @finally {
    if (imageSource) {
      CFRelease(imageSource);
    }
  }
}

- (NSURL *)normalizedLocalFileURLForPath:(NSString *)path
                                  reject:(RCTPromiseRejectBlock)reject {
  NSRange colonRange = [path rangeOfString:@":"];
  NSRange slashRange = [path rangeOfString:@"/"];
  BOOL hasScheme = colonRange.location != NSNotFound &&
                   (slashRange.location == NSNotFound || colonRange.location < slashRange.location);

  if (hasScheme) {
    NSString *scheme = [[path substringToIndex:colonRange.location] lowercaseString];
    if (![scheme isEqualToString:@"file"]) {
      reject(@"Unsupported URI", @"Only local file paths and file:// URIs are supported", nil);
      return nil;
    }

    NSURL *candidateURL = [NSURL URLWithString:path];
    if (!candidateURL.isFileURL || candidateURL.path.length == 0) {
      reject(@"Invalid URL", @"The file:// URI is invalid", nil);
      return nil;
    }
    if (candidateURL.host.length > 0 &&
        ![candidateURL.host.lowercaseString isEqualToString:@"localhost"]) {
      reject(@"Unsupported URI", @"Only local file paths and local file:// URIs are supported", nil);
      return nil;
    }

    return [NSURL fileURLWithPath:candidateURL.path];
  }

  return [NSURL fileURLWithPath:path];
}

- (NSString *)uniqueJPEGOutputPathForFilePath:(NSString *)filePath {
  NSString *directory = [filePath stringByDeletingLastPathComponent];
  NSString *baseName = [[filePath lastPathComponent] stringByDeletingPathExtension];
  NSFileManager *fileManager = [NSFileManager defaultManager];

  for (NSUInteger attempt = 0; attempt < 3; attempt++) {
    NSString *candidateFileName = [NSString stringWithFormat:@"%@-%@.jpeg", baseName, [NSUUID UUID].UUIDString];
    NSString *candidatePath = [directory stringByAppendingPathComponent:candidateFileName];

    if (![fileManager fileExistsAtPath:candidatePath]) {
      return candidatePath;
    }
  }

  NSString *fallbackFileName = [NSString stringWithFormat:@"%@-%@.jpeg", baseName, [NSUUID UUID].UUIDString];
  return [directory stringByAppendingPathComponent:fallbackFileName];
}

- (void)createImageDestination:(NSData *)imageData
                   imageSource:(CGImageSourceRef)imageSource
                destinationURL:(NSURL *)destinationURL
                       resolve:(RCTPromiseResolveBlock)resolve
                        reject:(RCTPromiseRejectBlock)reject {
  CGImageSourceRef source = NULL;
  CGImageDestinationRef destination = NULL;
  CFDictionaryRef imageProperties = NULL;

  @try {
    CFDictionaryRef options = (__bridge CFDictionaryRef) @{(id)kCGImageSourceShouldCache : @NO};
    source = CGImageSourceCreateWithData((__bridge CFDataRef)imageData, options);
    if (!source) {
      reject(@"Error Creating Image Source", @"Failed to create image source with JPEG data", nil);
      return;
    }

    destination = CGImageDestinationCreateWithURL((__bridge CFURLRef)destinationURL, CFSTR("public.jpeg"), 1, NULL);
    if (!destination) {
      reject(@"Error Creating Image Destination", [NSString stringWithFormat:@"Failed to create image destination at URL: %@", destinationURL], nil);
      return;
    }

    imageProperties = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, NULL);
    CGImageDestinationAddImageFromSource(destination, source, 0, imageProperties);

    if (!CGImageDestinationFinalize(destination)) {
      reject(@"Error Writing Image", @"Failed to finalize image destination", nil);
      return;
    }

    resolve(destinationURL.path);
  } @catch (NSException *exception) {
    reject(@"Error Writing Image", exception.reason, nil);
  } @finally {
    if (imageProperties) {
      CFRelease(imageProperties);
    }
    if (destination) {
      CFRelease(destination);
    }
    if (source) {
      CFRelease(source);
    }
  }
}

@end
