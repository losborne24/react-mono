import { matchIndices, normaliseTrackColours } from './mosaic-match.js';

describe('normaliseTrackColours', () => {
  it('premultiplies each channel by alpha and normalises to 0-1', () => {
    expect(normaliseTrackColours([[255, 0, 0, 255]])).toEqual([[1, 0, 0, 1]]);
    expect(normaliseTrackColours([[255, 255, 255, 0]])).toEqual([[0, 0, 0, 0]]);
  });
});

describe('matchIndices', () => {
  it('maps each pixel to the nearest track colour index', () => {
    const colours = normaliseTrackColours([
      [255, 0, 0, 255], // red -> 0
      [0, 0, 255, 255], // blue -> 1
    ]);
    // 2x1 image: red pixel, blue pixel.
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]);
    const indices = matchIndices(data, 2, 1, colours);
    expect(Array.from(indices)).toEqual([0, 1]);
  });
});
