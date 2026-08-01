import { fireEvent, render } from '@testing-library/react';
import { SearchInput } from './search-input';

describe('SearchInput', () => {
  it('reports typed text via onValueChange', () => {
    const onValueChange = vi.fn();
    const { getByRole } = render(<SearchInput value="" onValueChange={onValueChange} placeholder="Search" />);
    fireEvent.change(getByRole('textbox'), { target: { value: 'jazz' } });
    expect(onValueChange).toHaveBeenCalledWith('jazz');
  });

  it('hides the clear button until there is a query', () => {
    const { queryByLabelText, rerender } = render(<SearchInput value="" onValueChange={vi.fn()} />);
    expect(queryByLabelText('Clear search')).toBeNull();
    rerender(<SearchInput value="jazz" onValueChange={vi.fn()} />);
    expect(queryByLabelText('Clear search')).toBeTruthy();
  });

  it('clears the query when the clear button is pressed', () => {
    const onValueChange = vi.fn();
    const { getByLabelText } = render(<SearchInput value="jazz" onValueChange={onValueChange} />);
    fireEvent.click(getByLabelText('Clear search'));
    expect(onValueChange).toHaveBeenCalledWith('');
  });
});
