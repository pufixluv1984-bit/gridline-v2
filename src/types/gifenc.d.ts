// Типы для gifenc 1.0.3 (в пакете их нет) — только то, что используется в src/lib/avatarGif.ts.
declare module 'gifenc' {
  export type Palette = number[][];
  export function quantize(rgba: Uint8ClampedArray | Uint8Array, maxColors: number, options?: Record<string, unknown>): Palette;
  export function applyPalette(rgba: Uint8ClampedArray | Uint8Array, palette: Palette, format?: string): Uint8Array;
  export interface Encoder {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: { palette?: Palette; delay?: number; repeat?: number; transparent?: boolean; transparentIndex?: number; dispose?: number },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  }
  export function GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): Encoder;
}
