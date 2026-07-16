import { act, renderHook } from '@testing-library/react';
import { useStepper } from './use-stepper';

describe('useStepper', () => {
  it('starts at index 0 with a 1-based stepNumber', () => {
    const { result } = renderHook(() => useStepper({ count: 4 }));
    expect(result.current.index).toBe(0);
    expect(result.current.stepNumber).toBe(1);
    expect(result.current.isFirst).toBe(true);
    expect(result.current.canBack).toBe(false);
  });

  it('advances and clamps at the last step', () => {
    const { result } = renderHook(() => useStepper({ count: 2 }));
    act(() => result.current.next());
    expect(result.current.index).toBe(1);
    expect(result.current.isLast).toBe(true);
    expect(result.current.canNext).toBe(false);
    act(() => result.current.next());
    expect(result.current.index).toBe(1);
  });

  it('goes back and clamps at the first step', () => {
    const { result } = renderHook(() => useStepper({ count: 3, initial: 1 }));
    act(() => result.current.back());
    expect(result.current.index).toBe(0);
    act(() => result.current.back());
    expect(result.current.index).toBe(0);
  });

  it('goTo clamps into range and reset returns to initial', () => {
    const { result } = renderHook(() => useStepper({ count: 3, initial: 1 }));
    act(() => result.current.goTo(99));
    expect(result.current.index).toBe(2);
    act(() => result.current.reset());
    expect(result.current.index).toBe(1);
  });
});
