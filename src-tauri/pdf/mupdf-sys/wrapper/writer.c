#include "internal.h"

fz_document_writer *mupdf_new_document_writer(fz_context *ctx, const char *filename, const char *format, const char *options, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_document_writer*, NULL, fz_new_document_writer(ctx, filename, format, options));
}

fz_document_writer *mupdf_new_pdfocr_writer(fz_context *ctx, const char *path, const char *options, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_document_writer*, NULL, fz_new_pdfocr_writer(ctx, path, options));
}

fz_device *mupdf_document_writer_begin_page(fz_context *ctx, fz_document_writer *writer, fz_rect mediabox, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_device*, NULL, fz_begin_page(ctx, writer, mediabox));
}

void mupdf_document_writer_end_page(fz_context *ctx, fz_document_writer *writer, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_end_page(ctx, writer));
}
