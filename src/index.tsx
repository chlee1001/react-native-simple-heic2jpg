import SimpleHeic2jpg from './NativeSimpleHeic2jpg';
import type { ConvertNativeOptions } from './NativeSimpleHeic2jpg';

export type ConvertImageOptions = {
  returnBase64?: boolean;
  stripExif?: boolean;
  stripGps?: boolean;
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
