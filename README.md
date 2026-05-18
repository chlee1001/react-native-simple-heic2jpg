# react-native-simple-heic2jpg

React Native native module for converting local HEIC/HEIF images to JPEG on Android and iOS.

## Installation

```sh
npm install react-native-simple-heic2jpg

# or
yarn add react-native-simple-heic2jpg

# For iOS
cd ios && pod install
```

## Features

- **Image format conversion**
  - Converts local HEIC/HEIF images to JPEG.
  - JPEG and PNG inputs are passed through without conversion.

- **EXIF metadata preservation**
  - Copies supported metadata such as GPS, camera, orientation, and date fields from the source image to the converted JPEG.
  - Exact metadata preservation depends on platform image/EXIF support.

- **iOS and Android support**
  - iOS implementation: Objective-C++ using ImageIO/CoreImage.
  - Android implementation: Kotlin using `BitmapFactory` and AndroidX ExifInterface.
  - Supports React Native old architecture and TurboModule/new architecture wiring.

- **Simple JavaScript API**
  - One exported helper: `convertImage(imagePath)`.

## Usage

```js
import { convertImage } from 'react-native-simple-heic2jpg';

const result = await convertImage(path);
```

### Input path contract

`convertImage` accepts local image files as either:

- raw local file paths, for example `/var/mobile/.../IMG_0001.HEIC` or `/storage/emulated/0/.../IMG_0001.HEIC`
- local `file://` URIs, for example `file:///var/mobile/.../IMG_0001.HEIC`

`content://` URIs are not supported by this release. Resolve them to a local file path before calling `convertImage`.

### Return value

The JavaScript API always resolves to a `file://` URI string.

- HEIC/HEIF input: returns the converted JPEG file URI.
- JPEG/PNG input: returns the original file URI.

## License

MIT
