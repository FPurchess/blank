#include "internal.h"

/* Text */
fz_text *mupdf_new_text(fz_context *ctx, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_text*, NULL, fz_new_text(ctx));
}

/* StrokeState */
fz_stroke_state *mupdf_default_stroke_state(fz_context *ctx)
{
    fz_stroke_state *stroke = NULL;
    stroke = fz_clone_stroke_state(ctx, (fz_stroke_state *)&fz_default_stroke_state);
    return stroke;
}

fz_stroke_state *mupdf_new_stroke_state(
    fz_context *ctx, fz_linecap start_cap, fz_linecap dash_cap, fz_linecap end_cap, fz_linejoin line_join, float line_width,
    float miter_limit, float dash_phase, const float dash[], int dash_len, mupdf_error_t **errptr)
{
    fz_stroke_state *stroke = NULL;
    fz_try(ctx)
    {
        stroke = fz_new_stroke_state_with_dash_len(ctx, dash_len);
        stroke->start_cap = start_cap;
        stroke->dash_cap = dash_cap;
        stroke->end_cap = end_cap;
        stroke->linejoin = line_join;
        stroke->linewidth = line_width;
        stroke->miterlimit = miter_limit;
        stroke->dash_phase = dash_phase;
        stroke->dash_len = dash_len;
        memcpy(stroke->dash_list, dash, dash_len);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return stroke;
}

fz_rect mupdf_bound_text(fz_context *ctx, fz_text *text, fz_stroke_state *stroke, fz_matrix ctm, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_rect, {}, fz_bound_text(ctx, text, stroke, ctm));
}
