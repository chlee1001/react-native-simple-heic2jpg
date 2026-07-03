#import <XCTest/XCTest.h>
#import <ImageIO/ImageIO.h>
#import <CoreGraphics/CoreGraphics.h>

// Test-only surface for the private metadata writer. Declared with a plain reject
// block type (structurally identical to RCTPromiseRejectBlock) so the test target
// does not need to link React headers. The real implementation lives in
// SimpleHeic2jpg.mm and is resolved by the ObjC runtime at call time.
typedef void (^StripTestRejectBlock)(NSString *code, NSString *message, NSError *error);

@interface SimpleHeic2jpg : NSObject
@end

@interface SimpleHeic2jpg (StripTesting)
- (BOOL)writeFinalizedJPEGData:(NSData *)imageData
                   imageSource:(CGImageSourceRef)imageSource
                destinationURL:(NSURL *)destinationURL
                     stripExif:(BOOL)stripExif
                      stripGps:(BOOL)stripGps
                   gpsLatitude:(NSNumber *)gpsLatitude
                  gpsLongitude:(NSNumber *)gpsLongitude
                        reject:(StripTestRejectBlock)reject;
@end

@interface SimpleHeic2jpgStripTests : XCTestCase
@end

@implementation SimpleHeic2jpgStripTests

// Builds an in-memory JPEG carrying a GPS dictionary, an EXIF dictionary, and a
// non-default orientation, so each strip mode has something to remove or keep.
// Deliberately NON-SQUARE (3x2): a square fixture cannot reveal a pixel rotation, so the
// width != height is what makes the pixel-non-rotation assertions meaningful.
static NSData *MakeJPEGWithMetadata(void) {
  size_t width = 3;
  size_t height = 2;
  CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
  CGContextRef ctx = CGBitmapContextCreate(NULL, width, height, 8, 0, colorSpace,
                                           (CGBitmapInfo)kCGImageAlphaPremultipliedLast);
  CGContextSetRGBFillColor(ctx, 1.0, 0.0, 0.0, 1.0);
  CGContextFillRect(ctx, CGRectMake(0, 0, width, height));
  CGImageRef image = CGBitmapContextCreateImage(ctx);

  NSDictionary *properties = @{
    (id)kCGImagePropertyGPSDictionary: @{
      (id)kCGImagePropertyGPSLatitude: @37.5,
      (id)kCGImagePropertyGPSLatitudeRef: @"N",
      (id)kCGImagePropertyGPSLongitude: @127.0,
      (id)kCGImagePropertyGPSLongitudeRef: @"E",
    },
    (id)kCGImagePropertyExifDictionary: @{
      (id)kCGImagePropertyExifUserComment: @"strip-test",
    },
    (id)kCGImagePropertyOrientation: @6, // rotate 90° CW — non-default
  };

  NSMutableData *data = [NSMutableData data];
  CGImageDestinationRef dest =
      CGImageDestinationCreateWithData((__bridge CFMutableDataRef)data,
                                       (CFStringRef)@"public.jpeg", 1, NULL);
  CGImageDestinationAddImage(dest, image, (__bridge CFDictionaryRef)properties);
  CGImageDestinationFinalize(dest);

  CFRelease(dest);
  CGImageRelease(image);
  CGContextRelease(ctx);
  CGColorSpaceRelease(colorSpace);
  return data;
}

static NSDictionary *PropertiesOfData(NSData *data) {
  CGImageSourceRef source = CGImageSourceCreateWithData((__bridge CFDataRef)data, NULL);
  NSDictionary *props =
      (NSDictionary *)CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source, 0, NULL));
  if (source) {
    CFRelease(source);
  }
  return props;
}

- (NSURL *)temporaryOutputURL {
  NSString *name = [NSString stringWithFormat:@"strip-test-%@.jpeg", [NSUUID UUID].UUIDString];
  return [NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:name]];
}

- (NSDictionary *)writeWithStripExif:(BOOL)stripExif stripGps:(BOOL)stripGps {
  return [self writeWithStripExif:stripExif
                         stripGps:stripGps
                      gpsLatitude:nil
                     gpsLongitude:nil];
}

- (NSDictionary *)writeWithStripExif:(BOOL)stripExif
                            stripGps:(BOOL)stripGps
                         gpsLatitude:(NSNumber *)gpsLatitude
                        gpsLongitude:(NSNumber *)gpsLongitude {
  NSData *source = MakeJPEGWithMetadata();

  // Sanity: the synthetic source actually carries GPS + orientation and is 3x2.
  NSDictionary *sourceProps = PropertiesOfData(source);
  XCTAssertNotNil(sourceProps[(id)kCGImagePropertyGPSDictionary],
                  @"fixture should start with a GPS dictionary");
  XCTAssertNotNil(sourceProps[(id)kCGImagePropertyOrientation],
                  @"fixture should start with an orientation tag");
  XCTAssertEqualObjects(sourceProps[(id)kCGImagePropertyPixelWidth], @3,
                        @"fixture should start 3 px wide");
  XCTAssertEqualObjects(sourceProps[(id)kCGImagePropertyPixelHeight], @2,
                        @"fixture should start 2 px tall");

  CGImageSourceRef imageSource = CGImageSourceCreateWithData((__bridge CFDataRef)source, NULL);
  NSURL *outputURL = [self temporaryOutputURL];

  SimpleHeic2jpg *module = [SimpleHeic2jpg new];
  __block BOOL rejected = NO;
  BOOL ok = [module writeFinalizedJPEGData:source
                              imageSource:imageSource
                           destinationURL:outputURL
                                stripExif:stripExif
                                 stripGps:stripGps
                              gpsLatitude:gpsLatitude
                             gpsLongitude:gpsLongitude
                                   reject:^(NSString *code, NSString *message, NSError *error) {
                                     rejected = YES;
                                   }];
  if (imageSource) {
    CFRelease(imageSource);
  }

  XCTAssertTrue(ok, @"writeFinalizedJPEGData should succeed");
  XCTAssertFalse(rejected, @"writeFinalizedJPEGData should not reject");

  NSData *output = [NSData dataWithContentsOfURL:outputURL];
  [[NSFileManager defaultManager] removeItemAtURL:outputURL error:nil];
  XCTAssertNotNil(output, @"output file should exist");

  NSDictionary *outputProps = PropertiesOfData(output);
  XCTAssertNotNil(outputProps, @"output image must be readable");
  // The orientation tag must survive with its original VALUE (not merely be present): a
  // regression that wrote @1 (normal) would keep the tag and the pixel dims yet render sideways.
  XCTAssertEqualObjects(outputProps[(id)kCGImagePropertyOrientation], @6,
                        @"orientation value must be preserved across strip modes");
  // Pixel non-rotation: a 90-degree rotation would swap the 3x2 fixture to 2x3. Asserting the
  // decoded pixel dimensions are unchanged across every strip mode proves the finalize step
  // preserves orientation as a tag without baking the rotation into the pixels.
  XCTAssertEqualObjects(outputProps[(id)kCGImagePropertyPixelWidth], @3,
                        @"pixel width must be unchanged (pixels not rotated)");
  XCTAssertEqualObjects(outputProps[(id)kCGImagePropertyPixelHeight], @2,
                        @"pixel height must be unchanged (pixels not rotated)");
  return outputProps;
}

- (void)testNoStripPreservesGps {
  NSDictionary *props = [self writeWithStripExif:NO stripGps:NO];
  XCTAssertNotNil(props[(id)kCGImagePropertyGPSDictionary],
                  @"GPS should be preserved when not stripping");
  XCTAssertNotNil(props[(id)kCGImagePropertyOrientation],
                  @"orientation should be preserved");
}

- (void)testStripGpsRemovesGpsKeepsOrientationAndExif {
  NSDictionary *props = [self writeWithStripExif:NO stripGps:YES];
  XCTAssertNil(props[(id)kCGImagePropertyGPSDictionary],
               @"GPS dictionary should be removed by stripGps");
  XCTAssertNotNil(props[(id)kCGImagePropertyExifDictionary],
                  @"EXIF should remain when only stripping GPS");
  XCTAssertNotNil(props[(id)kCGImagePropertyOrientation],
                  @"orientation tag must survive stripGps");
}

- (void)testStripExifRemovesExifAndGpsKeepsOrientation {
  NSDictionary *props = [self writeWithStripExif:YES stripGps:NO];
  XCTAssertNil(props[(id)kCGImagePropertyExifDictionary],
               @"EXIF dictionary should be removed by stripExif");
  XCTAssertNil(props[(id)kCGImagePropertyGPSDictionary],
               @"stripExif implies GPS removal");
  XCTAssertNotNil(props[(id)kCGImagePropertyOrientation],
                  @"orientation tag must survive stripExif (top-level/TIFF, not EXIF dict)");
}

// Injection contract: provided coordinates replace the source GPS (fixture carries
// 37.5/127.0) AND win over stripGps — strip removes the source block first, then the
// injected block is written. Negative longitude exercises the W hemisphere ref.
- (void)testGpsInjectionOverridesSourceAndStrip {
  NSDictionary *props = [self writeWithStripExif:NO
                                        stripGps:YES
                                     gpsLatitude:@35.1796
                                    gpsLongitude:@-129.0756];
  NSDictionary *gps = props[(id)kCGImagePropertyGPSDictionary];
  XCTAssertNotNil(gps, @"injected GPS dictionary should be present despite stripGps");
  XCTAssertEqualWithAccuracy([gps[(id)kCGImagePropertyGPSLatitude] doubleValue],
                             35.1796, 0.0005, @"injected latitude should round-trip");
  XCTAssertEqualObjects(gps[(id)kCGImagePropertyGPSLatitudeRef], @"N",
                        @"positive latitude is northern hemisphere");
  XCTAssertEqualWithAccuracy([gps[(id)kCGImagePropertyGPSLongitude] doubleValue],
                             129.0756, 0.0005, @"longitude is stored as absolute value");
  XCTAssertEqualObjects(gps[(id)kCGImagePropertyGPSLongitudeRef], @"W",
                        @"negative longitude is western hemisphere");
}

@end
