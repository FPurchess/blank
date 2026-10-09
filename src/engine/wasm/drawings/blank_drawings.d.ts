/* tslint:disable */
/* eslint-disable */

export class DiagramModule {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * adds a font file, in the order the layout engine has them: its own,
     * then its fallbacks
     */
    addFont(bytes: Uint8Array): void;
    /**
     * a diagram's SVG as a drawing's JSON; undefined for one it can't read
     */
    draw(svg: string): string | undefined;
    /**
     * the characters of the last drawing's labels no font has, for the
     * webview to look up in the system's fonts
     */
    missing(): string;
    constructor();
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_diagrammodule_free: (a: number, b: number) => void;
    readonly diagrammodule_addFont: (a: number, b: number, c: number) => void;
    readonly diagrammodule_draw: (a: number, b: number, c: number) => [number, number];
    readonly diagrammodule_missing: (a: number) => [number, number];
    readonly diagrammodule_new: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
