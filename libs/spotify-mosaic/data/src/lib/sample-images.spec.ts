import { SAMPLE_IMAGES } from './sample-images';

describe('mosaic data', () => {
  it('exposes sample images with thumb + full urls', () => {
    expect(SAMPLE_IMAGES.length).toBeGreaterThan(0);
    SAMPLE_IMAGES.forEach((img) => {
      expect(img.url).toMatch(/^https?:\/\//);
      expect(img.thumbUrl).toMatch(/^https?:\/\//);
    });
  });
});
