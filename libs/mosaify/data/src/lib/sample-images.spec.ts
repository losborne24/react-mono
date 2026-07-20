import { SAMPLE_IMAGES } from './sample-images';

describe('mosaic data', () => {
  it('exposes sample images with a url + label', () => {
    expect(SAMPLE_IMAGES.length).toBeGreaterThan(0);
    SAMPLE_IMAGES.forEach((img) => {
      expect(img.url).toBeTruthy();
      expect(img.label).toBeTruthy();
    });
  });
});
