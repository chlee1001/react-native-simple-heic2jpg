# react-native-simple-heic2jpg

React Native Component for converts HEIC files on Android and iOS

## Installation

```sh
npm install react-native-simple-heic2jpg

yarn add react-native-simple-heic2jpg
```

## Features
- [x] Image Format Conversion:
  - Converts images in HEIC or HEIF format to JPEG while maintaining the original quality.
    Supports retaining the original format for JPEG and PNG images without conversion.


- [x] EXIF Metadata Preservation:
  - Retains the essential metadata (like GPS data, camera specifications, datetime, etc.) from the original image to the converted image.


- [x] iOS and Android Support:
  - Separate modules for iOS (Swift) and Android (Java) platforms, ensuring seamless integration and functionality in a React Native environment.


- [x] Ease of Integration:
  - Simple and straightforward API, allowing for easy integration into existing React Native projects.

## Usage

```js
import { convertImage } from 'react-native-simple-heic2jpg';

// ...

// path is the path of the image to be converted
// path is the "Path to your .HEIC file"
const result = await convertImage(path)
// result is the "Path to your .JPG file"
```



## License

MIT
