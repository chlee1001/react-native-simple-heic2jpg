import SimpleHeic2jpg from './NativeSimpleHeic2jpg';

async function convertImage(imagePath: string): Promise<string> {
  if (!SimpleHeic2jpg || !SimpleHeic2jpg.convertImageAtPath) {
    throw new Error('SimpleHeic2jpg module is not available');
  }

  try {
    const newPath = await SimpleHeic2jpg.convertImageAtPath(imagePath);
    if (!newPath) {
      throw new Error('convertImageAtPath returned an invalid result');
    }

    if (newPath.startsWith('file://')) {
      return newPath;
    }
    return `file://${newPath}`;
  } catch (error) {
    throw error;
  }
}

export { convertImage };
