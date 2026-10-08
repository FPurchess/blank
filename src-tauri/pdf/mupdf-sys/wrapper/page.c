#include "internal.h"

/* Page */
fz_rect mupdf_bound_page(fz_context *ctx, fz_page *page, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_rect, {}, fz_bound_page(ctx, page));
}

fz_pixmap *mupdf_page_to_pixmap(fz_context *ctx, fz_page *page, fz_matrix ctm, fz_colorspace *cs, bool alpha, bool show_extras, mupdf_error_t **errptr)
{
    if (show_extras)
    {
        TRY_CATCH(fz_pixmap*, NULL, fz_new_pixmap_from_page(ctx, page, ctm, cs, alpha));
    }
    else
    {
        TRY_CATCH(fz_pixmap*, NULL, fz_new_pixmap_from_page_contents(ctx, page, ctm, cs, alpha));
    }
}

fz_buffer *mupdf_page_to_svg(fz_context *ctx, fz_page *page, fz_matrix ctm, fz_cookie *cookie, mupdf_error_t **errptr)
{
    fz_rect mediabox = fz_bound_page(ctx, page);
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
        fz_run_page(ctx, page, dev, ctm, cookie);
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

fz_stext_page *mupdf_new_stext_page_from_page(fz_context *ctx, fz_page *page, const fz_stext_options *options, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_stext_page*, NULL, fz_new_stext_page_from_page(ctx, page, options));
}

fz_display_list *mupdf_page_to_display_list(fz_context *ctx, fz_page *page, bool annots, mupdf_error_t **errptr)
{
    if (annots)
    {
        TRY_CATCH(fz_display_list*, NULL, fz_new_display_list_from_page(ctx, page));
    }
    else
    {
        TRY_CATCH(fz_display_list*, NULL, fz_new_display_list_from_page_contents(ctx, page));
    }
}

void mupdf_run_page(fz_context *ctx, fz_page *page, fz_device *device, fz_matrix ctm, fz_cookie *cookie, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_run_page(ctx, page, device, ctm, cookie));
}

void mupdf_run_page_contents(fz_context *ctx, fz_page *page, fz_device *device, fz_matrix ctm, fz_cookie *cookie, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_run_page_contents(ctx, page, device, ctm, cookie));
}

void mupdf_run_page_annots(fz_context *ctx, fz_page *page, fz_device *device, fz_matrix ctm, fz_cookie *cookie, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_run_page_annots(ctx, page, device, ctm, cookie));
}

void mupdf_run_page_widgets(fz_context *ctx, fz_page *page, fz_device *device, fz_matrix ctm, fz_cookie *cookie, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_run_page_widgets(ctx, page, device, ctm, cookie));
}

fz_output *mupdf_new_output_with_buffer(fz_context *ctx, fz_buffer *buf, mupdf_error_t **errptr) {
    TRY_CATCH(fz_output*, NULL, fz_new_output_with_buffer(ctx, buf));
}

void mupdf_print_stext_page_as_html(fz_context *ctx, fz_output *out, fz_stext_page *page, int id, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_print_stext_page_as_html(ctx, out, page, id));
}

void mupdf_print_stext_header_as_html(fz_context *ctx, fz_output *out, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_print_stext_header_as_html(ctx, out));
}

void mupdf_print_stext_trailer_as_html(fz_context *ctx, fz_output *out, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_print_stext_trailer_as_html(ctx, out));
}

void mupdf_print_stext_page_as_xhtml(fz_context *ctx, fz_output *out, fz_stext_page *page, int id, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_print_stext_page_as_xhtml(ctx, out, page, id));
}

void mupdf_print_stext_header_as_xhtml(fz_context *ctx, fz_output *out, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_print_stext_header_as_xhtml(ctx, out));
}

void mupdf_print_stext_trailer_as_xhtml(fz_context *ctx, fz_output *out, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_print_stext_trailer_as_xhtml(ctx, out));
}

void mupdf_print_stext_page_as_xml(fz_context *ctx, fz_output *out, fz_stext_page *page, int id, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_print_stext_page_as_xml(ctx, out, page, id));
}

void mupdf_print_stext_page_as_text(fz_context *ctx, fz_output *out, fz_stext_page *page, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_print_stext_page_as_text(ctx, out, page));
}

void mupdf_print_stext_page_as_json(fz_context *ctx, fz_output *out, fz_stext_page *page, float scale, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_print_stext_page_as_json(ctx, out, page, scale));
}

fz_link *mupdf_load_links(fz_context *ctx, fz_page *page, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_link*, NULL, fz_load_links(ctx, page));
}

fz_separations *mupdf_page_separations(fz_context *ctx, fz_page *page, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_separations*, NULL, fz_page_separations(ctx, page));
}

fz_quad *mupdf_search_page(fz_context *ctx, fz_page *page, const char *needle, const int hit_max, int *hit_count, mupdf_error_t **errptr)
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
        *hit_count = fz_search_page(ctx, page, needle, NULL, result, hit_max);
    }
    fz_catch(ctx)
    {
        fz_free(ctx, result);
        mupdf_save_error(ctx, errptr);
    }
    return result;
}

fz_quad *mupdf_search_stext_page(fz_context *ctx, fz_stext_page *page, const char *needle, const int hit_max, int *hit_count, mupdf_error_t **errptr)
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
        *hit_count = fz_search_stext_page(ctx, page, needle, NULL, result, hit_max);
    }
    fz_catch(ctx)
    {
        fz_free(ctx, result);
        mupdf_save_error(ctx, errptr);
    }
    return result;
}
