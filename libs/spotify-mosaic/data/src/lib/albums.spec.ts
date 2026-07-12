import { ALBUMS } from './albums';
import { SAMPLE_IMAGES } from './sample-images';

describe('mosaic data', () => {
  it('exposes albums with unique ids', () => {
    expect(ALBUMS.length).toBeGreaterThan(0);
    const ids = new Set(ALBUMS.map((a) => a.id));
    expect(ids.size).toBe(ALBUMS.length);
  });

  it('exposes sample images with thumb + full urls', () => {
    expect(SAMPLE_IMAGES.length).toBeGreaterThan(0);
    SAMPLE_IMAGES.forEach((img) => {
      expect(img.url).toMatch(/^https?:\/\//);
      expect(img.thumbUrl).toMatch(/^https?:\/\//);
    });
  });
});
