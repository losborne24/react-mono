import { fireEvent, render, waitFor } from '@testing-library/react';
import type { SourceImage } from '@react-mono/models';
import { SelectImage } from './select-image';

const IMAGES: SourceImage[] = [
  { id: 'img-1', url: 'http://img/1', label: 'Sunset' },
  { id: 'img-2', url: 'http://img/2', label: 'Mountains' },
  { id: 'img-3', url: 'http://img/3', label: 'Ocean' },
];

function renderSelect(overrides: Partial<React.ComponentProps<typeof SelectImage>> = {}) {
  const onSelect = vi.fn();
  const onGenerate = vi.fn();
  const utils = render(
    <SelectImage
      images={IMAGES}
      selected={null}
      onSelect={onSelect}
      onGenerate={onGenerate}
      trackCoversLoading={false}
      trackCoversLoaded={0}
      trackCount={0}
      {...overrides}
    />,
  );
  return { onSelect, onGenerate, ...utils };
}

// jsdom does not implement the object-URL lifecycle that useImageUpload drives.
const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

beforeEach(() => {
  Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:preview', configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, configurable: true });
});

afterEach(() => {
  if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
  else delete (URL as { createObjectURL?: unknown }).createObjectURL;
  if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
  else delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
});

describe('SelectImage', () => {
  it('renders the prompt and every sample image', () => {
    const { getByText, getByAltText } = renderSelect();
    expect(getByText(/Pick a target image/i)).toBeTruthy();
    expect(getByAltText('Sunset')).toBeTruthy();
    expect(getByAltText('Mountains')).toBeTruthy();
    expect(getByAltText('Ocean')).toBeTruthy();
  });

  it('calls onSelect with the sample when a thumbnail is clicked', () => {
    const { onSelect, getByAltText } = renderSelect();
    fireEvent.click(getByAltText('Mountains'));
    // Choosing a sample first clears any upload (which reports null), so the
    // sample lands as the final selection.
    expect(onSelect).toHaveBeenLastCalledWith(IMAGES[1]);
  });

  it('marks only the selected sample as pressed', () => {
    const { getByAltText } = renderSelect({ selected: IMAGES[0] });
    expect(getByAltText('Sunset').closest('button')?.getAttribute('aria-pressed')).toBe('true');
    expect(getByAltText('Mountains').closest('button')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows "No image selected" when nothing is selected', () => {
    const { getByText } = renderSelect();
    expect(getByText(/No image selected/i)).toBeTruthy();
  });

  it('shows the selected image label in the footer', () => {
    const { getByText } = renderSelect({ selected: IMAGES[2] });
    // The label also appears in the thumbnail hover overlay; scope to the footer
    // paragraph, where it is wrapped in the primary-tinted span.
    expect(getByText('Ocean', { selector: 'p span' })).toBeTruthy();
    expect(getByText(/selected/i)).toBeTruthy();
  });

  it('disables Generate until an image is selected', () => {
    const { getByText } = renderSelect();
    expect(getByText(/Generate Mosaic/i).closest('button')?.disabled).toBe(true);
  });

  it('enables Generate and calls onGenerate once an image is selected', () => {
    const { onGenerate, getByText } = renderSelect({ selected: IMAGES[0] });
    const button = getByText(/Generate Mosaic/i).closest('button') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('shows the loading state with remaining count and disables Generate while track covers load', () => {
    const { getByText } = renderSelect({
      selected: IMAGES[0],
      trackCoversLoading: true,
      trackCoversLoaded: 4,
      trackCount: 12,
    });
    expect(getByText(/Loading track covers \(8 remaining\)/i)).toBeTruthy();
    expect(getByText(/Loading track covers/i).closest('button')?.disabled).toBe(true);
  });

  it('reads an uploaded image into a data URL and selects it', async () => {
    const { onSelect, container } = renderSelect();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'photo.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    const arg = onSelect.mock.calls[0][0] as SourceImage;
    expect(arg.id).toBe('uploaded-image');
    expect(arg.label).toBe('photo.png');
    expect(arg.url.startsWith('data:')).toBe(true);
  });

  it('ignores non-image uploads', () => {
    const { onSelect, container } = renderSelect();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['nope'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
