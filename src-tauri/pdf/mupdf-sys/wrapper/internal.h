#ifndef WRAPPER_INTERNAL_H
#define WRAPPER_INTERNAL_H

#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

#ifdef _WIN32
#include <windows.h>
#else
#include <pthread.h>
#endif

#include "mupdf/fitz.h"
#include "mupdf/ucdn.h"
#include "mupdf/pdf.h"

/* Error type definition */
typedef struct mupdf_error
{
    int type;
    char *message;
} mupdf_error_t;

/* TRY_CATCH macro - execute call and save error on exception */
#define TRY_CATCH(ty, init, call) \
do { \
    ty result = init; \
    fz_try(ctx) \
    { \
        result = call; \
    } \
    fz_catch(ctx) \
    { \
        mupdf_save_error(ctx, errptr); \
    } \
    return result; \
} while (0)

/* TRY_CATCH_VOID macro - for void-returning functions */
#define TRY_CATCH_VOID(call) \
do { \
    fz_try(ctx) \
    { \
        call; \
    } \
    fz_catch(ctx) \
    { \
        mupdf_save_error(ctx, errptr); \
    } \
} while (0)

/* Internal error handling functions */
void mupdf_save_error(fz_context *ctx, mupdf_error_t **errptr);
mupdf_error_t *mupdf_new_error_from_str(const char *message);

#endif /* WRAPPER_INTERNAL_H */
