package com.simpleheic2jpg

import androidx.exifinterface.media.ExifInterface
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/**
 * Exercises the extracted [SimpleHeic2jpgModuleImpl.copyExif] whitelist/strip logic
 * directly, bypassing the HEIF decode path (which depends on native Skia and is only
 * meaningful on a device/emulator). The source EXIF is stamped with the same
 * androidx ExifInterface the production code reads, so the round-trip is self-consistent.
 */
// copyExif is SDK-independent (pure ExifInterface file I/O); pin to Robolectric's max
// supported SDK so the example app's targetSdk 36 does not break runner configuration.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class CopyExifTest {

  private lateinit var tempDir: File

  @Before
  fun setUp() {
    tempDir = File(System.getProperty("java.io.tmpdir"), "copyexif-${System.nanoTime()}").apply {
      mkdirs()
    }
  }

  private fun blankJpegCopy(name: String): File {
    val out = File(tempDir, name)
    javaClass.classLoader!!.getResourceAsStream("blank.jpg")!!.use { input ->
      out.outputStream().use { input.copyTo(it) }
    }
    return out
  }

  private fun makeSourceWithExif(): File {
    val src = blankJpegCopy("src.jpg")
    val exif = ExifInterface(src.absolutePath)
    exif.setAttribute(ExifInterface.TAG_MAKE, "TestMake")
    exif.setAttribute(ExifInterface.TAG_MODEL, "TestModel")
    // TAG_SOFTWARE is one of the tags added to the whitelist in P0; an IFD0 string,
    // so it round-trips reliably and proves the expanded whitelist is honored.
    exif.setAttribute(ExifInterface.TAG_SOFTWARE, "UnitTestSoftware")
    exif.setAttribute(
      ExifInterface.TAG_ORIENTATION,
      ExifInterface.ORIENTATION_ROTATE_90.toString()
    )
    exif.setLatLong(37.5, 127.0)
    exif.saveAttributes()
    return src
  }

  @Test
  fun copiesWhitelistedTagsWhenNotStripping() {
    val src = makeSourceWithExif()
    val dst = blankJpegCopy("dst.jpg")

    SimpleHeic2jpgModuleImpl.copyExif(src.absolutePath, dst.absolutePath)

    val out = ExifInterface(dst.absolutePath)
    assertEquals("TestMake", out.getAttribute(ExifInterface.TAG_MAKE))
    assertEquals("TestModel", out.getAttribute(ExifInterface.TAG_MODEL))
    assertEquals("Software is in the expanded whitelist", "UnitTestSoftware", out.getAttribute(ExifInterface.TAG_SOFTWARE))
    assertNotNull("GPS preserved by default", out.getAttribute(ExifInterface.TAG_GPS_LATITUDE))
    assertEquals(
      ExifInterface.ORIENTATION_ROTATE_90,
      out.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
    )
  }

  @Test
  fun stripGpsRemovesGpsButKeepsOtherExif() {
    val src = makeSourceWithExif()
    val dst = blankJpegCopy("dst.jpg")

    SimpleHeic2jpgModuleImpl.copyExif(src.absolutePath, dst.absolutePath, stripExif = false, stripGps = true)

    val out = ExifInterface(dst.absolutePath)
    assertNull("GPS latitude must be stripped", out.getAttribute(ExifInterface.TAG_GPS_LATITUDE))
    assertNull("GPS longitude must be stripped", out.getAttribute(ExifInterface.TAG_GPS_LONGITUDE))
    assertEquals("non-GPS EXIF kept", "TestMake", out.getAttribute(ExifInterface.TAG_MAKE))
    assertEquals(
      ExifInterface.ORIENTATION_ROTATE_90,
      out.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
    )
  }

  /**
   * Locks the rev5 contract that the source's image dimensions are never copied.
   *
   * This is a structural assertion on the whitelist rather than a behavioral one because
   * ExifInterface 1.3.7 derives TAG_IMAGE_WIDTH/LENGTH from the JPEG's SOF marker on read and
   * ignores any setAttribute for them (a probe confirmed a source stamped 9999 reads back as the
   * real pixel size). A copied dimension tag is therefore unobservable through getAttribute, so the
   * only reliable regression guard against someone re-adding these tags is the whitelist itself.
   */
  @Test
  fun whitelistExcludesSourceImageDimensions() {
    assertFalse(
      "TAG_IMAGE_WIDTH must not be copied (stale source dimension)",
      SimpleHeic2jpgModuleImpl.EXIF_TAG_LIST.contains(ExifInterface.TAG_IMAGE_WIDTH)
    )
    assertFalse(
      "TAG_IMAGE_LENGTH must not be copied (stale source dimension)",
      SimpleHeic2jpgModuleImpl.EXIF_TAG_LIST.contains(ExifInterface.TAG_IMAGE_LENGTH)
    )
  }

  @Test
  fun stripExifKeepsOnlyOrientation() {
    val src = makeSourceWithExif()
    val dst = blankJpegCopy("dst.jpg")

    SimpleHeic2jpgModuleImpl.copyExif(src.absolutePath, dst.absolutePath, stripExif = true, stripGps = false)

    val out = ExifInterface(dst.absolutePath)
    assertNull("Make removed by stripExif", out.getAttribute(ExifInterface.TAG_MAKE))
    assertNull("Software removed by stripExif", out.getAttribute(ExifInterface.TAG_SOFTWARE))
    assertNull("GPS removed by stripExif", out.getAttribute(ExifInterface.TAG_GPS_LATITUDE))
    assertEquals(
      "orientation is the one tag kept",
      ExifInterface.ORIENTATION_ROTATE_90,
      out.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
    )
  }
}
