import { render } from '@testing-library/react';

import OrgKitchenSink from './kitchen-sink';

describe('OrgKitchenSink', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<OrgKitchenSink />);
    expect(baseElement).toBeTruthy();
  });
});
