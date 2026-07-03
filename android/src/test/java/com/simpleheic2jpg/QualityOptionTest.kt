package com.simpleheic2jpg

import com.facebook.react.bridge.ReadableMap
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Covers the native side of the quality option: the double→int marshalling, the 0–100 clamp,
 * the rounding (not truncation) of fractional values, and the 80 fallback for direct native
 * callers that omit the key. The JS wrapper normalizes quality before it ever reaches native,
 * so these paths only fire for direct-native callers — but they are the native contract, so
 * they are pinned here rather than left to the JS-layer tests.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class QualityOptionTest {

  private fun mapWithQuality(value: Double): ReadableMap {
    val map = Mockito.mock(ReadableMap::class.java)
    Mockito.`when`(map.hasKey("quality")).thenReturn(true)
    Mockito.`when`(map.isNull("quality")).thenReturn(false)
    Mockito.`when`(map.getDouble("quality")).thenReturn(value)
    return map
  }

  // optionQuality is an internal member extension on the object, so it must be invoked
  // inside the object's scope.
  private fun ReadableMap?.quality(): Int =
    SimpleHeic2jpgModuleImpl.run { this@quality.optionQuality() }

  @Test
  fun defaultsTo80WhenMapIsNull() {
    assertEquals(80, (null as ReadableMap?).quality())
  }

  @Test
  fun defaultsTo80WhenKeyAbsent() {
    val map = Mockito.mock(ReadableMap::class.java)
    Mockito.`when`(map.hasKey("quality")).thenReturn(false)
    assertEquals(80, map.quality())
  }

  @Test
  fun forwardsAnIntegralValue() {
    assertEquals(60, mapWithQuality(60.0).quality())
  }

  @Test
  fun clampsAbove100() {
    assertEquals(100, mapWithQuality(150.0).quality())
  }

  @Test
  fun clampsBelow0() {
    assertEquals(0, mapWithQuality(-10.0).quality())
  }

  @Test
  fun roundsFractionalValue() {
    assertEquals(73, mapWithQuality(72.6).quality())
  }
}
