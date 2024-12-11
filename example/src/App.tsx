import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { convertImage } from 'react-native-simple-heic2jpg';
import { checkAndRequestCameraLibraryPermission } from './utils/permissionHelper';
import MultipleImagePicker from '@baronha/react-native-multiple-image-picker';
import { isAndroid } from './constants/common';
import { getImageExif } from './utils/imageHelper';

export default function App() {
  const handleImageLibrary = async () => {
    const libraryPermission =
      await checkAndRequestCameraLibraryPermission('LIBRARY');
    if (!libraryPermission) return;

    try {
      const pickedImages = await MultipleImagePicker.openPicker({});

      console.log('pickedImages: ', pickedImages);

      // 이미지 업로드
      const convertedImages = await Promise.all(
        pickedImages.map(async (image, index) => {
          const tags = await getImageExif({ imagePath: image.path });
          console.log(`${index + 1}_tags: `, tags);
          const convertedImagePath = await convertImage(
            isAndroid ? image?.realPath || image.path : image.path
          );
          return { ...image, path: convertedImagePath };
        })
      );

      for (const image of convertedImages) {
        const index = convertedImages.indexOf(image);
        const tags = await getImageExif({ imagePath: image.path });
        console.log(`converted_${index + 1}_tags: `, tags);
      }
    } catch (e: any) {
      console.log('handleImageLibrary: ', e);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          {
            backgroundColor: 'lightblue',
            paddingHorizontal: 12,
            paddingVertical: 24,
            margin: 12,
            borderRadius: 12,
            width: '80%',
            alignItems: 'center',
          },
        ]}
        onPress={handleImageLibrary}
      >
        <Text
          style={{
            fontSize: 20,
            fontWeight: '600',
          }}
        >
          launchImageLibrary
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    width: 60,
    height: 60,
    marginVertical: 20,
  },
});
