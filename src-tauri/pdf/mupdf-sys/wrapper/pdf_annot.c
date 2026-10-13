#include "internal.h"

int mupdf_pdf_annot_type(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, pdf_annot_type(ctx, annot));
}

fz_rect mupdf_pdf_bound_annot(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_rect, fz_make_rect(0, 0, 0, 0), pdf_bound_annot(ctx, annot));
}

int mupdf_pdf_update_annot(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, pdf_update_annot(ctx, annot));
}

pdf_annot *mupdf_pdf_first_widget(fz_context *ctx, pdf_page *page, mupdf_error_t **errptr)
{
    TRY_CATCH(pdf_annot*, NULL, pdf_first_widget(ctx, page));
}

pdf_annot *mupdf_pdf_next_widget(fz_context *ctx, pdf_annot *previous, mupdf_error_t **errptr)
{
    TRY_CATCH(pdf_annot*, NULL, pdf_next_widget(ctx, previous));
}

pdf_annot *mupdf_pdf_create_signature_widget(fz_context *ctx, pdf_page *page, const char *name, mupdf_error_t **errptr)
{
    TRY_CATCH(pdf_annot*, NULL, pdf_create_signature_widget(ctx, page, (char *)name));
}

int mupdf_pdf_update_widget(fz_context *ctx, pdf_annot *widget, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, pdf_update_widget(ctx, widget));
}

enum pdf_widget_type mupdf_pdf_widget_type(fz_context *ctx, pdf_annot *widget, mupdf_error_t **errptr)
{
    TRY_CATCH(enum pdf_widget_type, PDF_WIDGET_TYPE_UNKNOWN, pdf_widget_type(ctx, widget));
}

int mupdf_pdf_widget_is_signed(fz_context *ctx, pdf_annot *widget, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, pdf_widget_is_signed(ctx, widget));
}

int mupdf_pdf_widget_is_readonly(fz_context *ctx, pdf_annot *widget, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, pdf_widget_is_readonly(ctx, widget));
}

char *mupdf_pdf_load_widget_field_name(fz_context *ctx, pdf_annot *widget, mupdf_error_t **errptr)
{
    TRY_CATCH(char*, NULL, pdf_load_field_name(ctx, pdf_annot_obj(ctx, widget)));
}

const char *mupdf_pdf_widget_field_type_string(fz_context *ctx, pdf_annot *widget, mupdf_error_t **errptr)
{
    TRY_CATCH(const char*, NULL, pdf_field_type_string(ctx, pdf_annot_obj(ctx, widget)));
}

int mupdf_pdf_widget_field_flags(fz_context *ctx, pdf_annot *widget, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, pdf_field_flags(ctx, pdf_annot_obj(ctx, widget)));
}

const char *mupdf_pdf_widget_field_value(fz_context *ctx, pdf_annot *widget, mupdf_error_t **errptr)
{
    TRY_CATCH(const char*, NULL, pdf_field_value(ctx, pdf_annot_obj(ctx, widget)));
}

const char *mupdf_pdf_widget_field_label(fz_context *ctx, pdf_annot *widget, mupdf_error_t **errptr)
{
    TRY_CATCH(const char*, NULL, pdf_field_label(ctx, pdf_annot_obj(ctx, widget)));
}

int mupdf_pdf_set_widget_field_value(fz_context *ctx, pdf_document *doc, pdf_annot *widget, const char *value, int ignore_trigger_events, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, pdf_set_field_value(ctx, doc, pdf_annot_obj(ctx, widget), value, ignore_trigger_events));
}

void mupdf_pdf_reset_widget_field(fz_context *ctx, pdf_document *doc, pdf_annot *widget, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_field_reset(ctx, doc, pdf_annot_obj(ctx, widget)));
}

pdf_obj *mupdf_pdf_add_embedded_file(fz_context *ctx, pdf_document *doc, const char *filename, const char *mimetype, fz_buffer *contents, int64_t created, int64_t modified, int add_checksum, mupdf_error_t **errptr)
{
    TRY_CATCH(pdf_obj*, NULL, pdf_add_embedded_file(ctx, doc, filename, mimetype, contents, created, modified, add_checksum));
}

int mupdf_pdf_is_embedded_file(fz_context *ctx, pdf_obj *fs, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, pdf_is_embedded_file(ctx, fs));
}

pdf_filespec_params mupdf_pdf_get_filespec_params(fz_context *ctx, pdf_obj *fs, mupdf_error_t **errptr)
{
    pdf_filespec_params params = {0};
    params.created = -1;
    params.modified = -1;
    fz_try(ctx)
    {
        pdf_get_filespec_params(ctx, fs, &params);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return params;
}

fz_buffer *mupdf_pdf_load_embedded_file_contents(fz_context *ctx, pdf_obj *fs, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_buffer*, NULL, pdf_load_embedded_file_contents(ctx, fs));
}

int mupdf_pdf_verify_embedded_file_checksum(fz_context *ctx, pdf_obj *fs, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, pdf_verify_embedded_file_checksum(ctx, fs));
}

bool mupdf_pdf_apply_redaction(fz_context *ctx, pdf_annot *annot, pdf_redact_options *opts, mupdf_error_t **errptr)
{
    TRY_CATCH(bool, false, pdf_apply_redaction(ctx, annot, opts));
}

pdf_obj *mupdf_pdf_annot_obj(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
  TRY_CATCH(pdf_obj *, NULL, pdf_annot_obj(ctx, annot));
}

const char *mupdf_pdf_annot_author(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH(const char *, NULL, pdf_annot_author(ctx, annot));
}

const char *mupdf_pdf_annot_contents(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH(const char *, NULL, pdf_annot_contents(ctx, annot));
}

void mupdf_pdf_set_annot_contents(fz_context *ctx, pdf_annot *annot, const char *text, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_contents(ctx, annot, text));
}

void mupdf_pdf_set_annot_author(fz_context *ctx, pdf_annot *annot, const char *author, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_author(ctx, annot, author));
}

void mupdf_pdf_set_annot_line(fz_context *ctx, pdf_annot *annot, fz_point a, fz_point b, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_line(ctx, annot, a, b));
}

void mupdf_pdf_set_annot_rect(fz_context *ctx, pdf_annot *annot, fz_rect rect, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_rect(ctx, annot, rect));
}

fz_rect mupdf_pdf_annot_rect(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_rect, fz_make_rect(0, 0, 0, 0), pdf_annot_rect(ctx, annot));
}

fz_rect mupdf_pdf_annot_display_rect(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_rect, fz_make_rect(0, 0, 0, 0), pdf_annot_display_rect(ctx, annot));
}

int mupdf_pdf_annot_flags(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, pdf_annot_flags(ctx, annot));
}

int mupdf_pdf_annot_color(fz_context *ctx, pdf_annot *annot, float color[4], mupdf_error_t **errptr)
{
    int n = 0;
    fz_try(ctx)
    {
        pdf_annot_color(ctx, annot, &n, color);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return n;
}

int mupdf_pdf_annot_interior_color(fz_context *ctx, pdf_annot *annot, float color[4], mupdf_error_t **errptr)
{
    int n = 0;
    fz_try(ctx)
    {
        pdf_annot_interior_color(ctx, annot, &n, color);
    }
    fz_catch(ctx)
    {
        mupdf_save_error(ctx, errptr);
    }
    return n;
}

float mupdf_pdf_annot_border_width(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH(float, 0, pdf_annot_border_width(ctx, annot));
}

enum pdf_border_style mupdf_pdf_annot_border_style(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH(enum pdf_border_style, PDF_BORDER_STYLE_SOLID, pdf_annot_border_style(ctx, annot));
}

int mupdf_pdf_annot_border_dash_count(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, pdf_annot_border_dash_count(ctx, annot));
}

float mupdf_pdf_annot_border_dash_item(fz_context *ctx, pdf_annot *annot, int i, mupdf_error_t **errptr)
{
    TRY_CATCH(float, 0, pdf_annot_border_dash_item(ctx, annot, i));
}

enum pdf_border_effect mupdf_pdf_annot_border_effect(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH(enum pdf_border_effect, PDF_BORDER_EFFECT_NONE, pdf_annot_border_effect(ctx, annot));
}

float mupdf_pdf_annot_border_effect_intensity(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH(float, 0, pdf_annot_border_effect_intensity(ctx, annot));
}

float mupdf_pdf_annot_opacity(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH(float, 1, pdf_annot_opacity(ctx, annot));
}

int mupdf_pdf_annot_quadding(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, pdf_annot_quadding(ctx, annot));
}

int mupdf_pdf_annot_has_quad_points(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, pdf_annot_has_quad_points(ctx, annot));
}

int mupdf_pdf_annot_quad_point_count(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, pdf_annot_quad_point_count(ctx, annot));
}

fz_quad mupdf_pdf_annot_quad_point(fz_context *ctx, pdf_annot *annot, int i, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_quad, fz_make_quad(0, 0, 0, 0, 0, 0, 0, 0), pdf_annot_quad_point(ctx, annot, i));
}

int mupdf_pdf_annot_ink_list_count(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, pdf_annot_ink_list_count(ctx, annot));
}

int mupdf_pdf_annot_ink_list_stroke_count(fz_context *ctx, pdf_annot *annot, int i, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, pdf_annot_ink_list_stroke_count(ctx, annot, i));
}

fz_point mupdf_pdf_annot_ink_list_stroke_vertex(fz_context *ctx, pdf_annot *annot, int i, int k, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_point, fz_make_point(0, 0), pdf_annot_ink_list_stroke_vertex(ctx, annot, i, k));
}

void mupdf_pdf_set_annot_color(fz_context *ctx, pdf_annot *annot, int n, const float *color, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_color(ctx, annot, n, color));
}

void mupdf_pdf_set_annot_interior_color(fz_context *ctx, pdf_annot *annot, int n, const float *color, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_interior_color(ctx, annot, n, color));
}

void mupdf_pdf_set_annot_flags(fz_context *ctx, pdf_annot *annot, int flags, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_flags(ctx, annot, flags));
}

void mupdf_pdf_set_annot_border_style(fz_context *ctx, pdf_annot *annot, enum pdf_border_style style, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_border_style(ctx, annot, style));
}

void mupdf_pdf_clear_annot_border_dash(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_clear_annot_border_dash(ctx, annot));
}

void mupdf_pdf_add_annot_border_dash_item(fz_context *ctx, pdf_annot *annot, float length, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_add_annot_border_dash_item(ctx, annot, length));
}

void mupdf_pdf_set_annot_border_effect(fz_context *ctx, pdf_annot *annot, enum pdf_border_effect effect, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_border_effect(ctx, annot, effect));
}

void mupdf_pdf_set_annot_border_effect_intensity(fz_context *ctx, pdf_annot *annot, float intensity, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_border_effect_intensity(ctx, annot, intensity));
}

void mupdf_pdf_set_annot_opacity(fz_context *ctx, pdf_annot *annot, float opacity, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_opacity(ctx, annot, opacity));
}

void mupdf_pdf_set_annot_quadding(fz_context *ctx, pdf_annot *annot, int q, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_quadding(ctx, annot, q));
}

void mupdf_pdf_set_annot_quad_points(fz_context *ctx, pdf_annot *annot, int n, const fz_quad *qv, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_quad_points(ctx, annot, n, qv));
}

void mupdf_pdf_clear_annot_quad_points(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_clear_annot_quad_points(ctx, annot));
}

void mupdf_pdf_add_annot_quad_point(fz_context *ctx, pdf_annot *annot, fz_quad quad, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_add_annot_quad_point(ctx, annot, quad));
}

void mupdf_pdf_set_annot_ink_list(fz_context *ctx, pdf_annot *annot, int n, const int *count, const fz_point *v, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_ink_list(ctx, annot, n, count, v));
}

void mupdf_pdf_clear_annot_ink_list(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_clear_annot_ink_list(ctx, annot));
}

void mupdf_pdf_add_annot_ink_list_stroke(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_add_annot_ink_list_stroke(ctx, annot));
}

void mupdf_pdf_add_annot_ink_list_stroke_vertex(fz_context *ctx, pdf_annot *annot, fz_point p, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_add_annot_ink_list_stroke_vertex(ctx, annot, p));
}

void mupdf_pdf_set_annot_popup(fz_context *ctx, pdf_annot *annot, fz_rect rect, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_popup(ctx, annot, rect));
}

void mupdf_pdf_set_annot_active(fz_context *ctx, pdf_annot *annot, int active, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_active(ctx, annot, active));
}

void mupdf_pdf_set_annot_border_width(fz_context *ctx, pdf_annot *annot, float width, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_border_width(ctx, annot, width));
}

void mupdf_pdf_set_annot_intent(fz_context *ctx, pdf_annot *annot, enum pdf_intent intent, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_intent(ctx, annot, intent));
}

const char *mupdf_pdf_annot_icon_name(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH(const char *, NULL, pdf_annot_icon_name(ctx, annot));
}

void mupdf_pdf_set_annot_icon_name(fz_context *ctx, pdf_annot *annot, const char *name, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_icon_name(ctx, annot, name));
}

int mupdf_pdf_annot_is_open(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, pdf_annot_is_open(ctx, annot));
}

void mupdf_pdf_set_annot_is_open(fz_context *ctx, pdf_annot *annot, int is_open, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_is_open(ctx, annot, is_open));
}

void mupdf_pdf_annot_line(fz_context *ctx, pdf_annot *annot, fz_point *a, fz_point *b, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_annot_line(ctx, annot, a, b));
}

void mupdf_pdf_annot_line_ending_styles(fz_context *ctx, pdf_annot *annot, enum pdf_line_ending *start_style, enum pdf_line_ending *end_style, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_annot_line_ending_styles(ctx, annot, start_style, end_style));
}

void mupdf_pdf_set_annot_line_ending_styles(fz_context *ctx, pdf_annot *annot, enum pdf_line_ending start_style, enum pdf_line_ending end_style, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_line_ending_styles(ctx, annot, start_style, end_style));
}

int mupdf_pdf_annot_vertex_count(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, pdf_annot_vertex_count(ctx, annot));
}

fz_point mupdf_pdf_annot_vertex(fz_context *ctx, pdf_annot *annot, int i, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_point, fz_make_point(0, 0), pdf_annot_vertex(ctx, annot, i));
}

void mupdf_pdf_set_annot_vertices(fz_context *ctx, pdf_annot *annot, int n, const fz_point *v, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_vertices(ctx, annot, n, v));
}

void mupdf_pdf_clear_annot_vertices(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_clear_annot_vertices(ctx, annot));
}

void mupdf_pdf_add_annot_vertex(fz_context *ctx, pdf_annot *annot, fz_point p, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_add_annot_vertex(ctx, annot, p));
}

void mupdf_pdf_set_annot_vertex(fz_context *ctx, pdf_annot *annot, int i, fz_point p, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_vertex(ctx, annot, i, p));
}

int mupdf_pdf_annot_has_default_appearance(fz_context *ctx, pdf_annot *annot, mupdf_error_t **errptr)
{
    TRY_CATCH(int, 0, pdf_annot_has_default_appearance(ctx, annot));
}

void mupdf_pdf_annot_default_appearance_unmapped(fz_context *ctx, pdf_annot *annot, char *font_name, int font_name_len, float *size, int *n, float color[4], mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_annot_default_appearance_unmapped(ctx, annot, font_name, font_name_len, size, n, color));
}

void mupdf_pdf_set_annot_default_appearance(fz_context *ctx, pdf_annot *annot, const char *font, float size, int n, const float *color, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(pdf_set_annot_default_appearance(ctx, annot, font, size, n, color));
}

void mupdf_pdf_filter_annot_contents(fz_context *ctx, pdf_annot *annot, pdf_filter_options *filter, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(
        pdf_page *page = pdf_annot_page(ctx, annot);
        if (!page)
            fz_throw(ctx, FZ_ERROR_ARGUMENT, "annotation is no longer attached to a page");
        pdf_filter_annot_contents(ctx, page->doc, annot, filter)
    );
}

int mupdf_pdf_lookup_page_number(fz_context *ctx, pdf_document *doc, pdf_obj *page_obj, mupdf_error_t **errptr)
{
    TRY_CATCH(int, -1, pdf_lookup_page_number(ctx, doc, page_obj));
}
