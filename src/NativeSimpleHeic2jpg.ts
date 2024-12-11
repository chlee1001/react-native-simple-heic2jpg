import type { TurboModule } from 'react-native';
import { TurboModuleRegistry, NativeModules } from 'react-native';

export interface Spec extends TurboModule {
  convertImageAtPath(path: string): Promise<string>;
}

export interface ImageConverterInterface {
  convertImageAtPath(path: string): Promise<string>;
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
