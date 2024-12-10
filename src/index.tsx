import NativeModule from './NativeSimpleHeic2jpg';

async function convertImage(imagePath: string) {
  try {
    const newPath = await NativeModule?.convertImageAtPath(imagePath);
    if (!newPath) {
      throw new Error('convertImageAtPath is not available');
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
