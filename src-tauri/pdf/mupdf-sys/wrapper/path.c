#include "internal.h"

/* Path */
fz_path *mupdf_new_path(fz_context *ctx, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_path*, NULL, fz_new_path(ctx));
}

fz_path *mupdf_clone_path(fz_context *ctx, fz_path *old_path, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_path*, NULL, fz_clone_path(ctx, old_path));
}

void mupdf_trim_path(fz_context *ctx, fz_path *path, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_trim_path(ctx, path));
}

void mupdf_moveto(fz_context *ctx, fz_path *path, float x, float y, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_moveto(ctx, path, x, y));
}

void mupdf_lineto(fz_context *ctx, fz_path *path, float x, float y, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_lineto(ctx, path, x, y));
}

void mupdf_closepath(fz_context *ctx, fz_path *path, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_closepath(ctx, path));
}

void mupdf_rectto(fz_context *ctx, fz_path *path, float x1, float y1, float x2, float y2, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_rectto(ctx, path, x1, y1, x2, y2));
}

void mupdf_curveto(fz_context *ctx, fz_path *path, float cx1, float cy1, float cx2, float cy2, float ex, float ey, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_curveto(ctx, path, cx1, cy1, cx2, cy2, ex, ey));
}

void mupdf_curvetov(fz_context *ctx, fz_path *path, float cx, float cy, float ex, float ey, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_curvetov(ctx, path, cx, cy, ex, ey));
}

void mupdf_curvetoy(fz_context *ctx, fz_path *path, float cx, float cy, float ex, float ey, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_curvetoy(ctx, path, cx, cy, ex, ey));
}

void mupdf_transform_path(fz_context *ctx, fz_path *path, fz_matrix ctm, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_transform_path(ctx, path, ctm));
}

fz_rect mupdf_bound_path(fz_context *ctx, fz_path *path, fz_stroke_state *stroke, fz_matrix ctm, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_rect, {}, fz_bound_path(ctx, path, stroke, ctm));
}

void mupdf_walk_path(fz_context *ctx, const fz_path *path, const fz_path_walker *walker, void *arg, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_walk_path(ctx, path, walker, arg));
}
