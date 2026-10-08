#include "internal.h"

/* PDFObject */
pdf_obj *mupdf_pdf_clone_obj(fz_context *ctx, pdf_obj *self, mupdf_error_t **errptr)
{
    TRY_CATCH(pdf_obj*, NULL, pdf_deep_copy_obj(ctx, self));
}

pdf_document *mupdf_pdf_get_bound_document(fz_context *ctx, pdf_obj *obj)
{
    pdf_document *pdf = NULL;
    fz_try(ctx)
    {
        pdf = pdf_get_bound_document(ctx, obj);
        pdf_keep_document(ctx, pdf);
    }
    fz_catch(ctx)
    {
    }
    return pdf;
}

bool mupdf_pdf_is_indirect(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    int b = 0;
    fz_try(ctx)
    {
        b = pdf_is_indirect(ctx, obj);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return b ? true : false;
}

bool mupdf_pdf_is_null(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    int b = 0;
    fz_try(ctx)
    {
        b = pdf_is_null(ctx, obj);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return b ? true : false;
}

bool mupdf_pdf_is_bool(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    int b = 0;
    fz_try(ctx)
    {
        b = pdf_is_bool(ctx, obj);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return b ? true : false;
}

bool mupdf_pdf_is_int(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    int b = 0;
    fz_try(ctx)
    {
        b = pdf_is_int(ctx, obj);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return b ? true : false;
}

bool mupdf_pdf_is_real(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    int b = 0;
    fz_try(ctx)
    {
        b = pdf_is_real(ctx, obj);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return b ? true : false;
}

bool mupdf_pdf_is_number(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    int b = 0;
    fz_try(ctx)
    {
        b = pdf_is_number(ctx, obj);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return b ? true : false;
}

bool mupdf_pdf_is_string(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    int b = 0;
    fz_try(ctx)
    {
        b = pdf_is_string(ctx, obj);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return b ? true : false;
}

bool mupdf_pdf_is_name(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    int b = 0;
    fz_try(ctx)
    {
        b = pdf_is_name(ctx, obj);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return b ? true : false;
}

bool mupdf_pdf_is_array(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    int b = 0;
    fz_try(ctx)
    {
        b = pdf_is_array(ctx, obj);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return b ? true : false;
}

bool mupdf_pdf_is_dict(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    int b = 0;
    fz_try(ctx)
    {
        b = pdf_is_dict(ctx, obj);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return b ? true : false;
}

bool mupdf_pdf_is_stream(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    int b = 0;
    fz_try(ctx)
    {
        b = pdf_is_stream(ctx, obj);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return b ? true : false;
}

pdf_obj *mupdf_pdf_new_null()
{
    return PDF_NULL;
}

pdf_obj *mupdf_pdf_new_bool(bool b)
{
    return b ? PDF_TRUE : PDF_FALSE;
}

pdf_obj *mupdf_pdf_new_int(fz_context *ctx, int i, mupdf_error_t **errptr)
{
    TRY_CATCH(pdf_obj*, NULL, pdf_new_int(ctx, i));
}

pdf_obj *mupdf_pdf_new_real(fz_context *ctx, float f, mupdf_error_t **errptr)
{
        TRY_CATCH(pdf_obj*, NULL, pdf_new_real(ctx, f));
}

pdf_obj *mupdf_pdf_new_string(fz_context *ctx, const char *s, mupdf_error_t **errptr)
{
    TRY_CATCH(pdf_obj*, NULL, pdf_new_text_string(ctx, s));
}

pdf_obj *mupdf_pdf_new_name(fz_context *ctx, const char *name, mupdf_error_t **errptr)
{
    TRY_CATCH(pdf_obj*, NULL, pdf_new_name(ctx, name));
}

pdf_obj *mupdf_pdf_new_indirect(fz_context *ctx, pdf_document *pdf, int num, int gen, mupdf_error_t **errptr)
{
    TRY_CATCH(pdf_obj*, NULL, pdf_new_indirect(ctx, pdf, num, gen));
}

pdf_obj *mupdf_pdf_new_array(fz_context *ctx, pdf_document *pdf, int capacity, mupdf_error_t **errptr)
{
    TRY_CATCH(pdf_obj*, NULL, pdf_new_array(ctx, pdf, capacity));
}

pdf_obj *mupdf_pdf_new_dict(fz_context *ctx, pdf_document *pdf, int capacity, mupdf_error_t **errptr)
{
    TRY_CATCH(pdf_obj*, NULL, pdf_new_dict(ctx, pdf, capacity));
}

pdf_obj *mupdf_pdf_obj_from_str(fz_context *ctx, pdf_document *pdf, const char *src, mupdf_error_t **errptr)
{
    pdf_obj *obj = NULL;
    pdf_lexbuf lexbuf;
    fz_stream *stream = fz_open_memory(ctx, (unsigned char *)src, strlen(src));
    pdf_lexbuf_init(ctx, &lexbuf, PDF_LEXBUF_SMALL);
    fz_var(stream);
    fz_try(ctx)
    {
        obj = pdf_parse_stm_obj(ctx, pdf, stream, &lexbuf);
    }
    fz_always(ctx)
    {
        pdf_lexbuf_fin(ctx, &lexbuf);
        fz_drop_stream(ctx, stream);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return obj;
}

bool mupdf_pdf_to_bool(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    TRY_CATCH(bool, false, pdf_to_bool(ctx, obj));
}

int mupdf_pdf_to_int(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, pdf_to_int(ctx, obj));
}

float mupdf_pdf_to_float(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    TRY_CATCH(float, 0.0, pdf_to_real(ctx, obj));
}

int mupdf_pdf_to_indirect(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, pdf_to_num(ctx, obj));
}

const char *mupdf_pdf_to_string(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    TRY_CATCH(const char *, NULL, pdf_to_text_string(ctx, obj));
}

const char *mupdf_pdf_to_name(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    TRY_CATCH(const char*, NULL, pdf_to_name(ctx, obj));
}

const unsigned char *mupdf_pdf_to_bytes(fz_context *ctx, pdf_obj *obj, size_t *len, mupdf_error_t **errptr)
{
    TRY_CATCH(const unsigned char*, NULL, (const unsigned char *)pdf_to_string(ctx, obj, len));
}

pdf_obj *mupdf_pdf_resolve_indirect(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    pdf_obj *ind = NULL;
    fz_try(ctx)
    {
        ind = pdf_resolve_indirect(ctx, obj);
        pdf_keep_obj(ctx, ind);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return ind;
}

pdf_obj *mupdf_pdf_array_get(fz_context *ctx, pdf_obj *obj, int index, mupdf_error_t **errptr)
{
    pdf_obj *val = NULL;
    fz_try(ctx)
    {
        val = pdf_array_get(ctx, obj, index);
        pdf_keep_obj(ctx, val);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return val;
}

pdf_obj *mupdf_pdf_dict_get_val(fz_context *ctx, pdf_obj *obj, int idx, mupdf_error_t **errptr)
{
    pdf_obj *val = NULL;
    fz_try(ctx)
    {
        val = pdf_dict_get_val(ctx, obj, idx);
        pdf_keep_obj(ctx, val);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return val;
}

pdf_obj *mupdf_pdf_dict_get_key(fz_context *ctx, pdf_obj *obj, int idx, mupdf_error_t **errptr)
{
    pdf_obj *val = NULL;
    fz_try(ctx)
    {
        val = pdf_dict_get_key(ctx, obj, idx);
        pdf_keep_obj(ctx, val);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return val;
}

pdf_obj *mupdf_pdf_dict_get(fz_context *ctx, pdf_obj *obj, pdf_obj *key, mupdf_error_t **errptr)
{
    pdf_obj *val = NULL;
    fz_try(ctx)
    {
        val = pdf_dict_get(ctx, obj, key);
        pdf_keep_obj(ctx, val);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return val;
}

pdf_obj *mupdf_pdf_dict_get_inheritable(fz_context *ctx, pdf_obj *obj, pdf_obj *key, mupdf_error_t **errptr)
{
    pdf_obj *val = NULL;
    fz_try(ctx)
    {
        val = pdf_dict_get_inheritable(ctx, obj, key);
        pdf_keep_obj(ctx, val);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return val;
}

fz_buffer *mupdf_pdf_read_stream(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_buffer*, NULL, pdf_load_stream(ctx, obj));
}

fz_buffer *mupdf_pdf_read_raw_stream(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_buffer*, NULL, pdf_load_raw_stream(ctx, obj));
}

void mupdf_pdf_write_object(fz_context *ctx, pdf_obj *self, pdf_obj *obj, mupdf_error_t **errptr)
{
    pdf_document *pdf = pdf_get_bound_document(ctx, self);
    if (!pdf)
    {
        *errptr = mupdf_new_error_from_str("object not bound to document");
        return;
    }

    TRY_CATCH_VOID(pdf_update_object(ctx, pdf, pdf_to_num(ctx, self), obj));
}

void mupdf_pdf_write_stream_buffer(fz_context *ctx, pdf_obj *obj, fz_buffer *buf, int compressed, mupdf_error_t **errptr)
{
    pdf_document *pdf = pdf_get_bound_document(ctx, obj);
    if (!pdf)
    {
        *errptr = mupdf_new_error_from_str("object not bound to document");
        return;
    }

    TRY_CATCH_VOID(pdf_update_stream(ctx, pdf, obj, buf, compressed));
}

pdf_obj *mupdf_pdf_copy_array(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    TRY_CATCH(pdf_obj*, NULL, pdf_copy_array(ctx, obj));
}

pdf_obj *mupdf_pdf_copy_dict(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    TRY_CATCH(pdf_obj*, NULL, pdf_copy_dict(ctx, obj));
}

int mupdf_pdf_array_len(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, pdf_array_len(ctx, obj));
}

void mupdf_pdf_array_put(fz_context *ctx, pdf_obj *self, int i, pdf_obj *item, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_array_put(ctx, self, i, item));
}

void mupdf_pdf_array_push(fz_context *ctx, pdf_obj *self, pdf_obj *item, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_array_push(ctx, self, item));
}

void mupdf_pdf_array_delete(fz_context *ctx, pdf_obj *self, int i, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_array_delete(ctx, self, i));
}

int mupdf_pdf_dict_len(fz_context *ctx, pdf_obj *obj, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, pdf_dict_len(ctx, obj));
}

void mupdf_pdf_dict_put(fz_context *ctx, pdf_obj *self, pdf_obj *key, pdf_obj *value, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_dict_put(ctx, self, key, value));
}

void mupdf_pdf_dict_delete(fz_context *ctx, pdf_obj *self, pdf_obj *key, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_dict_del(ctx, self, key));
}

char *mupdf_pdf_obj_to_string(fz_context *ctx, pdf_obj *obj, bool tight, bool ascii, mupdf_error_t **errptr)
{
    char *s = NULL;
    size_t n = 0;
    fz_var(s);
    fz_try(ctx)
    {
        s = pdf_sprint_obj(ctx, NULL, 0, &n, obj, tight, ascii);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return s;
}
