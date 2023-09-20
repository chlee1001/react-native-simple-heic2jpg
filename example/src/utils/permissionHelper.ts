import {
  checkMultiple,
  requestMultiple,
  openSettings,
  PERMISSIONS,
  RESULTS,
  type Permission,
  type PermissionStatus,
} from 'react-native-permissions';
import { isAndroid, isIOS } from '../constants/common';
import { Alert, Platform } from 'react-native';
import { MESSAGE } from '../constants/message';

export const CAMERA_PERMISSION_LIST = (type: 'CAMERA' | 'LIBRARY') => {
  if (type === 'CAMERA') {
    if (isIOS) {
      return [PERMISSIONS.IOS.CAMERA];
    }
    return [PERMISSIONS.ANDROID.CAMERA];
  }

  if (type === 'LIBRARY') {
    if (isIOS) {
      return [PERMISSIONS.IOS.PHOTO_LIBRARY];
    }

    if ((Platform.Version as number) >= 33) {
      // 안드로이드 13 이상
      return [
        PERMISSIONS.ANDROID.READ_MEDIA_IMAGES,
        PERMISSIONS.ANDROID.ACCESS_MEDIA_LOCATION,
      ];
    }
    if ((Platform.Version as number) >= 29) {
      // 안드로이드 10
      return [
        PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE,
        PERMISSIONS.ANDROID.ACCESS_MEDIA_LOCATION,
      ];
    }
    return [
      PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE,
      PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE,
    ];
  }

  return [];
};

function permissionResult(
  permissions: Record<Permission, PermissionStatus>,
  permissionList: Permission[]
) {
  const results = permissionList.map((permission) => {
    return permissions[permission] === RESULTS.GRANTED;
  });
  return results.filter((value) => !value).length === 0;
}

export async function requestPermission(permissionList: Permission[]) {
  const permissions = await requestMultiple(permissionList);
  return permissionResult(permissions, permissionList);
}

export async function checkPermission(permissionList: Permission[]) {
  const permissions = await checkMultiple(permissionList);
  return permissionResult(permissions, permissionList);
}

export async function iOSCameraRequestPermission(permissionList: Permission[]) {
  const permissions = await requestMultiple(permissionList);
  const results = permissionList.map(
    (permission) =>
      permissions[permission] === RESULTS.GRANTED ||
      permissions[permission] === RESULTS.LIMITED
  );
  return results.filter((value) => !value).length === 0;
}

export async function iOSCameraCheckPermission(permissionList: Permission[]) {
  const permissions = await checkMultiple(permissionList);
  const results = permissionList.map(
    (permission) =>
      permissions[permission] === RESULTS.GRANTED ||
      permissions[permission] === RESULTS.LIMITED
  );
  return results.filter((value) => !value).length === 0;
}

export async function checkAndRequestCameraLibraryPermission(
  type: 'CAMERA' | 'LIBRARY'
) {
  const requestPermissionList = CAMERA_PERMISSION_LIST(type);

  if (isIOS) {
    const checkResult = await iOSCameraCheckPermission(requestPermissionList);
    if (checkResult) {
      return true;
    }
    const requestResult = await iOSCameraRequestPermission(
      requestPermissionList
    );
    if (requestResult) {
      return true;
    }
  }

  if (isAndroid) {
    const checkResult = await checkPermission(requestPermissionList);
    if (checkResult) {
      return true;
    }

    const requestResult = await requestPermission(requestPermissionList);
    if (requestResult) {
      return true;
    }
  }

  Alert.alert(
    '알림',
    type === 'CAMERA'
      ? MESSAGE.REQUEST_CAMERA_PERMISSIONS
      : MESSAGE.REQUEST_LIBRARY_PERMISSIONS,
    [
      {
        text: '설정',
        onPress: async () => {
          await openSettings();
        },
        style: 'default',
      },
    ],
    { cancelable: false }
  );
  return false;
}
