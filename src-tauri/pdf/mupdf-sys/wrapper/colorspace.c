#include "internal.h"

/* Cookie */
fz_cookie *mupdf_new_cookie(fz_context *ctx, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_cookie*, NULL, fz_malloc_struct(ctx, fz_cookie));
}

/* Colorspace */
void mupdf_convert_color(fz_context *ctx, fz_colorspace *ss, const float *sv, fz_colorspace *ds, float *dv, fz_colorspace *is, fz_color_params params, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_convert_color(ctx, ss, sv, ds, dv, is, params));
}
