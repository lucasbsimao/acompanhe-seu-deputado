package com.acompanheseudeputado

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import mobile.Mobile

class LocalApiModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "LocalApi"

  @ReactMethod
  fun getBaseUrl(promise: Promise) {
    val addr = Mobile.addr()
    if (addr != null && addr.isNotEmpty()) {
      promise.resolve("http://$addr")
    } else {
      promise.reject("NO_ADDR", "Local API address not ready yet")
    }
  }
}
