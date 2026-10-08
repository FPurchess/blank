#include "internal.h"

/* Font */
fz_font *mupdf_new_font(fz_context *ctx, const char *name, int index, mupdf_error_t **errptr)
{
    fz_font *font = NULL;
    fz_try(ctx)
    {
        const unsigned char *data;
        int size;

        data = fz_lookup_base14_font(ctx, name, &size);
        if (data)
        {
            font = fz_new_font_from_memory(ctx, name, data, size, index, 0);
        }
        else
        {
            font = fz_new_font_from_file(ctx, name, name, index, 0);
        }
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return font;
}

fz_font *mupdf_new_font_from_buffer(fz_context *ctx, const char *name, int index, fz_buffer *buffer, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_font*, NULL, fz_new_font_from_buffer(ctx, name, buffer, index, 0));
}

fz_font *mupdf_new_font_from_memory(fz_context *ctx, const char *name, int index, const unsigned char *data, int len, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_font*, NULL, fz_new_font_from_memory(ctx, name, data, len, index, 0));
}

fz_font *mupdf_new_cjk_font(fz_context *ctx, int ordering, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_font*, NULL, fz_new_cjk_font(ctx, ordering));
}

int mupdf_encode_character(fz_context *ctx, fz_font *font, int unicode, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, fz_encode_character(ctx, font, unicode));
}

float mupdf_advance_glyph(fz_context *ctx, fz_font *font, int glyph, bool wmode, mupdf_error_t **errptr)
{
    TRY_CATCH(float, 0.0, fz_advance_glyph(ctx, font, glyph, wmode));
}

fz_path *mupdf_outline_glyph(fz_context *ctx, fz_font *font, int glyph, fz_matrix ctm, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_path*, NULL, fz_outline_glyph(ctx, font, glyph, ctm));
}
