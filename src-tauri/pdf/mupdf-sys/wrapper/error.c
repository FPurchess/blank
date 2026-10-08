#include "internal.h"

void mupdf_save_error(fz_context *ctx, mupdf_error_t **errptr)
{
    assert(errptr != NULL);
    int type = fz_caught(ctx);
    const char *message = fz_caught_message(ctx);
    mupdf_error_t *err = malloc(sizeof(mupdf_error_t));
    err->type = type;
    err->message = strdup(message);
    *errptr = err;
}

mupdf_error_t *mupdf_new_error_from_str(const char *message)
{
    mupdf_error_t *err = malloc(sizeof(mupdf_error_t));
    err->type = FZ_ERROR_GENERIC;
    err->message = strdup(message);
    return err;
}

void mupdf_drop_error(mupdf_error_t *err)
{
    if (err == NULL)
    {
        return;
    }
    if (err->message != NULL)
    {
        free(err->message);
    }
    free(err);
}

void mupdf_drop_str(char *s)
{
    if (s != NULL)
    {
        free(s);
    }
}
