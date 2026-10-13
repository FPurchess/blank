#include "internal.h"

/* Image */
fz_image *mupdf_new_image_from_pixmap(fz_context *ctx, fz_pixmap *pixmap, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_image*, NULL, fz_new_image_from_pixmap(ctx, pixmap, NULL));
}

fz_image *mupdf_new_image_from_file(fz_context *ctx, const char *filename, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_image*, NULL, fz_new_image_from_file(ctx, filename));
}

fz_image *mupdf_new_image_from_buffer(fz_context *ctx, fz_buffer *buffer, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_image*, NULL, fz_new_image_from_buffer(ctx, buffer));
}

fz_image *mupdf_new_image_from_display_list(fz_context *ctx, fz_display_list *list, float w, float h, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_image*, NULL, fz_new_image_from_display_list(ctx, w, h, list));
}

fz_pixmap *mupdf_get_pixmap_from_image(fz_context *ctx, fz_image *image, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_pixmap*, NULL, fz_get_pixmap_from_image(ctx, image, NULL, NULL, NULL, NULL));
}
