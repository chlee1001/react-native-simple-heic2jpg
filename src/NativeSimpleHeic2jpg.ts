import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  convertImageAtPath(path: string): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('SimpleHeic2jpg');
