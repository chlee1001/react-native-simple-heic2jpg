package com.simpleheic2jpg

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Verifies the new Android error contract: a content:// URI is rejected with the stable code
 * E_UNSUPPORTED_URI on both conversion entry points, before any decode.
 *
 * The rejection happens in normalizeLocalFilePath, which runs before the ReactApplicationContext is
 * ever dereferenced, so a Mockito mock context is sufficient (and necessary — ReactApplicationContext
 * is abstract in RN 0.85 and cannot be instantiated directly).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class ContentUriRejectTest {

  // Minimal Promise double capturing the rejection code/message. Implements every abstract reject
  // overload of RN 0.85's Promise; production rejects via reject(code, message, throwable).
  private class CapturingPromise : Promise {
    var resolved: Any? = null
    var code: String? = null
    var message: String? = null
    // Counts how many times the promise was settled, so a double-settle regression is caught.
    var settleCount = 0
    override fun resolve(value: Any?) { settleCount++; resolved = value }
    override fun reject(code: String?, message: String?) { settleCount++; this.code = code; this.message = message }
    override fun reject(code: String?, throwable: Throwable?) { settleCount++; this.code = code; this.message = throwable?.message }
    override fun reject(code: String?, message: String?, throwable: Throwable?) { settleCount++; this.code = code; this.message = message }
    override fun reject(code: String?, userInfo: WritableMap) { settleCount++; this.code = code }
    override fun reject(code: String?, throwable: Throwable?, userInfo: WritableMap) { settleCount++; this.code = code }
    override fun reject(code: String?, message: String?, userInfo: WritableMap) { settleCount++; this.code = code; this.message = message }
    override fun reject(code: String?, message: String?, throwable: Throwable?, userInfo: WritableMap?) { settleCount++; this.code = code; this.message = message }
    override fun reject(throwable: Throwable) { settleCount++; this.code = "EUNSPECIFIED"; this.message = throwable.message }
    override fun reject(throwable: Throwable, userInfo: WritableMap) { settleCount++; this.code = "EUNSPECIFIED"; this.message = throwable.message }
    override fun reject(message: String) { settleCount++; this.code = "EUNSPECIFIED"; this.message = message }
  }

  private val context: ReactApplicationContext = Mockito.mock(ReactApplicationContext::class.java)
  private val contentUri = "content://media/external/images/media/1.heic"

  @Test
  fun convertImageAtPathRejectsContentUri() {
    val promise = CapturingPromise()
    SimpleHeic2jpgModuleImpl.convertImageAtPath(context, contentUri, null, promise)

    assertEquals("E_UNSUPPORTED_URI", promise.code)
    assertNull("must reject, not resolve", promise.resolved)
    assertEquals("promise settled exactly once", 1, promise.settleCount)
  }

  @Test
  fun convertImageAtPathAsBase64RejectsContentUri() {
    val promise = CapturingPromise()
    SimpleHeic2jpgModuleImpl.convertImageAtPathAsBase64(context, contentUri, null, promise)

    assertEquals("E_UNSUPPORTED_URI", promise.code)
    assertNull("must reject, not resolve", promise.resolved)
    assertEquals("promise settled exactly once", 1, promise.settleCount)
  }
}
