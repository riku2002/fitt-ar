import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

/**
 * jsdom does not provide ResizeObserver.
 *
 * react-use-measure (used internally by @react-three/fiber) expects it to
 * exist, even though unit/integration tests do not need real layout
 * observation.
 *
 * Do not install this through vi.stubGlobal(), because individual test files
 * may call vi.unstubAllGlobals() in afterEach().
 */
class ResizeObserverMock implements ResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    void callback
  }

  observe(
    target: Element,
    options?: ResizeObserverOptions,
  ): void {
    void target
    void options
  }

  unobserve(target: Element): void {
    void target
  }

  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: ResizeObserverMock,
  })
}

if (
  typeof window !== 'undefined' &&
  typeof window.ResizeObserver === 'undefined'
) {
  Object.defineProperty(window, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: ResizeObserverMock,
  })
}

afterEach(cleanup)