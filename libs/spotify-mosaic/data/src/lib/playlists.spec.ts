import { PLAYLISTS } from './playlists';
import { SAMPLE_IMAGES } from './sample-images';

describe('mosaic data', () => {
  it('exposes playlists with unique ids', () => {
    expect(PLAYLISTS.length).toBeGreaterThan(0);
    const ids = new Set(PLAYLISTS.map((p) => p.id));
    expect(ids.size).toBe(PLAYLISTS.length);
  });

  it('exposes sample images with thumb + full urls', () => {
    expect(SAMPLE_IMAGES.length).toBeGreaterThan(0);
    SAMPLE_IMAGES.forEach((img) => {
      expect(img.url).toMatch(/^https?:\/\//);
      expect(img.thumbUrl).toMatch(/^https?:\/\//);
    });
  });
});
