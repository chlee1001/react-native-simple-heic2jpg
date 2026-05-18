import SimpleHeic2jpg from './NativeSimpleHeic2jpg';

export type ConvertImageOptions = {
  returnBase64?: boolean;
};

async function convertImage(
  imagePath: string,
  options?: ConvertImageOptions
): Promise<string> {
  if (!SimpleHeic2jpg || !SimpleHeic2jpg.convertImageAtPath) {
    throw new Error('SimpleHeic2jpg module is not available');
  }

  if (options?.returnBase64) {
    if (!SimpleHeic2jpg.convertImageAtPathAsBase64) {
      throw new Error(
        'SimpleHeic2jpg base64 conversion method is not available'
      );
    }

    const base64 = await SimpleHeic2jpg.convertImageAtPathAsBase64(imagePath);
    if (!base64) {
      throw new Error('convertImageAtPathAsBase64 returned an invalid result');
    }

    return base64;
  }

  const newPath = await SimpleHeic2jpg.convertImageAtPath(imagePath);
  if (!newPath) {
    throw new Error('convertImageAtPath returned an invalid result');
  }

  if (newPath.startsWith('file://')) {
    return newPath;
  }
  return `file://${newPath}`;
}

export { convertImage };
