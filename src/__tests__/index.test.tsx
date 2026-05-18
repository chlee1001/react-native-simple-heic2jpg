let mockConvertImageAtPath: jest.Mock | undefined;

jest.mock('../NativeSimpleHeic2jpg', () => ({
  __esModule: true,
  default: {
    get convertImageAtPath() {
      return mockConvertImageAtPath;
    },
  },
}));

import { convertImage } from '../index';

beforeEach(() => {
  mockConvertImageAtPath = jest.fn();
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
    expect(mockConvertImageAtPath).toHaveBeenCalledWith('/tmp/input.heic');
  });

  it('prefixes raw native paths with file URI scheme', async () => {
    mockConvertImageAtPath?.mockResolvedValue('/tmp/output.jpeg');

    await expect(convertImage('/tmp/input.heic')).resolves.toBe(
      'file:///tmp/output.jpeg'
    );
  });

  it('throws when native conversion method is unavailable', async () => {
    mockConvertImageAtPath = undefined;

    await expect(convertImage('/tmp/input.heic')).rejects.toThrow(
      'SimpleHeic2jpg module is not available'
    );
  });

  it('throws when native returns an invalid result', async () => {
    mockConvertImageAtPath?.mockResolvedValue('');

    await expect(convertImage('/tmp/input.heic')).rejects.toThrow(
      'convertImageAtPath returned an invalid result'
    );
  });

  it('propagates native conversion failures', async () => {
    const nativeError = new Error('native conversion failed');
    mockConvertImageAtPath?.mockRejectedValue(nativeError);

    await expect(convertImage('/tmp/input.heic')).rejects.toBe(nativeError);
  });
});
