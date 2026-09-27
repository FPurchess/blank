import { layoutOf, type Layout } from "../layout/resolve";
import { DEFAULT_PAGE, type PageSettings } from "../layout/settings";

/**
 * testLayout returns the layout of `settings` over Blank's defaults, on A4
 * where the paper is "auto"
 */
export const testLayout = (settings: Partial<PageSettings> = {}): Layout =>
  layoutOf({ ...DEFAULT_PAGE, ...settings }, "de-DE");

// lengths in points, computed like parseLength so they compare equal
export const cm = (value: number) => value * (72 / 2.54);
export const mm = (value: number) => value * (72 / 25.4);
