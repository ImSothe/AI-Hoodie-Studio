'use client';

import { Component, type ReactNode } from 'react';

/** Los errores de R3F (GLB corrupto, WebGL...) se re-lanzan al árbol de React y acaban aquí. */
export class ViewerErrorBoundary extends Component<
  { onError: (message: string) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? error.message : String(error));
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
