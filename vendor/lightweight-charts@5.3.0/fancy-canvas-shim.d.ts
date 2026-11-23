/* Type shim only. fancy-canvas is already bundled inside
 * lightweight-charts.standalone.production.mjs and is not loaded separately. */
declare module 'fancy-canvas' {
  export class CanvasRenderingTarget2D {
    readonly canvasElementClientSize: unknown;
    useMediaCoordinateSpace(fn: (scope: unknown) => unknown): unknown;
    useBitmapCoordinateSpace(fn: (scope: unknown) => unknown): unknown;
  }
}
