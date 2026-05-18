package com.simpleheic2jpg

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule


@ReactModule(name = SimpleHeic2jpgModuleImpl.NAME)
class SimpleHeic2jpgModule(reactContext: ReactApplicationContext?) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = SimpleHeic2jpgModuleImpl.NAME

  @ReactMethod
  fun convertImageAtPath(path: String, promise: Promise) {
    SimpleHeic2jpgModuleImpl.convertImageAtPath(reactApplicationContext, path, promise)
  }

  @ReactMethod
  fun convertImageAtPathAsBase64(path: String, promise: Promise) {
    SimpleHeic2jpgModuleImpl.convertImageAtPathAsBase64(reactApplicationContext, path, promise)
  }
}

