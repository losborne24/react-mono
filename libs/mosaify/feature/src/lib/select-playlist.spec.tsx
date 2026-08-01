import { fireEvent, render } from '@testing-library/react';
import type { Playlist } from '@react-mono/models';
import { SelectPlaylist } from './select-playlist';

const PLAYLISTS: Playlist[] = [
  { id: 'pl-1', title: 'Morning Coffee', artist: 'Various', tracks: 12, img: 'http://img/1' },
  { id: 'pl-2', title: 'Focus Flow', artist: 'Brian Eno', tracks: 20, img: 'http://img/2' },
  { id: 'pl-3', title: 'Late Night', artist: 'Various', tracks: 8, img: 'http://img/3' },
];

interface Overrides {
  playlists?: Playlist[];
  selected?: Playlist | null;
  search?: string;
  loading?: boolean;
}

function renderSelect(overrides: Overrides = {}) {
  const onSelect = vi.fn();
  const onNext = vi.fn();
  const onSearchChange = vi.fn();
  const utils = render(
    <SelectPlaylist
      playlists={overrides.playlists ?? PLAYLISTS}
      selected={overrides.selected ?? null}
      onSelect={onSelect}
      onNext={onNext}
      search={overrides.search ?? ''}
      onSearchChange={onSearchChange}
      loading={overrides.loading}
    />,
  );
  return { onSelect, onNext, onSearchChange, ...utils };
}

describe('SelectPlaylist', () => {
  it('renders the heading and a card per playlist', () => {
    const { getByText } = renderSelect();
    expect(getByText('Choose a playlist')).toBeTruthy();
    expect(getByText('Morning Coffee')).toBeTruthy();
    expect(getByText('Focus Flow')).toBeTruthy();
    expect(getByText('Late Night')).toBeTruthy();
  });

  it('calls onSelect with the playlist when its card is clicked', () => {
    const { getByText, onSelect } = renderSelect();
    fireEvent.click(getByText('Focus Flow'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(PLAYLISTS[1]);
  });

  it('marks the selected playlist card as pressed', () => {
    const { getAllByRole } = renderSelect({ selected: PLAYLISTS[0] });
    const cards = getAllByRole('button', { name: /Morning Coffee|Focus Flow|Late Night/ });
    const pressed = cards.filter((c) => c.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toContain('Morning Coffee');
  });

  describe('search', () => {
    it('reflects the current search value in the input', () => {
      const { getByDisplayValue } = renderSelect({ search: 'focus' });
      expect(getByDisplayValue('focus')).toBeTruthy();
    });

    it('calls onSearchChange as the user types', () => {
      const { getByPlaceholderText, onSearchChange } = renderSelect();
      fireEvent.change(getByPlaceholderText(/Search Spotify playlists/), {
        target: { value: 'jazz' },
      });
      expect(onSearchChange).toHaveBeenCalledWith('jazz');
    });
  });

  describe('footer', () => {
    it('shows "No playlist selected" and disables Next when nothing is selected', () => {
      const { getByText } = renderSelect({ selected: null });
      expect(getByText('No playlist selected')).toBeTruthy();
      expect(getByText('Next').closest('button')?.disabled).toBe(true);
    });

    it('summarises the selection and enables Next when a playlist is selected', () => {
      const { getByText } = renderSelect({ selected: PLAYLISTS[1] });
      const summary = getByText(/by Brian Eno/);
      expect(summary.textContent).toContain('Focus Flow');
      expect(getByText('Next').closest('button')?.disabled).toBe(false);
    });

    it('calls onNext when Next is clicked with a selection', () => {
      const { getByText, onNext } = renderSelect({ selected: PLAYLISTS[0] });
      fireEvent.click(getByText('Next'));
      expect(onNext).toHaveBeenCalledTimes(1);
    });
  });

  describe('loading', () => {
    it('shows the default loading label when not searching', () => {
      const { getByText, queryByText } = renderSelect({ loading: true });
      expect(getByText('Loading your playlists…')).toBeTruthy();
      expect(queryByText('Morning Coffee')).toBeNull();
    });

    it('shows the searching loading label when a query is present', () => {
      const { getByText } = renderSelect({ loading: true, search: 'focus' });
      expect(getByText('Searching…')).toBeTruthy();
    });
  });

  describe('empty state', () => {
    it('explains there are no playlists on the account when not searching', () => {
      const { getByText } = renderSelect({ playlists: [] });
      expect(getByText('No playlists found on your account.')).toBeTruthy();
    });

    it('references the query when a search returns no matches', () => {
      const { getByText } = renderSelect({ playlists: [], search: 'reggae' });
      expect(getByText('No playlists match “reggae”.')).toBeTruthy();
    });
  });
});
