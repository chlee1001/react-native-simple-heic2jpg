package com.simpleheic2jpg;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import androidx.annotation.NonNull;

import android.util.Log;
import androidx.exifinterface.media.ExifInterface;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;

@ReactModule(name = SimpleHeic2jpgModule.NAME)
public class SimpleHeic2jpgModule extends ReactContextBaseJavaModule {

  public static final String NAME = "SimpleHeic2jpg";

  public SimpleHeic2jpgModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  @NonNull
  public String getName() {
    return NAME;
  }

  private static final String TAG = "ImageConverter";
  private static final String CACHE_DIR = "convert_cache";

  public static final List<String> EXIF_TAG_LIST = Arrays.asList(
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
  );

  @ReactMethod
  public void convertImageAtPath(String filePath, Promise promise) {
    try {
      String fileExtension = getFileExtension(filePath);
      Log.i(TAG, "convertImageAtPath: " + filePath);
      Log.i(TAG, "convertImageAtPath: fileExtension: " + fileExtension);

      if (fileExtension.equals("heic") || fileExtension.equals("heif")) {
        String correctedFilePath = filePath.replace("file://", "");

        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap bitmap = BitmapFactory.decodeFile(correctedFilePath, options);

        if (bitmap != null) {
          ByteArrayOutputStream stream = new ByteArrayOutputStream();
          bitmap.compress(Bitmap.CompressFormat.JPEG, 100, stream);
          byte[] byteArray = stream.toByteArray();

          String cachePath = saveCacheFile(byteArray);

          ExifInterface exif = new ExifInterface(correctedFilePath);
          ExifInterface newExif = new ExifInterface(cachePath);
          for (String tagName : EXIF_TAG_LIST) {
            String attribute = exif.getAttribute(tagName);
            if (attribute != null) {
              newExif.setAttribute(tagName, attribute);
            }
          }
          newExif.saveAttributes();

          promise.resolve(cachePath);
        } else {
          promise.reject(new Exception("Failed to convert image. Bitmap is null."));
        }
      } else {
        promise.resolve(filePath);
      }
    } catch (Exception ex) {
      promise.reject(ex);
    }
  }

  private String getFileExtension(String filePath) {
    return filePath.substring(filePath.lastIndexOf(".") + 1).toLowerCase();
  }


  private String saveCacheFile(byte[] data) throws IOException {
    File cacheDir = new File(getReactApplicationContext().getCacheDir(), CACHE_DIR);
    if (!cacheDir.exists()) {
      cacheDir.mkdir();
    }
    String fileName = System.currentTimeMillis() + ".jpg";
    File cacheFile = new File(cacheDir, fileName);
    FileOutputStream fos = new FileOutputStream(cacheFile);
    fos.write(data);
    fos.flush();
    fos.close();
    return cacheFile.getAbsolutePath();
  }
}
