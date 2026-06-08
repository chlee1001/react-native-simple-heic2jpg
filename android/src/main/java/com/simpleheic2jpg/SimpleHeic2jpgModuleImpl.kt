package com.simpleheic2jpg

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.util.Base64
import androidx.exifinterface.media.ExifInterface
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReactApplicationContext
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.UUID

object SimpleHeic2jpgModuleImpl {
  const val NAME = "SimpleHeic2jpg"

  private const val CACHE_DIR = "convert_cache"

  // Error codes surfaced to JS via promise.reject(code, ...). New failure paths only;
  // existing reject behavior for unrelated paths is unchanged.
  private const val ERROR_HEIF_UNSUPPORTED_OS = "E_HEIF_UNSUPPORTED_OS"
  private const val ERROR_HEIF_DECODE_FAILED = "E_HEIF_DECODE_FAILED"
  private const val ERROR_UNSUPPORTED_URI = "E_UNSUPPORTED_URI"

  // EXIF tags copied from the source HEIC onto the converted JPEG. Only string/short/
  // rational ("safe") types are listed: ExifInterface serializes/deserializes these
  // losslessly via getAttribute/setAttribute. UNDEFINED binary tags (e.g. MakerNote)
  // are intentionally excluded because the string round-trip corrupts them.
  //
  // TAG_IMAGE_WIDTH / TAG_IMAGE_LENGTH are intentionally NOT copied: they are derived
  // dimensions, not metadata to preserve, and copying stale source values can mismatch
  // the actual encoded pixels. Note ExifInterface 1.3.7 inserts a default value of 0 for
  // these tags when absent, so the output may carry 0 (or encoder-written dimensions) —
  // the contract here is "do not copy the source's stale dimensions", not "tag absent".
  // internal (not private) so the unit test can assert membership — specifically that
  // TAG_IMAGE_WIDTH/LENGTH stay excluded (see the structural test in CopyExifTest).
  internal val EXIF_TAG_LIST = listOf(
    ExifInterface.TAG_DATETIME,
    ExifInterface.TAG_FLASH,
    ExifInterface.TAG_GPS_ALTITUDE,
    ExifInterface.TAG_GPS_ALTITUDE_REF,
    ExifInterface.TAG_GPS_DATESTAMP,
    ExifInterface.TAG_GPS_LATITUDE,
    ExifInterface.TAG_GPS_LATITUDE_REF,
    ExifInterface.TAG_GPS_LONGITUDE,
    ExifInterface.TAG_GPS_LONGITUDE_REF,
    ExifInterface.TAG_GPS_PROCESSING_METHOD,
    ExifInterface.TAG_GPS_TIMESTAMP,
    ExifInterface.TAG_MAKE,
    ExifInterface.TAG_MODEL,
    ExifInterface.TAG_ORIENTATION,
    ExifInterface.TAG_WHITE_BALANCE,
    ExifInterface.TAG_EXPOSURE_TIME,
    ExifInterface.TAG_FOCAL_LENGTH,
    ExifInterface.TAG_GPS_AREA_INFORMATION,
    ExifInterface.TAG_GPS_DOP,
    ExifInterface.TAG_GPS_MEASURE_MODE,
    ExifInterface.TAG_GPS_SATELLITES,
    ExifInterface.TAG_GPS_SPEED,
    ExifInterface.TAG_GPS_SPEED_REF,
    ExifInterface.TAG_GPS_STATUS,
    ExifInterface.TAG_GPS_TRACK,
    ExifInterface.TAG_GPS_TRACK_REF,
    ExifInterface.TAG_GPS_VERSION_ID,
    ExifInterface.TAG_INTEROPERABILITY_INDEX,
    ExifInterface.TAG_DATETIME_DIGITIZED,
    ExifInterface.TAG_DATETIME_ORIGINAL,
    ExifInterface.TAG_SUBSEC_TIME,
    ExifInterface.TAG_SUBSEC_TIME_DIGITIZED,
    ExifInterface.TAG_SUBSEC_TIME_ORIGINAL,
    ExifInterface.TAG_IMAGE_UNIQUE_ID,
    // Shooting parameters (rational/short).
    ExifInterface.TAG_F_NUMBER,
    ExifInterface.TAG_PHOTOGRAPHIC_SENSITIVITY,
    ExifInterface.TAG_SHUTTER_SPEED_VALUE,
    ExifInterface.TAG_APERTURE_VALUE,
    ExifInterface.TAG_MAX_APERTURE_VALUE,
    ExifInterface.TAG_EXPOSURE_PROGRAM,
    ExifInterface.TAG_METERING_MODE,
    ExifInterface.TAG_EXPOSURE_BIAS_VALUE,
    ExifInterface.TAG_BRIGHTNESS_VALUE,
    ExifInterface.TAG_LIGHT_SOURCE,
    ExifInterface.TAG_COLOR_SPACE,
    ExifInterface.TAG_FOCAL_LENGTH_IN_35MM_FILM,
    ExifInterface.TAG_SCENE_CAPTURE_TYPE,
    ExifInterface.TAG_CONTRAST,
    ExifInterface.TAG_SATURATION,
    ExifInterface.TAG_SHARPNESS,
    ExifInterface.TAG_DIGITAL_ZOOM_RATIO,
    ExifInterface.TAG_EXIF_VERSION,
    // Lens / device / authorship (string).
    ExifInterface.TAG_LENS_MAKE,
    ExifInterface.TAG_LENS_MODEL,
    ExifInterface.TAG_SOFTWARE,
    ExifInterface.TAG_ARTIST,
    ExifInterface.TAG_COPYRIGHT
  )

  private fun getFileExtension(filePath: String): String {
    return filePath.substringAfterLast('.', "").lowercase()
  }

  private fun ensureCacheDir(context: ReactApplicationContext): File {
    val cacheDir = File(context.cacheDir, CACHE_DIR)
    if (!cacheDir.exists() && !cacheDir.mkdirs()) {
      throw IOException("Failed to create image conversion cache directory.")
    }
    if (!cacheDir.isDirectory) {
      throw IOException("Image conversion cache path is not a directory.")
    }
    return cacheDir
  }

  private fun createCacheFile(cacheDir: File): File {
    repeat(3) {
      val cacheFile = File(cacheDir, "${UUID.randomUUID()}.jpg")
      if (cacheFile.createNewFile()) {
        return cacheFile
      }
    }
    throw IOException("Failed to create image conversion cache file.")
  }

  private fun saveBitmapToCache(context: ReactApplicationContext, bitmap: Bitmap): String {
    val cacheFile = createCacheFile(ensureCacheDir(context))
    try {
      FileOutputStream(cacheFile).use { outputStream ->
        if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 100, outputStream)) {
          throw IOException("Failed to encode image as JPEG.")
        }
      }
    } catch (ex: Exception) {
      cacheFile.delete()
      throw ex
    }
    return cacheFile.absolutePath
  }

  private fun isHeicOrHeif(fileExtension: String): Boolean {
    return fileExtension == "heic" || fileExtension == "heif"
  }

  private fun isSupportedBase64Passthrough(fileExtension: String): Boolean {
    return fileExtension == "jpg" || fileExtension == "jpeg" || fileExtension == "png"
  }

  private fun normalizeLocalFilePath(filePath: String): String {
    // content:// resolves through a ContentResolver, not the filesystem; ExifInterface and
    // BitmapFactory.decodeFile both expect a real path, so reject it with an actionable
    // code instead of letting it fail later as an opaque decode error. iOS already rejects
    // non-file schemes (with its existing "Unsupported URI" code) before format handling.
    if (filePath.startsWith("content://")) {
      throw ConversionException(
        ERROR_UNSUPPORTED_URI,
        "content:// URIs are not supported. Resolve to a local file path before calling convertImage."
      )
    }
    return filePath.removePrefix("file://")
  }

  // Carries a stable error code through to promise.reject so JS can branch on error.code.
  private class ConversionException(val code: String, message: String) : Exception(message)

  // Copies whitelisted EXIF tags from srcPath onto dstPath.
  // stripGps: drop GPS tags only. stripExif: drop everything except orientation
  // (orientation must survive because BitmapFactory does not rotate pixels — the tag
  // is the only thing keeping the image upright). P0 callers pass false/false; the
  // strip branches are wired up here so P1 only has to thread the options through.
  //
  // Orientation policy: tag preserved, pixels NOT rotated. BitmapFactory.decodeFile
  // returns raw, unrotated pixels, so copying TAG_ORIENTATION leaves the consumer to
  // apply the rotation. This matches iOS (CIImage pixels stay unrotated, the property
  // is copied). Warning: if this decode is ever swapped to ImageDecoder — which DOES
  // bake orientation into the pixels — copying TAG_ORIENTATION would double-rotate;
  // drop the tag in that case.
  // internal (not private) so the JVM unit test in the same module can exercise the
  // whitelist/strip logic directly, without going through the HEIF decode path.
  internal fun copyExif(
    srcPath: String,
    dstPath: String,
    stripExif: Boolean = false,
    stripGps: Boolean = false
  ) {
    val source = ExifInterface(srcPath)
    val destination = ExifInterface(dstPath)
    for (tagName in EXIF_TAG_LIST) {
      if (stripExif && tagName != ExifInterface.TAG_ORIENTATION) {
        continue
      }
      // Every GPS IFD tag name starts with "GPS" per the EXIF spec, so the prefix
      // check covers the full GPS set without enumerating it.
      if (stripGps && tagName.startsWith("GPS")) {
        continue
      }
      val attribute = source.getAttribute(tagName) ?: continue
      destination.setAttribute(tagName, attribute)
    }
    destination.saveAttributes()
  }

  // Reads a boolean option defensively: the JS wrapper always sends a fully-populated
  // object, but a direct native caller might omit a key.
  private fun ReadableMap?.optionFlag(key: String): Boolean =
    this != null && this.hasKey(key) && !this.isNull(key) && this.getBoolean(key)

  private fun convertHeicToCache(
    context: ReactApplicationContext,
    correctedFilePath: String,
    stripExif: Boolean,
    stripGps: Boolean
  ): String {
    // HEIF decoding via BitmapFactory is only available on Android P (API 28)+. On older
    // devices decodeFile returns null with no codec; guard explicitly so the caller gets
    // an actionable error instead of an ambiguous "Bitmap is null".
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
      throw ConversionException(
        ERROR_HEIF_UNSUPPORTED_OS,
        "HEIC/HEIF decoding requires Android 9 (API 28) or higher. " +
          "Current device API level is ${Build.VERSION.SDK_INT}."
      )
    }

    val options = BitmapFactory.Options()
    options.inPreferredConfig = Bitmap.Config.ARGB_8888
    val bitmap = BitmapFactory.decodeFile(correctedFilePath, options)
      ?: throw ConversionException(
        ERROR_HEIF_DECODE_FAILED,
        "Failed to decode image. The file may be corrupt or not a valid HEIC/HEIF."
      )

    var cachePath: String? = null
    try {
      cachePath = saveBitmapToCache(context, bitmap)
      copyExif(correctedFilePath, cachePath, stripExif, stripGps)
      return cachePath
    } catch (ex: Exception) {
      if (cachePath != null) {
        File(cachePath).delete()
      }
      throw ex
    } finally {
      bitmap.recycle()
    }
  }

  private fun encodeFileAsBase64(file: File): String {
    return Base64.encodeToString(file.readBytes(), Base64.NO_WRAP)
  }

  private fun rejectWithCode(promise: Promise, ex: Exception) {
    if (ex is ConversionException) {
      promise.reject(ex.code, ex.message, ex)
    } else {
      promise.reject(ex)
    }
  }

  fun convertImageAtPath(
    context: ReactApplicationContext,
    filePath: String,
    options: ReadableMap?,
    promise: Promise
  ) {
    try {
      // Normalize first so content:// is rejected for every format, mirroring iOS which
      // rejects non-file schemes before format detection.
      val correctedFilePath = normalizeLocalFilePath(filePath)
      val fileExtension = getFileExtension(filePath)

      if (isHeicOrHeif(fileExtension)) {
        promise.resolve(
          convertHeicToCache(
            context,
            correctedFilePath,
            options.optionFlag("stripExif"),
            options.optionFlag("stripGps")
          )
        )
      } else {
        // JPEG/PNG inputs pass through unmodified, so strip options do not apply here.
        promise.resolve(filePath)
      }
    } catch (ex: Exception) {
      rejectWithCode(promise, ex)
    }
  }

  fun convertImageAtPathAsBase64(
    context: ReactApplicationContext,
    filePath: String,
    options: ReadableMap?,
    promise: Promise
  ) {
    var generatedCachePath: String? = null
    try {
      // Normalize first (rejects content:// before format handling), mirroring convertImageAtPath.
      val correctedFilePath = normalizeLocalFilePath(filePath)
      val fileExtension = getFileExtension(filePath)

      if (isHeicOrHeif(fileExtension)) {
        generatedCachePath = convertHeicToCache(
          context,
          correctedFilePath,
          options.optionFlag("stripExif"),
          options.optionFlag("stripGps")
        )
        promise.resolve(encodeFileAsBase64(File(generatedCachePath)))
      } else if (isSupportedBase64Passthrough(fileExtension)) {
        promise.resolve(encodeFileAsBase64(File(correctedFilePath)))
      } else {
        promise.reject(Exception("Unsupported image format for base64 conversion."))
      }
    } catch (ex: Exception) {
      rejectWithCode(promise, ex)
    } finally {
      if (generatedCachePath != null) {
        File(generatedCachePath).delete()
      }
    }
  }

}
