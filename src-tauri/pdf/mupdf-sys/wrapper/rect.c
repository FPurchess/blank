#include "internal.h"

/* Rect */
fz_rect mupdf_adjust_rect_for_stroke(fz_context *ctx, fz_rect self, fz_stroke_state *stroke, fz_matrix ctm, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_rect, {}, fz_adjust_rect_for_stroke(ctx, self, stroke, ctm));
}
