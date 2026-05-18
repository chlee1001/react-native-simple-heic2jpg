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
  - One exported helper: `convertImage(imagePath, options?)`.

## Usage

```js
import { convertImage } from 'react-native-simple-heic2jpg';

const result = await convertImage(path);
```

To receive raw base64 instead of a file URI:

```js
const base64 = await convertImage(path, { returnBase64: true });
```

### Input path contract

`convertImage` accepts local image files as either:

- raw local file paths, for example `/var/mobile/.../IMG_0001.HEIC` or `/storage/emulated/0/.../IMG_0001.HEIC`
- local `file://` URIs, for example `file:///var/mobile/.../IMG_0001.HEIC`

`content://` URIs are not supported by this release. Resolve them to a local file path before calling `convertImage`.

### Return value

By default, the JavaScript API resolves to a `file://` URI string.

- HEIC/HEIF input: returns the converted JPEG file URI.
- JPEG/PNG input: returns the original file URI.

When `returnBase64` is `true`, the JavaScript API resolves to a raw base64 string.

- HEIC/HEIF input: returns the converted JPEG bytes as base64.
- JPEG/JPG/PNG input: returns the original file bytes as base64.
- The returned string does not include a `file://` prefix.
- The returned string does not include a `data:image/...;base64,` prefix. Add one in your app if your target component requires a data URI.
- HEIC/HEIF base64 mode may use temporary/cache files internally so the returned base64 comes from finalized JPEG bytes with preserved metadata. Generated temporary/cache files are cleaned after encoding.
- Base64 increases memory usage compared with URI mode, so URI mode remains the default and is recommended for large images.

## License

MIT
