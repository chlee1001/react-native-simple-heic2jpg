let mockConvertImageAtPath: jest.Mock | undefined;
let mockConvertImageAtPathAsBase64: jest.Mock | undefined;

jest.mock('../NativeSimpleHeic2jpg', () => ({
  __esModule: true,
  default: {
    get convertImageAtPath() {
      return mockConvertImageAtPath;
    },
    get convertImageAtPathAsBase64() {
      return mockConvertImageAtPathAsBase64;
    },
  },
}));

import { convertImage } from '../index';

beforeEach(() => {
  mockConvertImageAtPath = jest.fn();
  mockConvertImageAtPathAsBase64 = jest.fn();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('convertImage', () => {
  it('returns file URIs from native unchanged', async () => {
    mockConvertImageAtPath?.mockResolvedValue('file:///tmp/output.jpeg');

    await expect(convertImage('/tmp/input.heic')).resolves.toBe(
      'file:///tmp/output.jpeg'
    );
    expect(mockConvertImageAtPath).toHaveBeenCalledWith('/tmp/input.heic', {
      stripExif: false,
      stripGps: false,
    });
    expect(mockConvertImageAtPathAsBase64).not.toHaveBeenCalled();
  });

  it('prefixes raw native paths with file URI scheme', async () => {
    mockConvertImageAtPath?.mockResolvedValue('/tmp/output.jpeg');

    await expect(convertImage('/tmp/input.heic')).resolves.toBe(
      'file:///tmp/output.jpeg'
    );
  });

  it('returns raw base64 strings without URI prefixing', async () => {
    mockConvertImageAtPathAsBase64?.mockResolvedValue('abc123+/=');

    await expect(
      convertImage('/tmp/input.heic', { returnBase64: true })
    ).resolves.toBe('abc123+/=');
    expect(mockConvertImageAtPathAsBase64).toHaveBeenCalledWith(
      '/tmp/input.heic',
      { stripExif: false, stripGps: false }
    );
    expect(mockConvertImageAtPath).not.toHaveBeenCalled();
  });

  it('forwards stripExif and stripGps to native, defaulting unset flags to false', async () => {
    mockConvertImageAtPath?.mockResolvedValue('file:///tmp/output.jpeg');

    await convertImage('/tmp/input.heic', { stripGps: true });
    expect(mockConvertImageAtPath).toHaveBeenCalledWith('/tmp/input.heic', {
      stripExif: false,
      stripGps: true,
    });
  });

  it('flattens the gps option into native gpsLatitude/gpsLongitude (URI mode)', async () => {
    mockConvertImageAtPath?.mockResolvedValue('file:///tmp/output.jpeg');

    await convertImage('/tmp/input.heic', {
      gps: { latitude: 35.1796, longitude: 129.0756 },
    });
    expect(mockConvertImageAtPath).toHaveBeenCalledWith('/tmp/input.heic', {
      stripExif: false,
      stripGps: false,
      gpsLatitude: 35.1796,
      gpsLongitude: 129.0756,
    });
  });

  it('flattens the gps option for the base64 method too', async () => {
    mockConvertImageAtPathAsBase64?.mockResolvedValue('abc123+/=');

    await convertImage('/tmp/input.heic', {
      returnBase64: true,
      gps: { latitude: -33.8688, longitude: 151.2093 },
    });
    expect(mockConvertImageAtPathAsBase64).toHaveBeenCalledWith(
      '/tmp/input.heic',
      {
        stripExif: false,
        stripGps: false,
        gpsLatitude: -33.8688,
        gpsLongitude: 151.2093,
      }
    );
  });

  it('omits gps fields entirely when the gps option is not provided', async () => {
    mockConvertImageAtPath?.mockResolvedValue('file:///tmp/output.jpeg');

    await convertImage('/tmp/input.heic', { stripExif: true });
    const passedOptions = mockConvertImageAtPath?.mock.calls[0]?.[1];
    expect(passedOptions).not.toHaveProperty('gpsLatitude');
    expect(passedOptions).not.toHaveProperty('gpsLongitude');
  });

  it('does not add a data URI prefix to base64 results', async () => {
    mockConvertImageAtPathAsBase64?.mockResolvedValue('/9j/4AAQSkZJRgABAQ==');

    await expect(
      convertImage('/tmp/input.heic', { returnBase64: true })
    ).resolves.toBe('/9j/4AAQSkZJRgABAQ==');
  });

  it('throws when native conversion method is unavailable', async () => {
    mockConvertImageAtPath = undefined;

    await expect(convertImage('/tmp/input.heic')).rejects.toThrow(
      'SimpleHeic2jpg module is not available'
    );
  });

  it('throws when native base64 conversion method is unavailable', async () => {
    mockConvertImageAtPathAsBase64 = undefined;

    await expect(
      convertImage('/tmp/input.heic', { returnBase64: true })
    ).rejects.toThrow(
      'SimpleHeic2jpg base64 conversion method is not available'
    );
  });

  it('throws when native returns an invalid result', async () => {
    mockConvertImageAtPath?.mockResolvedValue('');

    await expect(convertImage('/tmp/input.heic')).rejects.toThrow(
      'convertImageAtPath returned an invalid result'
    );
  });

  it('throws when native base64 conversion returns an invalid result', async () => {
    mockConvertImageAtPathAsBase64?.mockResolvedValue('');

    await expect(
      convertImage('/tmp/input.heic', { returnBase64: true })
    ).rejects.toThrow('convertImageAtPathAsBase64 returned an invalid result');
  });

  it('propagates native conversion failures', async () => {
    const nativeError = new Error('native conversion failed');
    mockConvertImageAtPath?.mockRejectedValue(nativeError);

    await expect(convertImage('/tmp/input.heic')).rejects.toBe(nativeError);
  });

  it('propagates native base64 conversion failures', async () => {
    const nativeError = new Error('native base64 conversion failed');
    mockConvertImageAtPathAsBase64?.mockRejectedValue(nativeError);

    await expect(
      convertImage('/tmp/input.heic', { returnBase64: true })
    ).rejects.toBe(nativeError);
  });
});
