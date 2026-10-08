/*
 * Blank's shim over MuPDF, see blank_mupdf.h. MuPDF reports errors with
 * longjmp (fz_try/fz_catch); an exception outside fz_try aborts the process,
 * so every entry point here catches. Nothing here prints or logs what a PDF
 * holds.
 */
#include <stdlib.h>
#include <string.h>

#include "mupdf/fitz.h"
#include "mupdf/pdf.h"

#include "blank_mupdf.h"

/* the size kept before each block, so free knows what it frees; aligned for any type */
#define HEADER 16
/* the fonts kept loaded for the documents */
#define MAX_FONTS 16
#define MAX_PATH 4096
/* the most fields walked, nesting followed and options listed */
#define MAX_FIELDS 10000
#define MAX_DEPTH 32
#define MAX_OPTIONS 1000

typedef struct
{
	char path[MAX_PATH];
	int index;
	fz_font *font;
} cached_font;

struct blank_engine
{
	fz_context *ctx;
	fz_alloc_context alloc;
	size_t used;
	size_t limit;
	/* an allocation was refused for the limit since the entry point began */
	int refused;
	blank_font_finder finder;
	cached_font fonts[MAX_FONTS];
	int font_count;
};

struct blank_doc
{
	blank_engine *engine;
	pdf_document *pdf;
	int pages;
	int repaired;
	int encrypted;
	/* the page loaded last, kept for the next request, usually of it */
	fz_page *page;
	int page_index;
};

struct blank_cookie
{
	fz_cookie cookie;
};

/* the allocator: counts what MuPDF holds and refuses past the limit, so a
 * memory bomb fails its request instead of taking the machine down */

static void *count_malloc(void *user, size_t size)
{
	blank_engine *engine = user;
	unsigned char *block;
	if (size > engine->limit - engine->used || size > SIZE_MAX - HEADER)
	{
		engine->refused = 1;
		return NULL;
	}
	block = malloc(size + HEADER);
	if (!block)
		return NULL;
	memcpy(block, &size, sizeof size);
	engine->used += size;
	return block + HEADER;
}

static void count_free(void *user, void *ptr)
{
	blank_engine *engine = user;
	unsigned char *block;
	size_t size;
	if (!ptr)
		return;
	block = (unsigned char *)ptr - HEADER;
	memcpy(&size, block, sizeof size);
	engine->used -= size;
	free(block);
}

static void *count_realloc(void *user, void *ptr, size_t size)
{
	blank_engine *engine = user;
	unsigned char *block;
	size_t old;
	if (!ptr)
		return count_malloc(user, size);
	if (size == 0)
	{
		count_free(user, ptr);
		return NULL;
	}
	block = (unsigned char *)ptr - HEADER;
	memcpy(&old, block, sizeof old);
	if ((size > old && size - old > engine->limit - engine->used) || size > SIZE_MAX - HEADER)
	{
		engine->refused = 1;
		return NULL;
	}
	block = realloc(block, size + HEADER);
	if (!block)
		return NULL;
	memcpy(block, &size, sizeof size);
	engine->used = engine->used - old + size;
	return block + HEADER;
}

/* fonts: MuPDF asks for the fonts a PDF names but doesn't embed */

static fz_font *font_from(fz_context *ctx, blank_engine *engine, const char *path, int index)
{
	int i;
	fz_font *font;
	for (i = 0; i < engine->font_count; i++)
		if (engine->fonts[i].index == index && !strcmp(engine->fonts[i].path, path))
			return fz_keep_font(ctx, engine->fonts[i].font);
	font = fz_new_font_from_file(ctx, NULL, path, index, 0);
	if (engine->font_count < MAX_FONTS)
	{
		cached_font *kept = &engine->fonts[engine->font_count++];
		fz_strlcpy(kept->path, path, sizeof kept->path);
		kept->index = index;
		kept->font = fz_keep_font(ctx, font);
	}
	return font;
}

static fz_font *find_font(fz_context *ctx, const char *name, int bold, int italic, int ordering)
{
	blank_engine *engine = fz_user_context(ctx);
	char path[MAX_PATH];
	int index = 0;
	if (!engine->finder || !engine->finder(name, bold, italic, ordering, path, sizeof path, &index))
		return NULL;
	path[sizeof path - 1] = 0;
	return font_from(ctx, engine, path, index);
}

static fz_font *load_system_font(fz_context *ctx, const char *name, int bold, int italic, int needs_exact_metrics)
{
	(void)needs_exact_metrics;
	if (!name || !*name)
		return NULL;
	return find_font(ctx, name, bold, italic, -1);
}

static fz_font *load_system_cjk_font(fz_context *ctx, const char *name, int ordering, int serif)
{
	(void)name;
	(void)serif;
	return find_font(ctx, NULL, 0, 0, ordering);
}

/* the engine */

const char *blank_engine_version(void)
{
	return FZ_VERSION;
}

blank_engine *blank_engine_new(size_t memory_limit, size_t store_limit, blank_font_finder finder)
{
	blank_engine *engine = calloc(1, sizeof *engine);
	if (!engine)
		return NULL;
	engine->limit = memory_limit;
	engine->finder = finder;
	engine->alloc.user = engine;
	engine->alloc.malloc = count_malloc;
	engine->alloc.realloc = count_realloc;
	engine->alloc.free = count_free;
	fz_var(engine);
	engine->ctx = fz_new_context(&engine->alloc, NULL, store_limit);
	if (!engine->ctx)
	{
		free(engine);
		return NULL;
	}
	fz_set_user_context(engine->ctx, engine);
	fz_try(engine->ctx)
	{
		fz_register_document_handlers(engine->ctx);
		fz_install_load_system_font_funcs(engine->ctx, load_system_font, load_system_cjk_font, NULL);
	}
	fz_catch(engine->ctx)
	{
		fz_drop_context(engine->ctx);
		free(engine);
		return NULL;
	}
	return engine;
}

void blank_engine_drop(blank_engine *engine)
{
	int i;
	if (!engine)
		return;
	for (i = 0; i < engine->font_count; i++)
		fz_drop_font(engine->ctx, engine->fonts[i].font);
	fz_drop_context(engine->ctx);
	free(engine);
}

/* the status of what fz_catch caught */
static int caught(blank_engine *engine, int otherwise)
{
	int code = fz_caught(engine->ctx);
	if (engine->refused)
		return BLANK_TOO_COMPLEX;
	if (code == FZ_ERROR_ABORT)
		return BLANK_CANCELLED;
	return otherwise;
}

/* documents */

int blank_open(blank_engine *engine, const unsigned char *data, size_t len, const char *password, blank_doc **out)
{
	fz_context *ctx = engine->ctx;
	fz_stream *stream = NULL;
	pdf_document *pdf = NULL;
	blank_doc *doc;
	int status = BLANK_OK, pages = 0;

	*out = NULL;
	engine->refused = 0;
	fz_var(stream);
	fz_var(pdf);
	fz_var(status);
	fz_var(pages);
	fz_try(ctx)
	{
		stream = fz_open_memory(ctx, data, len);
		pdf = pdf_open_document_with_stream(ctx, stream);
		if (pdf_needs_password(ctx, pdf) && !(password && pdf_authenticate_password(ctx, pdf, password)))
			status = BLANK_NEEDS_PASSWORD;
		else
			pages = pdf_count_pages(ctx, pdf);
	}
	fz_always(ctx)
		fz_drop_stream(ctx, stream);
	fz_catch(ctx)
		status = caught(engine, BLANK_DAMAGED);

	if (status == BLANK_OK && !(doc = calloc(1, sizeof *doc)))
		status = BLANK_TOO_COMPLEX;
	if (status != BLANK_OK)
	{
		pdf_drop_document(ctx, pdf);
		return status;
	}
	doc->engine = engine;
	doc->pdf = pdf;
	doc->pages = pages;
	doc->page_index = -1;
	doc->repaired = pdf_was_repaired(ctx, pdf);
	fz_try(ctx)
		doc->encrypted = pdf_dict_get(ctx, pdf_trailer(ctx, pdf), PDF_NAME(Encrypt)) != NULL;
	fz_catch(ctx)
		doc->encrypted = 1;
	*out = doc;
	return BLANK_OK;
}

void blank_doc_drop(blank_doc *doc)
{
	if (!doc)
		return;
	fz_drop_page(doc->engine->ctx, doc->page);
	pdf_drop_document(doc->engine->ctx, doc->pdf);
	free(doc);
}

int blank_doc_pages(const blank_doc *doc)
{
	return doc->pages;
}

int blank_doc_repaired(const blank_doc *doc)
{
	return doc->repaired;
}

int blank_doc_encrypted(const blank_doc *doc)
{
	return doc->encrypted;
}

/* the page, loaded if it isn't the one kept; inside fz_try */
static fz_page *load_page(blank_doc *doc, int index)
{
	fz_context *ctx = doc->engine->ctx;
	if (doc->page_index != index)
	{
		fz_drop_page(ctx, doc->page);
		doc->page = NULL;
		doc->page_index = -1;
		doc->page = fz_load_page(ctx, &doc->pdf->super, index);
		doc->page_index = index;
	}
	return doc->page;
}

/* a /Rotate as one of 0, 90, 180 and 270, as MuPDF snaps it */
static int snapped(int rotate)
{
	if (rotate < 0)
		rotate = 360 - ((-rotate) % 360);
	if (rotate >= 360)
		rotate = rotate % 360;
	rotate = 90 * ((rotate + 45) / 90);
	return rotate >= 360 ? 0 : rotate;
}

int blank_page_info(blank_doc *doc, int index, float *width, float *height, int *rotation, float *user_unit)
{
	blank_engine *engine = doc->engine;
	fz_context *ctx = engine->ctx;
	int status = BLANK_OK;
	engine->refused = 0;
	fz_var(status);
	fz_try(ctx)
	{
		fz_rect bounds = fz_bound_page(ctx, load_page(doc, index));
		pdf_obj *page = pdf_lookup_page_obj(ctx, doc->pdf, index);
		*width = bounds.x1 - bounds.x0;
		*height = bounds.y1 - bounds.y0;
		*rotation = snapped(pdf_dict_get_inheritable_int(ctx, page, PDF_NAME(Rotate)));
		*user_unit = pdf_dict_get_real_default(ctx, page, PDF_NAME(UserUnit), 1);
	}
	fz_catch(ctx)
		status = caught(engine, BLANK_ENGINE);
	return status;
}

/* where a page is drawn at `scale`, in pixels; inside fz_try */
static fz_irect pixel_box(blank_doc *doc, int index, float scale)
{
	fz_rect bounds = fz_bound_page(doc->engine->ctx, load_page(doc, index));
	return fz_round_rect(fz_transform_rect(bounds, fz_scale(scale, scale)));
}

int blank_render_size(blank_doc *doc, int index, float scale, int *width, int *height)
{
	blank_engine *engine = doc->engine;
	fz_context *ctx = engine->ctx;
	int status = BLANK_OK;
	engine->refused = 0;
	fz_var(status);
	fz_try(ctx)
	{
		fz_irect box = pixel_box(doc, index, scale);
		*width = box.x1 - box.x0;
		*height = box.y1 - box.y0;
	}
	fz_catch(ctx)
		status = caught(engine, BLANK_ENGINE);
	return status;
}

int blank_render(blank_doc *doc, int index, float scale, blank_cookie *cookie, unsigned char *rgba, int width, int height)
{
	blank_engine *engine = doc->engine;
	fz_context *ctx = engine->ctx;
	fz_pixmap *pixmap = NULL;
	fz_device *device = NULL;
	int status = BLANK_OK;
	engine->refused = 0;
	fz_var(pixmap);
	fz_var(device);
	fz_var(status);
	fz_try(ctx)
	{
		fz_page *page = load_page(doc, index);
		fz_irect box = pixel_box(doc, index, scale);
		if (box.x1 - box.x0 != width || box.y1 - box.y0 != height)
			fz_throw(ctx, FZ_ERROR_ARGUMENT, "the page's size changed");
		/* the pixels are Rust's: the pixmap only borrows them */
		pixmap = fz_new_pixmap_with_bbox_and_data(ctx, fz_device_rgb(ctx), box, NULL, 1, rgba);
		/* white and opaque, so straight and premultiplied alpha are the same */
		fz_clear_pixmap_with_value(ctx, pixmap, 255);
		device = fz_new_draw_device(ctx, fz_identity, pixmap);
		fz_run_page(ctx, page, device, fz_scale(scale, scale), &cookie->cookie);
		fz_close_device(ctx, device);
	}
	fz_always(ctx)
	{
		fz_drop_device(ctx, device);
		fz_drop_pixmap(ctx, pixmap);
	}
	fz_catch(ctx)
		status = caught(engine, BLANK_ENGINE);
	if (status == BLANK_OK && cookie->cookie.abort)
		status = BLANK_CANCELLED;
	return status;
}

blank_cookie *blank_cookie_new(void)
{
	return calloc(1, sizeof(blank_cookie));
}

void blank_cookie_abort(blank_cookie *cookie)
{
	/* MuPDF reads it while it draws, from its thread */
	cookie->cookie.abort = 1;
}

void blank_cookie_drop(blank_cookie *cookie)
{
	free(cookie);
}

/* the form, as JSON */

static void json_string(fz_context *ctx, fz_buffer *out, const char *text)
{
	const unsigned char *c;
	if (!text)
	{
		fz_append_string(ctx, out, "null");
		return;
	}
	fz_append_byte(ctx, out, '"');
	for (c = (const unsigned char *)text; *c; c++)
	{
		if (*c == '"' || *c == '\\')
		{
			fz_append_byte(ctx, out, '\\');
			fz_append_byte(ctx, out, *c);
		}
		else if (*c < 0x20)
			fz_append_printf(ctx, out, "\\u%04x", *c);
		else
			fz_append_byte(ctx, out, *c);
	}
	fz_append_byte(ctx, out, '"');
}

/* `text`, or NULL for an empty one */
static const char *or_null(const char *text)
{
	return text && *text ? text : NULL;
}

static void json_rect(fz_context *ctx, fz_buffer *out, fz_rect rect)
{
	fz_append_printf(ctx, out, "[%g,%g,%g,%g]", rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0);
}

/* a widget's object number and its page */
typedef struct
{
	int num;
	int page;
} placed;

static int by_num(const void *a, const void *b)
{
	return ((const placed *)a)->num - ((const placed *)b)->num;
}

typedef struct
{
	blank_doc *doc;
	fz_buffer *out;
	int signatures;
	int count;
	/* every widget of the pages' /Annots, by object number */
	placed *widgets;
	int widget_count;
	/* the pages' transforms from PDF space to display points */
	fz_matrix *ctms;
} form_walk;

/* where the pages' annotations are; inside fz_try */
static void find_widgets(form_walk *walk)
{
	fz_context *ctx = walk->doc->engine->ctx;
	pdf_document *pdf = walk->doc->pdf;
	int page, i, capacity = 0;
	walk->ctms = fz_malloc_array(ctx, walk->doc->pages, fz_matrix);
	for (page = 0; page < walk->doc->pages; page++)
	{
		pdf_obj *page_obj = pdf_lookup_page_obj(ctx, pdf, page);
		pdf_obj *annots = pdf_dict_get(ctx, page_obj, PDF_NAME(Annots));
		int n = pdf_array_len(ctx, annots);
		pdf_page_obj_transform(ctx, page_obj, NULL, &walk->ctms[page]);
		for (i = 0; i < n; i++)
		{
			int num = pdf_to_num(ctx, pdf_array_get(ctx, annots, i));
			if (num <= 0)
				continue;
			if (walk->widget_count == capacity)
			{
				capacity = capacity ? capacity * 2 : 64;
				walk->widgets = fz_realloc_array(ctx, walk->widgets, capacity, placed);
			}
			walk->widgets[walk->widget_count].num = num;
			walk->widgets[walk->widget_count].page = page;
			walk->widget_count++;
		}
	}
	if (walk->widget_count)
		qsort(walk->widgets, walk->widget_count, sizeof(placed), by_num);
}

/* the page a widget is on, or -1 */
static int page_of(form_walk *walk, pdf_obj *widget)
{
	placed key, *found;
	key.num = pdf_to_num(walk->doc->engine->ctx, widget);
	if (key.num <= 0 || !walk->widget_count)
		return -1;
	found = bsearch(&key, walk->widgets, walk->widget_count, sizeof(placed), by_num);
	return found ? found->page : -1;
}

/* a check box's or radio button's state when on: its normal appearance's other than /Off */
static const char *on_state(fz_context *ctx, pdf_obj *widget)
{
	pdf_obj *states = pdf_dict_getp(ctx, widget, "AP/N");
	int i, n = pdf_dict_len(ctx, states);
	for (i = 0; i < n; i++)
	{
		pdf_obj *key = pdf_dict_get_key(ctx, states, i);
		if (!pdf_name_eq(ctx, key, PDF_NAME(Off)))
			return pdf_to_name(ctx, key);
	}
	return NULL;
}

static const char *kind_name(int type)
{
	switch (type)
	{
	case PDF_WIDGET_TYPE_TEXT: return "text";
	case PDF_WIDGET_TYPE_CHECKBOX: return "checkbox";
	case PDF_WIDGET_TYPE_RADIOBUTTON: return "radio";
	case PDF_WIDGET_TYPE_COMBOBOX: return "combo";
	case PDF_WIDGET_TYPE_LISTBOX: return "list";
	case PDF_WIDGET_TYPE_BUTTON: return "button";
	case PDF_WIDGET_TYPE_SIGNATURE: return "signature";
	default: return NULL;
	}
}

/* the widgets of a terminal field: its kids without /T, or itself */
static void json_widgets(form_walk *walk, pdf_obj *field, int with_state)
{
	fz_context *ctx = walk->doc->engine->ctx;
	pdf_obj *kids = pdf_dict_get(ctx, field, PDF_NAME(Kids));
	int i, n = pdf_is_array(ctx, kids) ? pdf_array_len(ctx, kids) : 1, first = 1;
	fz_append_byte(ctx, walk->out, '[');
	for (i = 0; i < n; i++)
	{
		pdf_obj *widget = pdf_is_array(ctx, kids) ? pdf_array_get(ctx, kids, i) : field;
		int page;
		if (pdf_dict_get(ctx, widget, PDF_NAME(T)) && widget != field)
			continue;
		page = page_of(walk, widget);
		if (page < 0)
			continue;
		if (!first)
			fz_append_byte(ctx, walk->out, ',');
		first = 0;
		fz_append_printf(ctx, walk->out, "{\"page\":%d,\"rect\":", page);
		json_rect(ctx, walk->out, fz_transform_rect(pdf_dict_get_rect(ctx, widget, PDF_NAME(Rect)), walk->ctms[page]));
		fz_append_string(ctx, walk->out, ",\"onValue\":");
		json_string(ctx, walk->out, with_state ? on_state(ctx, widget) : NULL);
		fz_append_byte(ctx, walk->out, '}');
	}
	fz_append_byte(ctx, walk->out, ']');
}

static void json_field(form_walk *walk, pdf_obj *field, int type)
{
	fz_context *ctx = walk->doc->engine->ctx;
	fz_buffer *out = walk->out;
	char *name = NULL;
	int flags = pdf_field_flags(ctx, field);
	int max_len = pdf_dict_get_inheritable_int(ctx, field, PDF_NAME(MaxLen));
	int i, options = 0;
	fz_var(name);
	fz_try(ctx)
	{
		name = pdf_load_field_name(ctx, field);
		fz_append_string(ctx, out, walk->count ? ",{\"name\":" : "{\"name\":");
		json_string(ctx, out, name);
		fz_append_printf(ctx, out, ",\"kind\":\"%s\",\"label\":", kind_name(type));
		json_string(ctx, out, or_null(pdf_to_text_string(ctx, pdf_dict_get_inheritable(ctx, field, PDF_NAME(TU)))));
		fz_append_string(ctx, out, ",\"value\":");
		json_string(ctx, out, pdf_field_value(ctx, field));
		fz_append_string(ctx, out, ",\"options\":[");
		if (type == PDF_WIDGET_TYPE_COMBOBOX || type == PDF_WIDGET_TYPE_LISTBOX)
			options = fz_mini(pdf_choice_field_option_count(ctx, field), MAX_OPTIONS);
		for (i = 0; i < options; i++)
		{
			if (i)
				fz_append_byte(ctx, out, ',');
			json_string(ctx, out, pdf_choice_field_option(ctx, field, 0, i));
		}
		fz_append_printf(ctx, out,
			"],\"flags\":{\"readOnly\":%s,\"required\":%s,\"multiline\":%s,\"comb\":%s,\"maxLen\":",
			flags & PDF_FIELD_IS_READ_ONLY ? "true" : "false",
			flags & PDF_FIELD_IS_REQUIRED ? "true" : "false",
			type == PDF_WIDGET_TYPE_TEXT && (flags & PDF_TX_FIELD_IS_MULTILINE) ? "true" : "false",
			type == PDF_WIDGET_TYPE_TEXT && (flags & PDF_TX_FIELD_IS_COMB) ? "true" : "false");
		if (max_len > 0)
			fz_append_printf(ctx, out, "%d", max_len);
		else
			fz_append_string(ctx, out, "null");
		fz_append_printf(ctx, out, "},\"signed\":%s,\"widgets\":",
			type == PDF_WIDGET_TYPE_SIGNATURE && pdf_signature_is_signed(ctx, walk->doc->pdf, field) ? "true" : "false");
		json_widgets(walk, field, type == PDF_WIDGET_TYPE_CHECKBOX || type == PDF_WIDGET_TYPE_RADIOBUTTON);
		fz_append_byte(ctx, out, '}');
	}
	fz_always(ctx)
		fz_free(ctx, name);
	fz_catch(ctx)
		fz_rethrow(ctx);
}

static void json_signature(form_walk *walk, pdf_obj *field)
{
	fz_context *ctx = walk->doc->engine->ctx;
	fz_buffer *out = walk->out;
	pdf_obj *value = pdf_dict_get_inheritable(ctx, field, PDF_NAME(V));
	pdf_obj *kids = pdf_dict_get(ctx, field, PDF_NAME(Kids));
	pdf_obj *widget = pdf_is_array(ctx, kids) ? pdf_array_get(ctx, kids, 0) : field;
	int page = page_of(walk, widget);
	char *name = NULL;
	fz_var(name);
	fz_try(ctx)
	{
		name = pdf_load_field_name(ctx, field);
		fz_append_string(ctx, out, walk->count ? ",{\"field\":" : "{\"field\":");
		json_string(ctx, out, name);
		if (page >= 0)
		{
			fz_append_printf(ctx, out, ",\"page\":%d,\"rect\":", page);
			json_rect(ctx, out, fz_transform_rect(pdf_dict_get_rect(ctx, widget, PDF_NAME(Rect)), walk->ctms[page]));
		}
		else
			fz_append_string(ctx, out, ",\"page\":null,\"rect\":null");
		fz_append_string(ctx, out, ",\"subFilter\":");
		json_string(ctx, out, or_null(pdf_to_name(ctx, pdf_dict_get(ctx, value, PDF_NAME(SubFilter)))));
		fz_append_string(ctx, out, ",\"reason\":");
		json_string(ctx, out, or_null(pdf_dict_get_text_string(ctx, value, PDF_NAME(Reason))));
		fz_append_string(ctx, out, ",\"location\":");
		json_string(ctx, out, or_null(pdf_dict_get_text_string(ctx, value, PDF_NAME(Location))));
		fz_append_string(ctx, out, ",\"name\":");
		json_string(ctx, out, or_null(pdf_dict_get_text_string(ctx, value, PDF_NAME(Name))));
		fz_append_string(ctx, out, ",\"time\":");
		json_string(ctx, out, or_null(pdf_dict_get_text_string(ctx, value, PDF_NAME(M))));
		fz_append_byte(ctx, out, '}');
	}
	fz_always(ctx)
		fz_free(ctx, name);
	fz_catch(ctx)
		fz_rethrow(ctx);
}

/* whether a field has kids that are fields (with /T) rather than widgets */
static int has_field_kids(fz_context *ctx, pdf_obj *kids)
{
	int i, n = pdf_array_len(ctx, kids);
	for (i = 0; i < n; i++)
		if (pdf_dict_get(ctx, pdf_array_get(ctx, kids, i), PDF_NAME(T)))
			return 1;
	return 0;
}

static void walk_fields(form_walk *walk, pdf_obj *fields, pdf_cycle_list *up, int depth)
{
	fz_context *ctx = walk->doc->engine->ctx;
	int i, n = pdf_array_len(ctx, fields);
	if (depth > MAX_DEPTH)
		return;
	for (i = 0; i < n && walk->count < MAX_FIELDS; i++)
	{
		pdf_cycle_list here;
		pdf_obj *field = pdf_array_get(ctx, fields, i);
		pdf_obj *kids;
		int type;
		if (!pdf_is_dict(ctx, field) || pdf_cycle(ctx, &here, up, field))
			continue;
		kids = pdf_dict_get(ctx, field, PDF_NAME(Kids));
		if (has_field_kids(ctx, kids))
		{
			walk_fields(walk, kids, &here, depth + 1);
			continue;
		}
		type = pdf_field_type(ctx, field);
		if (!kind_name(type))
			continue;
		if (!walk->signatures)
			json_field(walk, field, type);
		else if (type == PDF_WIDGET_TYPE_SIGNATURE && pdf_signature_is_signed(ctx, walk->doc->pdf, field))
			json_signature(walk, field);
		else
			continue;
		walk->count++;
	}
}

int blank_form_json(blank_doc *doc, int signatures, char **json, size_t *len)
{
	blank_engine *engine = doc->engine;
	fz_context *ctx = engine->ctx;
	form_walk walk;
	int status = BLANK_OK;
	memset(&walk, 0, sizeof walk);
	walk.doc = doc;
	walk.signatures = signatures;
	*json = NULL;
	*len = 0;
	engine->refused = 0;
	fz_var(status);
	fz_try(ctx)
	{
		unsigned char *data;
		size_t size;
		walk.out = fz_new_buffer(ctx, 1024);
		find_widgets(&walk);
		fz_append_byte(ctx, walk.out, '[');
		walk_fields(&walk, pdf_dict_getp(ctx, pdf_trailer(ctx, doc->pdf), "Root/AcroForm/Fields"), NULL, 0);
		fz_append_byte(ctx, walk.out, ']');
		size = fz_buffer_storage(ctx, walk.out, &data);
		*json = malloc(size);
		if (!*json)
			fz_throw(ctx, FZ_ERROR_SYSTEM, "out of memory");
		memcpy(*json, data, size);
		*len = size;
	}
	fz_always(ctx)
	{
		fz_drop_buffer(ctx, walk.out);
		fz_free(ctx, walk.widgets);
		fz_free(ctx, walk.ctms);
	}
	fz_catch(ctx)
		status = caught(engine, BLANK_ENGINE);
	return status;
}

void blank_free(char *json)
{
	free(json);
}
