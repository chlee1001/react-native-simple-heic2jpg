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

### Stripping metadata

Pass `stripExif` or `stripGps` to drop metadata from the converted JPEG:

```js
// Remove GPS only (keeps camera info, dates, orientation)
await convertImage(path, { stripGps: true });

// Remove all EXIF/GPS except the orientation tag
await convertImage(path, { stripExif: true });
```

- `stripGps: true` removes only GPS tags.
- `stripExif: true` removes all EXIF and GPS metadata except the orientation tag (which is kept so the image still renders upright). `stripExif` implies `stripGps`.
- Both default to `false`.

Stripping only applies to **HEIC/HEIF inputs that are converted**. JPEG and PNG inputs are passed through without re-encoding, so their metadata is returned untouched — `convertImage(jpgPath, { stripGps: true })` does not modify the original JPEG.

> Platform note: on iOS, `stripExif` removes the EXIF and GPS metadata blocks but may retain camera make/model fields stored in the TIFF block. GPS is removed on both platforms; Android's `stripExif` also drops make/model. Full parity is deferred to a future major release.

### EXIF orientation policy

Both platforms preserve the EXIF orientation **tag** but do **not** rotate the pixels:

- The converted JPEG carries the source's `Orientation` tag unchanged.
- The pixel data is written unrotated (Android decodes raw pixels with `BitmapFactory`; iOS keeps the `CIImage` unrotated).
- Your app — or the image component you render with — is responsible for interpreting the orientation tag, exactly as it would for the original HEIC.

This behavior is identical on iOS and Android.

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

## Error handling

The promise rejects on failure. New failure paths carry a stable `error.code` you can branch on:

| `error.code` | Platform | When |
| --- | --- | --- |
| `E_HEIF_UNSUPPORTED_OS` | Android | HEIC/HEIF decode attempted below Android 9 (API 28), where the platform has no HEIF decoder. |
| `E_HEIF_DECODE_FAILED` | Android | The input could not be decoded (corrupt or not a real HEIC/HEIF). |
| `E_UNSUPPORTED_URI` | Android | A `content://` URI was passed. Resolve it to a local file path first. |

### Platform differences

- **`content://` rejection** happens on both platforms, but the code differs: Android rejects with `E_UNSUPPORTED_URI`, while iOS rejects with its existing `Unsupported URI` code. The codes are intentionally left unaligned in this release to avoid changing the established iOS code (a breaking change); full alignment is deferred to a future major.
- **Pass-through inputs** (JPEG/PNG) are never re-encoded, so `stripExif` / `stripGps` have no effect on them on either platform.
- **Existing iOS reject codes** (for example `Unsupported Image Format`) are unchanged in this release.

## License

MIT
