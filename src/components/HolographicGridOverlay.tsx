/** Decorative holographic grid. It never intercepts application interaction. */
export function HolographicGridOverlay() {
  return (
    <div className="app-holographic-grid" aria-hidden="true">
      <div className="app-holographic-grid-lines" />
      <div className="app-holographic-grid-dots" />
      <div className="app-holographic-scan-beam" />
      <span className="app-holographic-corner app-holographic-corner-tl" />
      <span className="app-holographic-corner app-holographic-corner-tr" />
      <span className="app-holographic-corner app-holographic-corner-bl" />
      <span className="app-holographic-corner app-holographic-corner-br" />
    </div>
  );
}
