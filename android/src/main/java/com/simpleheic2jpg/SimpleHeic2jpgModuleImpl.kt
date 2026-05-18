package com.simpleheic2jpg

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.exifinterface.media.ExifInterface
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.UUID

object SimpleHeic2jpgModuleImpl {
  const val NAME = "SimpleHeic2jpg"

  private const val CACHE_DIR = "convert_cache"

  private val EXIF_TAG_LIST = listOf(
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
    ExifInterface.TAG_IMAGE_LENGTH,
    ExifInterface.TAG_IMAGE_WIDTH,
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
    ExifInterface.TAG_IMAGE_UNIQUE_ID
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
    return filePath.removePrefix("file://")
  }

  private fun convertHeicToCache(context: ReactApplicationContext, correctedFilePath: String): String {
    val options = BitmapFactory.Options()
    options.inPreferredConfig = Bitmap.Config.ARGB_8888
    val bitmap = BitmapFactory.decodeFile(correctedFilePath, options)
    if (bitmap != null) {
      var cachePath: String? = null
      try {
        cachePath = saveBitmapToCache(context, bitmap)
        val exif = ExifInterface(correctedFilePath)
        val newExif = ExifInterface(cachePath)
        for (tagName in EXIF_TAG_LIST) {
          val attribute = exif.getAttribute(tagName)
          if (attribute != null) {
            newExif.setAttribute(tagName, attribute)
          }
        }
        newExif.saveAttributes()
        return cachePath
      } catch (ex: Exception) {
        if (cachePath != null) {
          File(cachePath).delete()
        }
        throw ex
      } finally {
        bitmap.recycle()
      }
    } else {
      throw Exception("Failed to convert image. Bitmap is null.")
    }
  }

  private fun encodeFileAsBase64(file: File): String {
    return Base64.encodeToString(file.readBytes(), Base64.NO_WRAP)
  }

  fun convertImageAtPath(context: ReactApplicationContext, filePath: String, promise: Promise) {
    try {
      val fileExtension = getFileExtension(filePath)

      if (isHeicOrHeif(fileExtension)) {
        val correctedFilePath = normalizeLocalFilePath(filePath)
        promise.resolve(convertHeicToCache(context, correctedFilePath))
      } else {
        promise.resolve(filePath)
      }
    } catch (ex: Exception) {
      promise.reject(ex)
    }
  }

  fun convertImageAtPathAsBase64(context: ReactApplicationContext, filePath: String, promise: Promise) {
    var generatedCachePath: String? = null
    try {
      val fileExtension = getFileExtension(filePath)
      val correctedFilePath = normalizeLocalFilePath(filePath)

      if (isHeicOrHeif(fileExtension)) {
        generatedCachePath = convertHeicToCache(context, correctedFilePath)
        promise.resolve(encodeFileAsBase64(File(generatedCachePath)))
      } else if (isSupportedBase64Passthrough(fileExtension)) {
        promise.resolve(encodeFileAsBase64(File(correctedFilePath)))
      } else {
        promise.reject(Exception("Unsupported image format for base64 conversion."))
      }
    } catch (ex: Exception) {
      promise.reject(ex)
    } finally {
      if (generatedCachePath != null) {
        File(generatedCachePath).delete()
      }
    }
  }

}
