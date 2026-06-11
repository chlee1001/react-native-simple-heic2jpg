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
                   options:(JS::NativeSimpleHeic2jpg::ConvertNativeOptions &)options
                   resolve:(RCTPromiseResolveBlock)resolve
                    reject:(RCTPromiseRejectBlock)reject {
  // Optional codegen doubles arrive as std::optional; nil NSNumber means "absent".
  std::optional<double> lat = options.gpsLatitude();
  std::optional<double> lng = options.gpsLongitude();
  [self convertImageAtPathImplementation:path
                               stripExif:options.stripExif()
                                stripGps:options.stripGps()
                             gpsLatitude:lat.has_value() ? @(lat.value()) : nil
                            gpsLongitude:lng.has_value() ? @(lng.value()) : nil
                                 resolve:resolve
                                  reject:reject];
}

- (void)convertImageAtPathAsBase64:(NSString *)path
                           options:(JS::NativeSimpleHeic2jpg::ConvertNativeOptions &)options
                           resolve:(RCTPromiseResolveBlock)resolve
                            reject:(RCTPromiseRejectBlock)reject {
  std::optional<double> lat = options.gpsLatitude();
  std::optional<double> lng = options.gpsLongitude();
  [self convertImageAtPathAsBase64Implementation:path
                                       stripExif:options.stripExif()
                                        stripGps:options.stripGps()
                                     gpsLatitude:lat.has_value() ? @(lat.value()) : nil
                                    gpsLongitude:lng.has_value() ? @(lng.value()) : nil
                                         resolve:resolve
                                          reject:reject];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
(const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeSimpleHeic2jpgSpecJSI>(params);
}
#else
// Old Architecture 메서드
// Defensive read: the JS wrapper omits the key when absent; reject NSNull/odd types.
static NSNumber *SHJOptionalNumber(NSDictionary *options, NSString *key) {
  id value = options[key];
  return [value isKindOfClass:[NSNumber class]] ? (NSNumber *)value : nil;
}

RCT_EXPORT_METHOD(convertImageAtPath:(NSString *)path
                  options:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  [self convertImageAtPathImplementation:path
                               stripExif:[options[@"stripExif"] boolValue]
                                stripGps:[options[@"stripGps"] boolValue]
                             gpsLatitude:SHJOptionalNumber(options, @"gpsLatitude")
                            gpsLongitude:SHJOptionalNumber(options, @"gpsLongitude")
                                 resolve:resolve
                                  reject:reject];
}

RCT_EXPORT_METHOD(convertImageAtPathAsBase64:(NSString *)path
                  options:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  [self convertImageAtPathAsBase64Implementation:path
                                       stripExif:[options[@"stripExif"] boolValue]
                                        stripGps:[options[@"stripGps"] boolValue]
                                     gpsLatitude:SHJOptionalNumber(options, @"gpsLatitude")
                                    gpsLongitude:SHJOptionalNumber(options, @"gpsLongitude")
                                         resolve:resolve
                                          reject:reject];
}
#endif

// 공통 구현 (Old/New Architecture에서 호출)
- (void)convertImageAtPathImplementation:(NSString *)path
                               stripExif:(BOOL)stripExif
                                stripGps:(BOOL)stripGps
                             gpsLatitude:(NSNumber *)gpsLatitude
                            gpsLongitude:(NSNumber *)gpsLongitude
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
                         stripExif:stripExif
                          stripGps:stripGps
                       gpsLatitude:gpsLatitude
                      gpsLongitude:gpsLongitude
                           resolve:resolve
                            reject:reject];
    } else if (CFStringCompare(imageType, CFSTR("public.jpeg"), 0) == kCFCompareEqualTo) {
      if (gpsLatitude && gpsLongitude) {
        // gps option promotes the JPEG pass-through to an injected copy; the caller's
        // file is never mutated. AddImageFromSource rewrites metadata without
        // re-encoding pixels when source and destination are both JPEG.
        NSString *outputImagePath = [self uniqueJPEGOutputPathForFilePath:url.path];
        NSURL *destinationURL = [NSURL fileURLWithPath:outputImagePath];
        NSData *jpegData = [NSData dataWithContentsOfURL:url];
        if (!jpegData) {
          reject(@"Error Loading Image", @"Failed to load image from path", nil);
          return;
        }
        if ([self writeFinalizedJPEGData:jpegData
                             imageSource:imageSource
                          destinationURL:destinationURL
                               stripExif:NO
                                stripGps:NO
                             gpsLatitude:gpsLatitude
                            gpsLongitude:gpsLongitude
                                  reject:reject]) {
          resolve(destinationURL.path);
        }
      } else {
        resolve(path);
      }
    } else if (CFStringCompare(imageType, CFSTR("public.png"), 0) == kCFCompareEqualTo) {
      // PNG has no reliable EXIF container; gps injection is JPEG/HEIC-only.
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

- (void)convertImageAtPathAsBase64Implementation:(NSString *)path
                                       stripExif:(BOOL)stripExif
                                        stripGps:(BOOL)stripGps
                                     gpsLatitude:(NSNumber *)gpsLatitude
                                    gpsLongitude:(NSNumber *)gpsLongitude
                                        resolve:(RCTPromiseResolveBlock)resolve
                                         reject:(RCTPromiseRejectBlock)reject {
  CGImageSourceRef imageSource = NULL;
  NSString *generatedJPEGPath = nil;

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

    NSData *base64SourceData = nil;

    if (CFStringCompare(imageType, CFSTR("public.heic"), 0) == kCFCompareEqualTo ||
        CFStringCompare(imageType, CFSTR("public.heif"), 0) == kCFCompareEqualTo) {
      generatedJPEGPath = [self uniqueTemporaryJPEGOutputPathForFilePath:url.path];
      NSURL *destinationURL = [NSURL fileURLWithPath:generatedJPEGPath];

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

      if (![self writeFinalizedJPEGData:jpegData
                            imageSource:imageSource
                         destinationURL:destinationURL
                              stripExif:stripExif
                               stripGps:stripGps
                            gpsLatitude:gpsLatitude
                           gpsLongitude:gpsLongitude
                                  reject:reject]) {
        return;
      }

      // Read finalized destination bytes so metadata/finalization are included.
      base64SourceData = [NSData dataWithContentsOfURL:destinationURL];
    } else if (CFStringCompare(imageType, CFSTR("public.jpeg"), 0) == kCFCompareEqualTo &&
               gpsLatitude && gpsLongitude) {
      // Same injected-copy promotion as the URI path; the temporary copy is removed
      // in @finally via generatedJPEGPath, the caller's file is never mutated.
      generatedJPEGPath = [self uniqueTemporaryJPEGOutputPathForFilePath:url.path];
      NSURL *destinationURL = [NSURL fileURLWithPath:generatedJPEGPath];
      NSData *jpegData = [NSData dataWithContentsOfURL:url];
      if (!jpegData) {
        reject(@"Error Loading Image", @"Failed to load image from path", nil);
        return;
      }
      if (![self writeFinalizedJPEGData:jpegData
                            imageSource:imageSource
                         destinationURL:destinationURL
                              stripExif:NO
                               stripGps:NO
                            gpsLatitude:gpsLatitude
                           gpsLongitude:gpsLongitude
                                 reject:reject]) {
        return;
      }
      base64SourceData = [NSData dataWithContentsOfURL:destinationURL];
    } else if (CFStringCompare(imageType, CFSTR("public.jpeg"), 0) == kCFCompareEqualTo ||
               CFStringCompare(imageType, CFSTR("public.png"), 0) == kCFCompareEqualTo) {
      // JPEG/JPG/PNG inputs are caller-owned; read original bytes and never delete them.
      // PNG is always pass-through: it has no reliable EXIF container for gps injection.
      base64SourceData = [NSData dataWithContentsOfURL:url];
    } else {
      reject(@"Unsupported Image Format", @"Unsupported image format", nil);
      return;
    }

    if (!base64SourceData) {
      reject(@"Error Reading Image Data", @"Failed to read image data for base64 encoding", nil);
      return;
    }

    resolve([base64SourceData base64EncodedStringWithOptions:0]);
  } @catch (NSException *exception) {
    reject(@"Error", exception.reason, nil);
  } @finally {
    if (imageSource) {
      CFRelease(imageSource);
    }
    if (generatedJPEGPath) {
      [[NSFileManager defaultManager] removeItemAtPath:generatedJPEGPath error:nil];
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

- (NSString *)uniqueTemporaryJPEGOutputPathForFilePath:(NSString *)filePath {
  NSString *baseName = [[filePath lastPathComponent] stringByDeletingPathExtension];
  NSString *fileName = [NSString stringWithFormat:@"%@-%@.jpeg", baseName, [NSUUID UUID].UUIDString];
  return [NSTemporaryDirectory() stringByAppendingPathComponent:fileName];
}

- (BOOL)writeFinalizedJPEGData:(NSData *)imageData
                   imageSource:(CGImageSourceRef)imageSource
                destinationURL:(NSURL *)destinationURL
                     stripExif:(BOOL)stripExif
                      stripGps:(BOOL)stripGps
                   gpsLatitude:(NSNumber *)gpsLatitude
                  gpsLongitude:(NSNumber *)gpsLongitude
                        reject:(RCTPromiseRejectBlock)reject {
  CGImageSourceRef source = NULL;
  CGImageDestinationRef destination = NULL;
  CFDictionaryRef imageProperties = NULL;
  CFMutableDictionaryRef strippedProperties = NULL;

  @try {
    CFDictionaryRef options = (__bridge CFDictionaryRef) @{(id)kCGImageSourceShouldCache : @NO};
    source = CGImageSourceCreateWithData((__bridge CFDataRef)imageData, options);
    if (!source) {
      reject(@"Error Creating Image Source", @"Failed to create image source with JPEG data", nil);
      return NO;
    }

    destination = CGImageDestinationCreateWithURL((__bridge CFURLRef)destinationURL, CFSTR("public.jpeg"), 1, NULL);
    if (!destination) {
      reject(@"Error Creating Image Destination", [NSString stringWithFormat:@"Failed to create image destination at URL: %@", destinationURL], nil);
      return NO;
    }

    imageProperties = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, NULL);

    // Strip operates by removing whole top-level property dictionaries. Orientation
    // lives in the TIFF dict (kCGImagePropertyTIFFOrientation) and the top-level
    // kCGImagePropertyOrientation, neither of which is removed here, so it survives
    // both strip modes — matching the Android "tag preserved, pixels not rotated"
    // policy. Only HEIC→JPEG conversions reach this writer; JPEG/PNG pass-throughs
    // are returned untouched, so strip does not apply to them (documented asymmetry).
    CFDictionaryRef propertiesToWrite = imageProperties;
    if ((stripExif || stripGps) && imageProperties) {
      strippedProperties = CFDictionaryCreateMutableCopy(kCFAllocatorDefault, 0, imageProperties);
      if (strippedProperties) {
        // Either flag removes GPS; stripExif additionally removes the EXIF block.
        // Orientation is untouched (it lives in the TIFF/top-level dicts).
        CFDictionaryRemoveValue(strippedProperties, kCGImagePropertyGPSDictionary);
        if (stripExif) {
          CFDictionaryRemoveValue(strippedProperties, kCGImagePropertyExifDictionary);
        }
        propertiesToWrite = strippedProperties;
      }
    }
    // GPS injection runs after the strip pass so the injected coordinates win over
    // both the source values and the strip flags (same contract as Android: injection
    // overrides stripGps/stripExif for the GPS block only). Reuses strippedProperties
    // as the mutable working dict; creates one when the source had no properties.
    if (gpsLatitude && gpsLongitude) {
      if (!strippedProperties) {
        strippedProperties = imageProperties
            ? CFDictionaryCreateMutableCopy(kCFAllocatorDefault, 0, imageProperties)
            : CFDictionaryCreateMutable(kCFAllocatorDefault, 0,
                                        &kCFTypeDictionaryKeyCallBacks,
                                        &kCFTypeDictionaryValueCallBacks);
      }
      if (strippedProperties) {
        double latitude = gpsLatitude.doubleValue;
        double longitude = gpsLongitude.doubleValue;
        NSDictionary *gpsDictionary = @{
          (id)kCGImagePropertyGPSLatitude : @(fabs(latitude)),
          (id)kCGImagePropertyGPSLatitudeRef : latitude >= 0 ? @"N" : @"S",
          (id)kCGImagePropertyGPSLongitude : @(fabs(longitude)),
          (id)kCGImagePropertyGPSLongitudeRef : longitude >= 0 ? @"E" : @"W",
        };
        CFDictionarySetValue(strippedProperties, kCGImagePropertyGPSDictionary,
                             (__bridge CFDictionaryRef)gpsDictionary);
        propertiesToWrite = strippedProperties;
      }
    }
    CGImageDestinationAddImageFromSource(destination, source, 0, propertiesToWrite);

    if (!CGImageDestinationFinalize(destination)) {
      reject(@"Error Writing Image", @"Failed to finalize image destination", nil);
      return NO;
    }

    return YES;
  } @catch (NSException *exception) {
    reject(@"Error Writing Image", exception.reason, nil);
    return NO;
  } @finally {
    if (strippedProperties) {
      CFRelease(strippedProperties);
    }
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

- (void)createImageDestination:(NSData *)imageData
                   imageSource:(CGImageSourceRef)imageSource
                destinationURL:(NSURL *)destinationURL
                     stripExif:(BOOL)stripExif
                      stripGps:(BOOL)stripGps
                   gpsLatitude:(NSNumber *)gpsLatitude
                  gpsLongitude:(NSNumber *)gpsLongitude
                       resolve:(RCTPromiseResolveBlock)resolve
                        reject:(RCTPromiseRejectBlock)reject {
  if ([self writeFinalizedJPEGData:imageData
                       imageSource:imageSource
                    destinationURL:destinationURL
                         stripExif:stripExif
                          stripGps:stripGps
                       gpsLatitude:gpsLatitude
                      gpsLongitude:gpsLongitude
                             reject:reject]) {
    resolve(destinationURL.path);
  }
}

@end
