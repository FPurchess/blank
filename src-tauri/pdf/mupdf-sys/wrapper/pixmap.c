#include "internal.h"

/* Pixmap */
fz_pixmap *mupdf_new_pixmap(fz_context *ctx, fz_colorspace *cs, int x, int y, int w, int h, bool alpha, mupdf_error_t **errptr)
{
    fz_pixmap *pixmap = NULL;
    fz_try(ctx)
    {
        pixmap = fz_new_pixmap(ctx, cs, w, h, NULL, alpha);
        pixmap->x = x;
        pixmap->y = y;
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return pixmap;
}

fz_pixmap *mupdf_clone_pixmap(fz_context *ctx, fz_pixmap *self, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_pixmap*, NULL, fz_clone_pixmap(ctx, self));
}

void mupdf_clear_pixmap(fz_context *ctx, fz_pixmap *pixmap, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_clear_pixmap(ctx, pixmap));
}

void mupdf_clear_pixmap_with_value(fz_context *ctx, fz_pixmap *pixmap, int value, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_clear_pixmap_with_value(ctx, pixmap, value));
}

void mupdf_clear_pixmap_rect_with_value(fz_context *ctx, fz_pixmap *pixmap, int value, fz_irect rect, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_clear_pixmap_rect_with_value(ctx, pixmap, value, rect));
}

void mupdf_invert_pixmap(fz_context *ctx, fz_pixmap *pixmap, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_invert_pixmap(ctx, pixmap));
}

void mupdf_invert_pixmap_rect(fz_context *ctx, fz_pixmap *pixmap, fz_irect rect, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_invert_pixmap_rect(ctx, pixmap, rect));
}

void mupdf_md5_pixmap(fz_context *ctx, fz_pixmap *pixmap, unsigned char digest[16], mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_md5_pixmap(ctx, pixmap, digest));
}

fz_pixmap *mupdf_warp_pixmap(fz_context *ctx, fz_pixmap *pixmap, fz_quad points, int width, int height, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_pixmap*, NULL, fz_warp_pixmap(ctx, pixmap, points, width, height));
}

void mupdf_subsample_pixmap(fz_context *ctx, fz_pixmap *pixmap, int factor, mupdf_error_t **errptr)
{
    if (factor < 1)
    {
        *errptr = mupdf_new_error_from_str("subsample factor must be at least 1");
        return;
    }
    TRY_CATCH_VOID(fz_subsample_pixmap(ctx, pixmap, factor));
}

void mupdf_gamma_pixmap(fz_context *ctx, fz_pixmap *pixmap, float gamma, mupdf_error_t **errptr)
{
    if (!fz_pixmap_colorspace(ctx, pixmap))
    {
        *errptr = mupdf_new_error_from_str("colorspace invalid for function");
        return;
    }

    TRY_CATCH_VOID(fz_gamma_pixmap(ctx, pixmap, gamma));
}

void mupdf_tint_pixmap(fz_context *ctx, fz_pixmap *pixmap, int black, int white, mupdf_error_t **errptr)
{
    fz_colorspace *cs = fz_pixmap_colorspace(ctx, pixmap);
    if (!cs || cs->n > 3)
    {
        *errptr = mupdf_new_error_from_str("colorspace invalid for function");
        return;
    }

    TRY_CATCH_VOID(fz_tint_pixmap(ctx, pixmap, black, white));
}

void mupdf_save_pixmap_as(fz_context *ctx, fz_pixmap *pixmap, const char *filename, int format, mupdf_error_t **errptr)
{
    fz_try(ctx)
    {
        switch (format)
        {
        case (0):
            fz_save_pixmap_as_png(ctx, pixmap, filename);
            break;
        case (1):
            fz_save_pixmap_as_pnm(ctx, pixmap, filename);
            break;
        case (2):
            fz_save_pixmap_as_pam(ctx, pixmap, filename);
            break;
        case (3): // Adobe Photoshop Document
            fz_save_pixmap_as_psd(ctx, pixmap, filename);
            break;
        case (4): // Postscript format
            fz_save_pixmap_as_ps(ctx, pixmap, (char *)filename, 0);
            break;
        default:
            fz_save_pixmap_as_png(ctx, pixmap, filename);
            break;
        }
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
}

fz_buffer *mupdf_pixmap_get_image_data(fz_context *ctx, fz_pixmap *pixmap, int format, mupdf_error_t **errptr)
{
    fz_output *out = NULL;
    fz_buffer *buf = NULL;
    fz_var(out);
    fz_var(buf);
    fz_try(ctx)
    {
        size_t size = fz_pixmap_stride(ctx, pixmap) * pixmap->h;
        buf = fz_new_buffer(ctx, size);
        out = fz_new_output_with_buffer(ctx, buf);
        switch (format)
        {
        case (0):
            fz_write_pixmap_as_png(ctx, out, pixmap);
            break;
        case (1):
            fz_write_pixmap_as_pnm(ctx, out, pixmap);
            break;
        case (2):
            fz_write_pixmap_as_pam(ctx, out, pixmap);
            break;
        case (3): // Adobe Photoshop Document
            fz_write_pixmap_as_psd(ctx, out, pixmap);
            break;
        case (4): // Postscript format
            fz_write_pixmap_as_ps(ctx, out, pixmap);
            break;
        default:
            fz_write_pixmap_as_png(ctx, out, pixmap);
            break;
        }
    }
    fz_always(ctx)
    {
        fz_drop_output(ctx, out);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return buf;
}
