#include "internal.h"

/* DisplayList */
fz_display_list *mupdf_new_display_list(fz_context *ctx, fz_rect mediabox, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_display_list*, NULL, fz_new_display_list(ctx, mediabox));
}

fz_pixmap *mupdf_display_list_to_pixmap(fz_context *ctx, fz_display_list *list, fz_matrix ctm, fz_colorspace *cs, bool alpha, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_pixmap*, NULL, fz_new_pixmap_from_display_list(ctx, list, ctm, cs, alpha));
}

fz_buffer *mupdf_display_list_to_svg(fz_context *ctx, fz_display_list *list, fz_matrix ctm, fz_cookie *cookie, mupdf_error_t **errptr)
{
    fz_rect mediabox = fz_bound_display_list(ctx, list);
    fz_device *dev = NULL;
    fz_buffer *buf = NULL;
    fz_output *out = NULL;
    fz_var(out);
    fz_var(dev);
    fz_var(buf);
    fz_rect tbounds = mediabox;
    tbounds = fz_transform_rect(tbounds, ctm);
    fz_try(ctx)
    {
        buf = fz_new_buffer(ctx, 1024);
        out = fz_new_output_with_buffer(ctx, buf);
        dev = fz_new_svg_device(ctx, out, tbounds.x1 - tbounds.x0, tbounds.y1 - tbounds.y0, FZ_SVG_TEXT_AS_PATH, 1);
        fz_run_display_list(ctx, list, dev, ctm, tbounds, cookie);
        fz_close_device(ctx, dev);
    }
    fz_always(ctx)
    {
        fz_drop_device(ctx, dev);
        fz_drop_output(ctx, out);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return buf;
}

fz_stext_page *mupdf_display_list_to_text_page(fz_context *ctx, fz_display_list *list, int flags, mupdf_error_t **errptr)
{
    fz_stext_page *text_page = NULL;
    fz_stext_options opts = {0};
    opts.flags = flags;
    fz_try(ctx)
    {
        text_page = fz_new_stext_page_from_display_list(ctx, list, &opts);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return text_page;
}

void mupdf_display_list_run(fz_context *ctx, fz_display_list *list, fz_device *device, fz_matrix ctm, fz_rect area, fz_cookie *cookie, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_run_display_list(ctx, list, device, ctm, area, cookie));
}

fz_quad *mupdf_search_display_list(fz_context *ctx, fz_display_list *list, const char *needle, const int hit_max, int *hit_count, mupdf_error_t **errptr)
{
    fz_quad *result = NULL;
    fz_var(result);
    fz_try(ctx)
    {
        result = fz_calloc(ctx, hit_max, sizeof(fz_quad));
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    if (result == NULL) {
        return NULL;
    }
    fz_try(ctx)
    {
        *hit_count = fz_search_display_list(ctx, list, needle, NULL, result, hit_max);
    }
    fz_catch(ctx)
    {
        fz_free(ctx, result);
        mupdf_save_error(ctx, errptr);
    }
    return result;
}
