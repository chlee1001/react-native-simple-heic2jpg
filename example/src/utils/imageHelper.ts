// @ts-ignore
import ExifReader from '../../node_modules/exifreader/src/exif-reader.js';
import { decode } from 'base64-arraybuffer';
import RNFS from 'react-native-fs';

export const getImageExif = async ({
  imagePath,
  imageBase64,
}: {
  imagePath?: string;
  imageBase64?: string;
}) => {
  try {
    if (!imagePath && !imageBase64) {
      return null;
    }
    if (imageBase64) {
      const fileBuffer = decode(imageBase64);
      return ExifReader.load(fileBuffer, { expanded: true });
    }
    if (imagePath) {
      const b64Buffer = await RNFS.readFile(imagePath, 'base64'); // Where the URI looks like this: "file:///path/to/image/IMG_0123.HEIC"
      const fileBuffer = decode(b64Buffer);
      return ExifReader.load(fileBuffer, { expanded: true });
    }
    return null;
  } catch (e) {
    console.log('getImageExif Error: ', e);
  }
};
