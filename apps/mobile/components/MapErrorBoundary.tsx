import React from "react";

type Props = {
  children: React.ReactNode;
  onFallback: () => void;
};

type State = { hasError: boolean };

/**
 * Catches JS errors while mounting/rendering MapView and switches to static preview.
 * Native SIGABRT (e.g. missing Android Google Maps API key) is not catchable here —
 * use canUseInteractiveMaps() before mounting RouteMapView.
 */
export class MapErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    if (__DEV__) console.warn("[MapErrorBoundary]", error.message);
    // Auto-switch to static preview on the next tick so parent can remount the slot.
    queueMicrotask(() => this.props.onFallback());
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}
