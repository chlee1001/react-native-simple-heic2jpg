import SimpleHeic2jpg from './NativeSimpleHeic2jpg';
import type { ConvertNativeOptions } from './NativeSimpleHeic2jpg';

export type ConvertImageOptions = {
  returnBase64?: boolean;
  stripExif?: boolean;
  stripGps?: boolean;
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
