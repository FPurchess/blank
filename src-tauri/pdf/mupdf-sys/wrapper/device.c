#include "internal.h"

/* Device */
fz_device *mupdf_new_draw_device(fz_context *ctx, fz_pixmap *pixmap, fz_irect clip, mupdf_error_t **errptr)
{
    fz_device *device = NULL;
    fz_try(ctx)
    {
        if (fz_is_infinite_irect(clip))
        {
            device = fz_new_draw_device(ctx, fz_identity, pixmap);
        }
        else
        {
            device = fz_new_draw_device_with_bbox(ctx, fz_identity, pixmap, &clip);
        }
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return device;
}

fz_device *mupdf_new_device_of_size(fz_context *ctx, int size, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_device*, NULL, fz_new_device_of_size(ctx, size));
}

fz_device *mupdf_new_display_list_device(fz_context *ctx, fz_display_list *list, mupdf_error_t **errptr)
{
    fz_device *device = NULL;
    fz_try(ctx)
    {
        device = fz_new_list_device(ctx, list);
        fz_keep_display_list(ctx, list);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return device;
}

fz_device *mupdf_new_stext_device(fz_context *ctx, fz_stext_page *tp, int flags, mupdf_error_t **errptr)
{
    fz_stext_options opts = {0};
    opts.flags = flags;
    TRY_CATCH(fz_device*, NULL, fz_new_stext_device(ctx, tp, &opts));
}

void mupdf_fill_path(fz_context *ctx, fz_device *device, fz_path *path, bool even_odd, fz_matrix ctm, fz_colorspace *cs, const float *color, float alpha, fz_color_params cp, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_fill_path(ctx, device, path, even_odd, ctm, cs, color, alpha, cp));
}

void mupdf_stroke_path(fz_context *ctx, fz_device *device, fz_path *path, fz_stroke_state *stroke, fz_matrix ctm, fz_colorspace *cs, const float *color, float alpha, fz_color_params cp, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_stroke_path(ctx, device, path, stroke, ctm, cs, color, alpha, cp));
}

void mupdf_clip_path(fz_context *ctx, fz_device *device, fz_path *path, bool even_odd, fz_matrix ctm, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_clip_path(ctx, device, path, even_odd, ctm, fz_infinite_rect));
}

void mupdf_clip_stroke_path(fz_context *ctx, fz_device *device, fz_path *path, fz_stroke_state *stroke, fz_matrix ctm, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_clip_stroke_path(ctx, device, path, stroke, ctm, fz_infinite_rect));
}

void mupdf_fill_text(fz_context *ctx, fz_device *device, fz_text *text, fz_matrix ctm, fz_colorspace *cs, const float *color, float alpha, fz_color_params cp, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_fill_text(ctx, device, text, ctm, cs, color, alpha, cp));
}

void mupdf_stroke_text(fz_context *ctx, fz_device *device, fz_text *text, fz_stroke_state *stroke, fz_matrix ctm, fz_colorspace *cs, const float *color, float alpha, fz_color_params cp, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_stroke_text(ctx, device, text, stroke, ctm, cs, color, alpha, cp));
}

void mupdf_clip_text(fz_context *ctx, fz_device *device, fz_text *text, fz_matrix ctm, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_clip_text(ctx, device, text, ctm, fz_infinite_rect));
}

void mupdf_clip_stroke_text(fz_context *ctx, fz_device *device, fz_text *text, fz_stroke_state *stroke, fz_matrix ctm, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_clip_stroke_text(ctx, device, text, stroke, ctm, fz_infinite_rect));
}

void mupdf_ignore_text(fz_context *ctx, fz_device *device, fz_text *text, fz_matrix ctm, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_ignore_text(ctx, device, text, ctm));
}

void mupdf_fill_shade(fz_context *ctx, fz_device *device, fz_shade *shade, fz_matrix ctm, float alpha, fz_color_params cp, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_fill_shade(ctx, device, shade, ctm, alpha, cp));
}

void mupdf_fill_image(fz_context *ctx, fz_device *device, fz_image *image, fz_matrix ctm, float alpha, fz_color_params cp, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_fill_image(ctx, device, image, ctm, alpha, cp));
}

void mupdf_fill_image_mask(fz_context *ctx, fz_device *device, fz_image *image, fz_matrix ctm, fz_colorspace *cs, const float *color, float alpha, fz_color_params cp, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_fill_image_mask(ctx, device, image, ctm, cs, color, alpha, cp));
}

void mupdf_clip_image_mask(fz_context *ctx, fz_device *device, fz_image *image, fz_matrix ctm, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_clip_image_mask(ctx, device, image, ctm, fz_infinite_rect));
}

void mupdf_pop_clip(fz_context *ctx, fz_device *device, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_pop_clip(ctx, device));
}

void mupdf_begin_layer(fz_context *ctx, fz_device *device, const char *name, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_begin_layer(ctx, device, name));
}

void mupdf_end_layer(fz_context *ctx, fz_device *device, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_end_layer(ctx, device));
}

void mupdf_begin_structure(fz_context *ctx, fz_device *device, fz_structure standard, const char *raw, int idx, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_begin_structure(ctx, device, standard, raw, idx));
}

void mupdf_end_structure(fz_context *ctx, fz_device *device, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_end_structure(ctx, device));
}

void mupdf_begin_metatext(fz_context *ctx, fz_device *device, fz_metatext meta, const char *text, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_begin_metatext(ctx, device, meta, text));
}

void mupdf_end_metatext(fz_context *ctx, fz_device *device, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_end_metatext(ctx, device));
}

void mupdf_begin_mask(fz_context *ctx, fz_device *device, fz_rect area, bool luminosity, fz_colorspace *cs, const float *color, fz_color_params cp, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_begin_mask(ctx, device, area, luminosity, cs, color, cp));
}

void mupdf_end_mask(fz_context *ctx, fz_device *device, fz_function *fn, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_end_mask_tr(ctx, device, fn));
}

void mupdf_begin_group(fz_context *ctx, fz_device *device, fz_rect area, fz_colorspace *cs, bool isolated, bool knockout, int blendmode, float alpha, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_begin_group(ctx, device, area, cs, isolated, knockout, blendmode, alpha));
}

void mupdf_end_group(fz_context *ctx, fz_device *device, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_end_group(ctx, device));
}

int mupdf_begin_tile(fz_context *ctx, fz_device *device, fz_rect area, fz_rect view, float xstep, float ystep, fz_matrix ctm, int id, int doc_id, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, fz_begin_tile_tid(ctx, device, area, view, xstep, ystep, ctm, id, doc_id));
}

void mupdf_end_tile(fz_context *ctx, fz_device *device, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_end_tile(ctx, device));
}
