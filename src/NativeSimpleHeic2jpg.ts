import type { TurboModule } from 'react-native';
import { TurboModuleRegistry, NativeModules } from 'react-native';

// Native conversion options. A named, non-optional struct: codegen maps trailing
// optional method args poorly under JSI's fixed arity, so the native boundary takes
// a fully-populated object. The public API (src/index.tsx) keeps these optional and
// fills defaults before crossing into native.
export type ConvertNativeOptions = {
  stripExif: boolean;
  stripGps: boolean;
  // JPEG encode quality for HEIC/HEIF → JPEG conversions, as an integer 0–100.
  // Non-optional: the public API (src/index.tsx) always fills a default before
  // crossing the boundary, so native never has to guess. Ignored for JPEG/PNG
  // pass-through inputs, which are not re-encoded.
  quality: number;
  // Optional GPS injection: when both are present, the converted JPEG's GPS
  // EXIF is written from these values (overriding stripGps for the GPS block).
  // Optional (not defaulted) because absence — not a sentinel — means "do not inject".
  gpsLatitude?: number;
  gpsLongitude?: number;
};

export interface Spec extends TurboModule {
  convertImageAtPath(
    path: string,
    options: ConvertNativeOptions
  ): Promise<string>;
  convertImageAtPathAsBase64(
    path: string,
    options: ConvertNativeOptions
  ): Promise<string>;
}

export interface ImageConverterInterface {
  convertImageAtPath(
    path: string,
    options: ConvertNativeOptions
  ): Promise<string>;
  convertImageAtPathAsBase64(
    path: string,
    options: ConvertNativeOptions
  ): Promise<string>;
}

// TurboModuleRegistry로 TurboModule 가져오기 (New Architecture)
const TurboModuleInstance =
  // @ts-ignore
  global.__turboModuleProxy != null
    ? TurboModuleRegistry.getEnforcing<Spec>('SimpleHeic2jpg')
    : null;

// NativeModules로 Old Architecture 모듈 가져오기
const OldArchitectureModule = NativeModules.SimpleHeic2jpg
  ? NativeModules.SimpleHeic2jpg
  : (new Proxy(
      {},
      {
        get() {
          throw new Error('SimpleHeic2jpg module is not available');
        },
      }
    ) as ImageConverterInterface);

// 모듈 인스턴스 선택 (TurboModule 우선)
const SimpleHeic2jpg = TurboModuleInstance ?? OldArchitectureModule;

export default SimpleHeic2jpg;
