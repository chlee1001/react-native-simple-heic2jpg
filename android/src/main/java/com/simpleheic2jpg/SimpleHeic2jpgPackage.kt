package com.simpleheic2jpg

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class SimpleHeic2jpgPackage : TurboReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return when (name) {
      SimpleHeic2jpgModuleImpl.NAME -> SimpleHeic2jpgModule(reactContext)
      else -> null
    }
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
    return ReactModuleInfoProvider {
      val moduleInfos: MutableMap<String, ReactModuleInfo> = HashMap()
      val isTurboModule = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED

      val moduleInfo = ReactModuleInfo(
        SimpleHeic2jpgModuleImpl.NAME,
        SimpleHeic2jpgModuleImpl.NAME,
        false,
        false,
        true,
        false,
        isTurboModule,
      )

      moduleInfos[SimpleHeic2jpgModuleImpl.NAME] = moduleInfo
      moduleInfos
    }
  }
}
