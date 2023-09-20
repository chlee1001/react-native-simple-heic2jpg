import { NativeModules, Platform } from 'react-native';

const LINKING_ERROR =
  `The package 'react-native-simple-heic2jpg' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

interface ImageConverterInterface {
  convertImageAtPath(path: string): Promise<string>;
}

const SimpleHeic2jpg = NativeModules.SimpleHeic2jpg
  ? NativeModules.SimpleHeic2jpg
  : (new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    ) as ImageConverterInterface);

export async function convertImage(imagePath: string): Promise<string> {
  try {
    const newPath = await SimpleHeic2jpg.convertImageAtPath(imagePath);
    if (newPath.startsWith('file://')) {
      return newPath;
    }
    return `file://${newPath}`;
  } catch (error) {
    throw error;
  }
}
