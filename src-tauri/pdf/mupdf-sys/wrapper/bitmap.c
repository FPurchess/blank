#include "internal.h"
#include <stdarg.h>

fz_bitmap *mupdf_new_bitmap_from_pixmap(fz_context *ctx, fz_pixmap *pixmap, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_bitmap*, NULL, fz_new_bitmap_from_pixmap(ctx, pixmap, NULL));
}

int32_t mupdf_highlight_selection(fz_context *ctx, fz_stext_page *page, fz_point a, fz_point b, fz_quad *quads, int max_quads, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, fz_highlight_selection(ctx, page, a, b, quads, max_quads));
}

int32_t mupdf_search_stext_page_cb(fz_context *ctx, fz_stext_page *page, const char *needle, fz_search_callback_fn *cb, void *opaque, mupdf_error_t **errptr) {
    TRY_CATCH(int32_t, 0, fz_search_stext_page_cb(ctx, page, needle, cb, opaque));
}

void mupdf_format_string(fz_context *ctx, void *user, void (*emit)(fz_context *ctx, void *user, int c), const char *fmt, ...) {
    va_list ap;
    va_start(ap, fmt);
    fz_format_string(ctx, user, emit, fmt, ap);
    va_end(ap);
}
