import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  convertImage,
  type ConvertImageOptions,
} from 'react-native-simple-heic2jpg';
import {
  launchCamera,
  launchImageLibrary,
  type Asset,
  type CameraOptions,
  type ImageLibraryOptions,
  type ImagePickerResponse,
} from 'react-native-image-picker';
import * as RNFS from '@dr.pogodin/react-native-fs';
import { isAndroid } from './constants/common';
import { getImageExif } from './utils/imageHelper';
import { checkAndRequestCameraLibraryPermission } from './utils/permissionHelper';

const imageLibraryOptions: ImageLibraryOptions = {
  mediaType: 'photo',
  quality: 1,
  includeBase64: false,
  includeExtra: false,
  presentationStyle: 'fullScreen',
  selectionLimit: 3,
  assetRepresentationMode: 'current',
};

const cameraOptions: CameraOptions = {
  mediaType: 'photo',
  quality: 1,
  includeBase64: false,
  includeExtra: false,
  presentationStyle: 'fullScreen',
  assetRepresentationMode: 'current',
  cameraType: 'back',
  saveToPhotos: false,
};

type PickerSource = 'library' | 'camera';

type PickedImageResult = {
  id: string;
  sourceLabel: string;
  sourceUri?: string;
  convertedUri?: string;
  sourceExifRows: ExifRow[];
  convertedExifRows: ExifRow[];
  fileName?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  errorMessage?: string;
};

type ExifRow = {
  label: string;
  priorityKey: string;
  value: string;
};

const sourceLabels: Record<PickerSource, string> = {
  library: '사진첩',
  camera: '카메라',
};

const exifDisplayLabels: Record<string, string> = {
  artist: '작성자',
  datetime: '수정일시',
  datetimeoriginal: '촬영일시',
  datetimedigitized: '디지털화 일시',
  exposuretime: '노출시간',
  fnumber: '조리개',
  focallength: '초점거리',
  gpsaltitude: 'GPS 고도',
  gpslatitude: 'GPS 위도',
  gpslatituderef: 'GPS 위도 기준',
  gpslongitude: 'GPS 경도',
  gpslongituderef: 'GPS 경도 기준',
  imageheight: '이미지 높이',
  imagelength: '이미지 높이',
  imagewidth: '이미지 너비',
  isospeedratings: 'ISO',
  lensmake: '렌즈 제조사',
  lensmodel: '렌즈 모델',
  make: '제조사',
  model: '모델',
  orientation: '방향',
  pixelxdimension: '픽셀 너비',
  pixelydimension: '픽셀 높이',
  software: '소프트웨어',
  whitebalance: '화이트밸런스',
};

// GPS first: it is the primary thing this QA screen verifies, and camera JPEGs carry
// enough EXIF that trailing keys would be cut by the 16-row display limit.
const preferredExifKeys = [
  'gpslatitude',
  'gpslongitude',
  'gpsaltitude',
  'make',
  'model',
  'lensmodel',
  'datetimeoriginal',
  'datetime',
  'orientation',
  'imagewidth',
  'imagelength',
  'pixelxdimension',
  'pixelydimension',
  'exposuretime',
  'fnumber',
  'isospeedratings',
  'focallength',
  'whitebalance',
];

const debugLog = (...args: unknown[]) => {
  if (__DEV__) {
    console.log(...args);
  }
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const normalizeExifKey = (key: string) =>
  key.replace(/[^a-z0-9]/gi, '').toLowerCase();

const formatExifKey = (key: string) => {
  const normalizedKey = normalizeExifKey(key);
  if (exifDisplayLabels[normalizedKey]) {
    return exifDisplayLabels[normalizedKey];
  }
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
};

const stringifyExifValue = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(String).join(', ');
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return null;
};

const getExifTagValue = (value: unknown) => {
  if (!isRecord(value)) {
    return stringifyExifValue(value);
  }

  return (
    stringifyExifValue(value.description) ??
    stringifyExifValue(value.value) ??
    stringifyExifValue(value.values)
  );
};

const collectExifRows = (
  tags: unknown,
  rows: ExifRow[] = [],
  parentKey = ''
): ExifRow[] => {
  if (!isRecord(tags)) {
    return rows;
  }

  for (const [key, value] of Object.entries(tags)) {
    if (key === 'base64' || key === 'thumbnail') {
      continue;
    }

    const tagValue = getExifTagValue(value);
    if (tagValue) {
      rows.push({
        label: formatExifKey(key),
        priorityKey: normalizeExifKey(key),
        value: tagValue,
      });
      continue;
    }

    collectExifRows(value, rows, parentKey ? `${parentKey}.${key}` : key);
  }

  return rows;
};

// No row cap here: this is a QA screen, so every tag must be inspectable. The
// section component collapses long lists behind a "더보기" toggle instead.
const sortExifRows = (rows: ExifRow[]) => {
  const uniqueRows = rows.filter(
    (row, index, self) =>
      self.findIndex(
        (candidate) =>
          candidate.label === row.label && candidate.value === row.value
      ) === index
  );

  const scoreRow = (row: ExifRow) => {
    const preferredIndex = preferredExifKeys.indexOf(row.priorityKey);
    return preferredIndex === -1 ? preferredExifKeys.length : preferredIndex;
  };

  return uniqueRows.sort((a, b) => scoreRow(a) - scoreRow(b));
};

const logSelectedAsset = (
  asset: Asset,
  index: number,
  source: PickerSource
) => {
  const assetNumber = index + 1;

  debugLog(`${source}_selected_${assetNumber}_asset: `, {
    uri: asset.uri,
    originalPath: isAndroid ? asset.originalPath : undefined,
    type: asset.type,
    fileName: asset.fileName,
    fileSize: asset.fileSize,
    width: asset.width,
    height: asset.height,
  });
};

const readAndLogExif = async (
  label: string,
  imagePath: string
): Promise<ExifRow[]> => {
  if (!__DEV__) {
    const tags = await getImageExif({ imagePath });
    return sortExifRows(collectExifRows(tags));
  }

  try {
    const tags = await getImageExif({ imagePath });
    debugLog(`${label}_tags: `, tags);
    return sortExifRows(collectExifRows(tags));
  } catch (error) {
    debugLog(`${label}_tags_error: `, error);
    return [];
  }
};

const createResult = (
  asset: Asset,
  index: number,
  source: PickerSource,
  fields: Partial<PickedImageResult>
): PickedImageResult => ({
  id: `${source}-${Date.now()}-${index}`,
  sourceLabel: sourceLabels[source],
  sourceUri: asset.uri,
  sourceExifRows: [],
  convertedExifRows: [],
  fileName: asset.fileName,
  mimeType: asset.type,
  width: asset.width,
  height: asset.height,
  ...fields,
});

// Distinct from any test photo's real coordinates (Seoul ~37.56/126.86) so an
// injected override is visibly different in the EXIF panel: Busan City Hall.
const QA_INJECT_COORDS = { latitude: 35.1796, longitude: 129.0756 };

const convertPickedAsset = async (
  asset: Asset,
  index: number,
  source: PickerSource,
  convertOptions: ConvertImageOptions
): Promise<PickedImageResult> => {
  const assetNumber = index + 1;

  logSelectedAsset(asset, index, source);
  let sourceExifRows: ExifRow[] = [];

  if (!asset.uri) {
    debugLog(`${source}_selected_${assetNumber}_missing_uri: `, asset);
    return createResult(asset, index, source, {
      errorMessage: '선택된 이미지 URI가 없어 변환할 수 없습니다.',
    });
  }

  sourceExifRows = await readAndLogExif(`${source}_${assetNumber}`, asset.uri);

  debugLog(`${source}_selected_${assetNumber}_conversion_input: `, {
    uri: asset.uri,
    originalPath: isAndroid ? asset.originalPath : undefined,
    usedPath: asset.uri,
  });

  try {
    const convertedUri = await convertImage(asset.uri, convertOptions);
    debugLog(
      `${source}_selected_${assetNumber}_converted_path: `,
      convertedUri
    );
    const convertedExifRows = await readAndLogExif(
      `${source}_converted_${assetNumber}`,
      convertedUri
    );

    return createResult(asset, index, source, {
      convertedUri,
      convertedExifRows,
      sourceExifRows,
    });
  } catch (error) {
    debugLog(`${source}_selected_${assetNumber}_convertImage_error: `, error);
    return createResult(asset, index, source, {
      errorMessage: getErrorMessage(error),
      sourceExifRows,
    });
  }
};

type PreviewPaneProps = {
  label: string;
  uri?: string;
  placeholder: string;
  isLast?: boolean;
};

function PreviewPane({ label, uri, placeholder, isLast }: PreviewPaneProps) {
  return (
    <View
      style={[styles.previewColumn, isLast ? styles.previewColumnLast : null]}
    >
      <Text style={styles.previewLabel}>{label}</Text>
      {uri ? (
        <Image
          resizeMode="cover"
          source={{ uri }}
          style={styles.previewImage}
        />
      ) : (
        <View style={styles.previewPlaceholder}>
          <Text style={styles.placeholderText}>{placeholder}</Text>
        </View>
      )}
    </View>
  );
}

type ExifSectionProps = {
  title: string;
  rows: ExifRow[];
};

const COLLAPSED_EXIF_ROW_COUNT = 16;

function ExifSection({ title, rows }: ExifSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = rows.length - COLLAPSED_EXIF_ROW_COUNT;
  const visibleRows =
    expanded || hiddenCount <= 0
      ? rows
      : rows.slice(0, COLLAPSED_EXIF_ROW_COUNT);

  return (
    <View style={styles.exifBox}>
      <Text style={styles.exifTitle}>
        {title} ({rows.length})
      </Text>
      {rows.length === 0 ? (
        <Text style={styles.exifEmptyText}>표시할 EXIF 정보가 없습니다.</Text>
      ) : (
        visibleRows.map((row, index) => (
          <View key={`${row.label}-${index}`} style={styles.exifRow}>
            <Text style={styles.exifLabel}>{row.label}</Text>
            <Text style={styles.exifValue}>{row.value}</Text>
          </View>
        ))
      )}
      {hiddenCount > 0 ? (
        <TouchableOpacity
          style={styles.exifMoreButton}
          onPress={() => setExpanded(!expanded)}
        >
          <Text style={styles.exifMoreText}>
            {expanded ? '접기' : `더보기 (${hiddenCount}개 더)`}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

type ImageResultCardProps = {
  result: PickedImageResult;
  index: number;
};

function ImageResultCard({ result, index }: ImageResultCardProps) {
  return (
    <View style={styles.resultCard}>
      <Text style={styles.resultTitle}>
        {result.sourceLabel} 결과 #{index + 1}
      </Text>
      <Text style={styles.metaText}>
        {result.fileName ?? '파일명 없음'} · {result.mimeType ?? '타입 없음'}
      </Text>
      <Text style={styles.metaText}>
        {result.width && result.height
          ? `${result.width} x ${result.height}`
          : '이미지 크기 정보 없음'}
      </Text>

      <View style={styles.previewRow}>
        <PreviewPane
          label="원본"
          uri={result.sourceUri}
          placeholder="URI 없음"
        />
        <PreviewPane
          isLast
          label="변환 결과"
          uri={result.convertedUri}
          placeholder="변환 실패"
        />
      </View>

      {result.convertedUri ? (
        <Text numberOfLines={2} style={styles.uriText}>
          변환 URI: {result.convertedUri}
        </Text>
      ) : null}

      <ExifSection title="원본 EXIF" rows={result.sourceExifRows} />
      <ExifSection title="변환 결과 EXIF" rows={result.convertedExifRows} />

      {result.errorMessage ? (
        <Text style={styles.errorText}>오류: {result.errorMessage}</Text>
      ) : null}
    </View>
  );
}

export default function App() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    '사진첩에서 이미지를 선택하거나 카메라로 촬영해 변환 결과를 확인하세요.'
  );
  const [results, setResults] = useState<PickedImageResult[]>([]);
  const [stripExif, setStripExif] = useState(false);
  const [stripGps, setStripGps] = useState(false);
  const [injectGps, setInjectGps] = useState(false);

  const buildConvertOptions = (): ConvertImageOptions => ({
    stripExif,
    stripGps,
    ...(injectGps ? { gps: QA_INJECT_COORDS } : null),
  });

  const processPickerResponse = async (
    source: PickerSource,
    response: ImagePickerResponse
  ) => {
    const sourceLabel = sourceLabels[source];

    debugLog(`${source}_response: `, {
      didCancel: response.didCancel,
      errorCode: response.errorCode,
      errorMessage: response.errorMessage,
      assets: response.assets?.map((asset) => ({
        type: asset.type,
        fileName: asset.fileName,
        fileSize: asset.fileSize,
        width: asset.width,
        height: asset.height,
      })),
    });

    if (response.didCancel) {
      setStatusMessage(`${sourceLabel} 작업이 취소되었습니다.`);
      return;
    }

    if (response.errorCode) {
      setStatusMessage(
        `${sourceLabel} 오류: ${response.errorMessage ?? response.errorCode}`
      );
      debugLog(`${source}_error: `, {
        errorCode: response.errorCode,
        errorMessage: response.errorMessage,
      });
      return;
    }

    const pickedAssets = response.assets ?? [];

    if (pickedAssets.length === 0) {
      setStatusMessage(`${sourceLabel}에서 선택된 이미지가 없습니다.`);
      return;
    }

    setStatusMessage(
      `${sourceLabel} 이미지 ${pickedAssets.length}개 변환 중...`
    );

    const convertedResults: PickedImageResult[] = [];

    for (const [index, asset] of pickedAssets.entries()) {
      setStatusMessage(
        `${sourceLabel} 이미지 ${index + 1}/${pickedAssets.length} 변환 중...`
      );
      convertedResults.push(
        await convertPickedAsset(asset, index, source, buildConvertOptions())
      );
    }
    const successCount = convertedResults.filter(
      (result) => result.convertedUri
    ).length;

    setResults(convertedResults);
    setStatusMessage(
      `${sourceLabel} 이미지 ${pickedAssets.length}개 중 ${successCount}개 변환 완료`
    );
  };

  const runPicker = async (
    source: PickerSource,
    picker: () => Promise<ImagePickerResponse>
  ) => {
    setIsProcessing(true);
    setResults([]);
    setStatusMessage(`${sourceLabels[source]} 열기 준비 중...`);

    try {
      await processPickerResponse(source, await picker());
    } catch (error) {
      debugLog(`${source}_handler_error: `, error);
      setStatusMessage(
        `${sourceLabels[source]} 처리 오류: ${getErrorMessage(error)}`
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImageLibrary = async () => {
    const libraryPermission =
      isAndroid || (await checkAndRequestCameraLibraryPermission('LIBRARY'));
    if (!libraryPermission) {
      setStatusMessage('사진첩 권한이 필요합니다.');
      return;
    }

    await runPicker('library', () => launchImageLibrary(imageLibraryOptions));
  };

  const handleCamera = async () => {
    const cameraPermission =
      await checkAndRequestCameraLibraryPermission('CAMERA');
    if (!cameraPermission) {
      setStatusMessage('카메라 권한이 필요합니다.');
      return;
    }

    await runPicker('camera', () => launchCamera(cameraOptions));
  };

  // QA-only: convert a file pushed via `adb push` to the app external dir,
  // bypassing the gallery picker so GPS EXIF survives (MediaStore redacts
  // location from picker results unless ACCESS_MEDIA_LOCATION is granted AND
  // the picker calls setRequireOriginal — image-picker does neither).
  const handleQaSampleFile = async () => {
    setIsProcessing(true);
    setResults([]);
    const samplePath = `file://${RNFS.ExternalDirectoryPath}/qa-sample.heic`;
    setStatusMessage(`QA 샘플 변환 중... (${samplePath})`);
    try {
      const exists = await RNFS.exists(
        `${RNFS.ExternalDirectoryPath}/qa-sample.heic`
      );
      if (!exists) {
        setStatusMessage(
          'QA 샘플 파일이 없습니다. adb push 로 qa-sample.heic 를 올려주세요.'
        );
        return;
      }
      const result = await convertPickedAsset(
        { uri: samplePath } as Asset,
        0,
        'library',
        buildConvertOptions()
      );
      setResults([result]);
      setStatusMessage(
        result.convertedUri
          ? 'QA 샘플 변환 완료 — 원본/변환 EXIF를 비교하세요.'
          : `QA 샘플 변환 실패: ${result.errorMessage ?? '알 수 없는 오류'}`
      );
    } catch (error) {
      setStatusMessage(`QA 샘플 처리 오류: ${getErrorMessage(error)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>HEIC 변환 예제</Text>
        <Text style={styles.description}>
          사진첩 선택 또는 카메라 촬영 후 원본과 변환 결과를 화면에서 바로
          확인합니다.
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          disabled={isProcessing}
          style={[styles.button, isProcessing ? styles.buttonDisabled : null]}
          onPress={handleImageLibrary}
        >
          <Text style={styles.buttonText}>사진첩에서 선택</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={isProcessing}
          style={[
            styles.button,
            styles.secondaryButton,
            isProcessing ? styles.buttonDisabled : null,
          ]}
          onPress={handleCamera}
        >
          <Text style={styles.buttonText}>카메라로 촬영</Text>
        </TouchableOpacity>
        {isAndroid ? (
          <TouchableOpacity
            disabled={isProcessing}
            style={[
              styles.button,
              styles.qaButton,
              isProcessing ? styles.buttonDisabled : null,
            ]}
            onPress={handleQaSampleFile}
          >
            <Text style={styles.buttonText}>QA 샘플 파일 변환 (GPS 보존)</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.optionsBox}>
        <View style={styles.optionRow}>
          <View style={styles.optionTextColumn}>
            <Text style={styles.optionLabel}>EXIF 전체 제거</Text>
            <Text style={styles.optionHint}>
              방향(Orientation)만 남기고 모든 메타데이터 삭제
            </Text>
          </View>
          <Switch
            disabled={isProcessing}
            value={stripExif}
            onValueChange={setStripExif}
          />
        </View>
        <View style={styles.optionRow}>
          <View style={styles.optionTextColumn}>
            <Text style={styles.optionLabel}>GPS만 제거</Text>
            <Text style={styles.optionHint}>
              위치 정보만 삭제하고 나머지 EXIF는 보존
            </Text>
          </View>
          <Switch
            disabled={isProcessing || stripExif}
            value={stripExif || stripGps}
            onValueChange={setStripGps}
          />
        </View>
        <View style={[styles.optionRow, styles.optionRowLast]}>
          <View style={styles.optionTextColumn}>
            <Text style={styles.optionLabel}>GPS 주입 (부산 좌표)</Text>
            <Text style={styles.optionHint}>
              변환본에 35.1796/129.0756 기록 — strip보다 우선
            </Text>
          </View>
          <Switch
            disabled={isProcessing}
            value={injectGps}
            onValueChange={setInjectGps}
          />
        </View>
      </View>

      <View style={styles.statusBox}>
        {isProcessing ? <ActivityIndicator color="#1f2937" /> : null}
        <Text style={styles.statusText}>{statusMessage}</Text>
      </View>

      {results.length === 0 ? (
        <Text style={styles.emptyText}>아직 표시할 변환 결과가 없습니다.</Text>
      ) : (
        results.map((result, index) => (
          <ImageResultCard key={result.id} result={result} index={index} />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: '#f8fafc',
  },
  header: {
    marginTop: 32,
    marginBottom: 20,
  },
  title: {
    color: '#111827',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 8,
  },
  description: {
    color: '#4b5563',
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#0f766e',
  },
  qaButton: {
    backgroundColor: '#7c3aed',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  optionsBox: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomColor: '#f1f5f9',
    borderBottomWidth: 1,
  },
  optionRowLast: {
    borderBottomWidth: 0,
  },
  optionTextColumn: {
    flex: 1,
    paddingRight: 12,
  },
  optionLabel: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '600',
  },
  optionHint: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
  },
  statusBox: {
    minHeight: 56,
    backgroundColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    color: '#1f2937',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'center',
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
  },
  resultCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    padding: 14,
  },
  resultTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  metaText: {
    color: '#6b7280',
    fontSize: 13,
    marginBottom: 4,
  },
  previewRow: {
    flexDirection: 'row',
    marginTop: 12,
    marginBottom: 12,
  },
  previewColumn: {
    flex: 1,
    marginRight: 8,
  },
  previewColumnLast: {
    marginRight: 0,
  },
  previewLabel: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  previewImage: {
    width: '100%',
    height: 150,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
  },
  previewPlaceholder: {
    height: 150,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#6b7280',
    fontSize: 13,
  },
  uriText: {
    color: '#374151',
    fontSize: 12,
    lineHeight: 18,
  },
  exifBox: {
    backgroundColor: '#f9fafb',
    borderColor: '#e5e7eb',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  exifTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  exifRow: {
    borderTopColor: '#e5e7eb',
    borderTopWidth: 1,
    paddingVertical: 7,
  },
  exifLabel: {
    color: '#4b5563',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  exifValue: {
    color: '#1f2937',
    fontSize: 12,
    lineHeight: 17,
  },
  exifEmptyText: {
    color: '#6b7280',
    fontSize: 12,
  },
  exifMoreButton: {
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  exifMoreText: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
});
