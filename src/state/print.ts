import { shallowRef } from "vue";

import { PRINT_DEFAULTS, type PrintSettings } from "../print/printModel";

// printSettings holds what the print dialog remembers between prints: the
// destination, pages per sheet, scale and whether "More settings" is open
// (persisted)
export const printSettings = shallowRef<PrintSettings>(PRINT_DEFAULTS);
