#include "internal.h"

pdf_annot *mupdf_pdf_create_annot(fz_context *ctx, pdf_page *page, int subtype, mupdf_error_t **errptr)
{
    TRY_CATCH(pdf_annot*, NULL, pdf_create_annot(ctx, page, subtype));
}

void mupdf_pdf_delete_annot(fz_context *ctx, pdf_page *page, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_delete_annot(ctx, page, annot));
}

bool mupdf_pdf_update_page(fz_context *ctx, pdf_page *page, mupdf_error_t **errptr)
{
    TRY_CATCH(bool, false, pdf_update_page(ctx, page));
}

bool mupdf_pdf_redact_page(fz_context *ctx, pdf_page *page, mupdf_error_t **errptr)
{
    TRY_CATCH(bool, false, pdf_redact_page(ctx, page->doc, page, NULL));
}

bool mupdf_pdf_redact_page_with_options(fz_context *ctx, pdf_page *page, pdf_redact_options *opts, mupdf_error_t **errptr)
{
    TRY_CATCH(bool, false, pdf_redact_page(ctx, page->doc, page, opts));
}

void mupdf_pdf_filter_page_contents(fz_context *ctx, pdf_page *page, pdf_filter_options *filter, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_filter_page_contents(ctx, page->doc, page, filter));
}

void mupdf_pdf_page_set_rotation(fz_context *ctx, pdf_page *page, int rotation, mupdf_error_t **errptr)
{
    if (rotation % 90)
    {
        *errptr = mupdf_new_error_from_str("rotation not multiple of 90");
        return;
    }
    TRY_CATCH_VOID(pdf_dict_put_int(ctx, page->obj, PDF_NAME(Rotate), (int64_t)rotation));
}

void mupdf_pdf_page_set_crop_box(fz_context *ctx, pdf_page *page, fz_rect rect, mupdf_error_t **errptr)
{
    fz_try(ctx)
    {
        fz_rect mediabox = pdf_bound_page(ctx, page, FZ_MEDIA_BOX);
        pdf_obj *obj = pdf_dict_get_inheritable(ctx, page->obj, PDF_NAME(MediaBox));
        if (obj)
        {
            mediabox = pdf_to_rect(ctx, obj);
        }
        fz_rect cropbox = fz_empty_rect;
        cropbox.x0 = rect.x0;
        cropbox.y0 = mediabox.y1 - rect.y1;
        cropbox.x1 = rect.x1;
        cropbox.y1 = mediabox.y1 - rect.y0;
        pdf_dict_put_drop(ctx, page->obj, PDF_NAME(CropBox), pdf_new_rect(ctx, page->doc, cropbox));
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
}

fz_point mupdf_pdf_page_crop_box_position(fz_context *ctx, pdf_page *page)
{
    fz_point pos = fz_make_point(0, 0);
    pdf_obj *obj = pdf_dict_get_inheritable(ctx, page->obj, PDF_NAME(CropBox));
    if (!obj)
    {
        return pos;
    }
    fz_rect cbox = pdf_to_rect(ctx, obj);
    pos = fz_make_point(cbox.x0, cbox.y0);
    return pos;
}

fz_rect mupdf_pdf_page_media_box(fz_context *ctx, pdf_page *page)
{
    fz_rect r = fz_empty_rect;
    pdf_obj *obj = pdf_dict_get_inheritable(ctx, page->obj, PDF_NAME(MediaBox));
    if (!obj)
    {
        return r;
    }
    r = pdf_to_rect(ctx, obj);
    return r;
}

fz_matrix mupdf_pdf_page_transform(fz_context *ctx, pdf_page *page, mupdf_error_t **errptr)
{
    fz_matrix ctm = fz_identity;
    fz_try(ctx)
    {
        pdf_page_transform(ctx, page, NULL, &ctm);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return ctm;
}

fz_matrix mupdf_pdf_page_obj_transform(fz_context *ctx, pdf_obj *page, mupdf_error_t **errptr)
{
    fz_matrix ctm = fz_identity;
    fz_try(ctx)
    {
        pdf_page_obj_transform(ctx, page, NULL, &ctm);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return ctm;
}
