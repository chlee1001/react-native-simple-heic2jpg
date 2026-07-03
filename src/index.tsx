import SimpleHeic2jpg from './NativeSimpleHeic2jpg';
import type { ConvertNativeOptions } from './NativeSimpleHeic2jpg';

export type ConvertImageOptions = {
  returnBase64?: boolean;
  stripExif?: boolean;
  stripGps?: boolean;
  /**
   * JPEG encode quality as an integer 0–100. Defaults to 80. Only applies to
   * HEIC/HEIF inputs, which are re-encoded to JPEG; JPEG and PNG inputs pass
   * through without re-encoding, so this option has no effect on them. Values
   * are clamped to the 0–100 range and rounded to an integer.
   */
  quality?: number;
  /**
   * Write these GPS coordinates into the output, replacing whatever the source
   * carried (and overriding stripGps/stripExif for the GPS block). HEIC inputs get
   * them on the converted JPEG; JPEG inputs are promoted from pass-through to an
   * injected cache copy (the original file is never mutated); PNG ignores this.
   * Useful when the input lost its location en route — e.g. Android's photo
   * picker zeroes GPS EXIF, and camera captures arrive as JPEG without a fix.
   */
  gps?: { latitude: number; longitude: number };
};

// The public default JPEG quality. The native sides carry their own copy of this
// value as a defensive fallback for direct native callers (ios/SimpleHeic2jpg.mm
// SHJQuality, android SimpleHeic2jpgModuleImpl.optionQuality); keep the three in sync.
const DEFAULT_QUALITY = 80;

// Coerce the public quality option into the bounded integer the native encoders
// expect. Absence means "use the default"; a non-number is a caller mistake and
// throws; anything in between is clamped to 0–100 and rounded.
function normalizeQuality(quality: number | undefined): number {
  if (quality === undefined) {
    return DEFAULT_QUALITY;
  }
  if (typeof quality !== 'number' || Number.isNaN(quality)) {
    throw new Error('convertImage: quality must be a number between 0 and 100');
  }
  return Math.round(Math.min(100, Math.max(0, quality)));
}

async function convertImage(
  imagePath: string,
  options?: ConvertImageOptions
): Promise<string> {
  if (!SimpleHeic2jpg || !SimpleHeic2jpg.convertImageAtPath) {
    throw new Error('SimpleHeic2jpg module is not available');
  }

  // The native boundary takes a fully-populated struct; fill defaults here so the
  // public API stays optional.
  const nativeOptions: ConvertNativeOptions = {
    stripExif: options?.stripExif ?? false,
    stripGps: options?.stripGps ?? false,
    quality: normalizeQuality(options?.quality),
  };
  if (options?.gps) {
    nativeOptions.gpsLatitude = options.gps.latitude;
    nativeOptions.gpsLongitude = options.gps.longitude;
  }

  if (options?.returnBase64) {
    if (!SimpleHeic2jpg.convertImageAtPathAsBase64) {
      throw new Error(
        'SimpleHeic2jpg base64 conversion method is not available'
      );
    }

    const base64 = await SimpleHeic2jpg.convertImageAtPathAsBase64(
      imagePath,
      nativeOptions
    );
    if (!base64) {
      throw new Error('convertImageAtPathAsBase64 returned an invalid result');
    }

    return base64;
  }

  const newPath = await SimpleHeic2jpg.convertImageAtPath(
    imagePath,
    nativeOptions
  );
  if (!newPath) {
    throw new Error('convertImageAtPath returned an invalid result');
  }

  if (newPath.startsWith('file://')) {
    return newPath;
  }
  return `file://${newPath}`;
}

export { convertImage };
