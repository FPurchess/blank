/*
 * Blank's shim over MuPDF, see blank_mupdf.h. MuPDF reports errors with
 * longjmp (fz_try/fz_catch); an exception outside fz_try aborts the process,
 * so every entry point here catches. Nothing here prints or logs what a PDF
 * holds.
 */
#include <math.h>
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
/* the most fields and kids a walk of the form looks at */
#define MAX_VISITS 100000
#define MAX_OPTIONS 1000
/* what a drawn line is to be a rule: wide, thin (protocol.rs, RULE_*) */
#define RULE_MIN_WIDTH 40
#define RULE_MAX_HEIGHT 2

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
	/* the bytes it was opened from, and its password, to open it afresh */
	const unsigned char *data;
	size_t len;
	char *password;
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

/* the status of what fz_catch caught: a cancel is a cancel even when an
 * allocation was refused on the way (MuPDF may recover from a refusal by
 * emptying its store and trying again, so `refused` alone doesn't say the
 * error came of it); then a refusal, or MuPDF's own out of memory or limit */
static int caught(blank_engine *engine, int otherwise)
{
	int code = fz_caught(engine->ctx);
	if (code == FZ_ERROR_ABORT)
		return BLANK_CANCELLED;
	if (engine->refused || code == FZ_ERROR_SYSTEM || code == FZ_ERROR_LIMIT)
		return BLANK_TOO_COMPLEX;
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
	doc->data = data;
	doc->len = len;
	if (password && (doc->password = malloc(strlen(password) + 1)) != NULL)
		memcpy(doc->password, password, strlen(password) + 1);
	else if (password)
	{
		pdf_drop_document(ctx, pdf);
		free(doc);
		return BLANK_TOO_COMPLEX;
	}
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
	free(doc->password);
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
	/* MuPDF goes on past an error in a page's content and only counts it in
	 * the cookie: after a refused allocation the page would show half drawn */
	else if (status == BLANK_OK && cookie->cookie.errors && engine->refused)
		status = BLANK_TOO_COMPLEX;
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
	int count;
	/* the fields and kids looked at: shared kids make a tree of few objects
	 * that is very wide when walked */
	int visits;
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

/* a field's value as people see it: for a choice whose options are
 * [export display] pairs, the display text of the option /V exports (its
 * options are listed by their display texts, and filled in by them too) */
static const char *shown_value(fz_context *ctx, pdf_obj *field, int type)
{
	const char *value = pdf_field_value(ctx, field);
	int i, n;
	if (type != PDF_WIDGET_TYPE_COMBOBOX && type != PDF_WIDGET_TYPE_LISTBOX)
		return value;
	n = pdf_choice_field_option_count(ctx, field);
	for (i = 0; i < n; i++)
		if (!strcmp(pdf_choice_field_option(ctx, field, 1, i), value))
			return pdf_choice_field_option(ctx, field, 0, i);
	return value;
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
		json_string(ctx, out, shown_value(ctx, field, type));
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
	for (i = 0; i < n && walk->count < MAX_FIELDS && walk->visits < MAX_VISITS; i++)
	{
		pdf_cycle_list here;
		pdf_obj *field = pdf_array_get(ctx, fields, i);
		pdf_obj *kids;
		int type;
		walk->visits++;
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
		json_field(walk, field, type);
		walk->count++;
	}
}

int blank_form_json(blank_doc *doc, char **json, size_t *len)
{
	blank_engine *engine = doc->engine;
	fz_context *ctx = engine->ctx;
	form_walk walk;
	int status = BLANK_OK;
	memset(&walk, 0, sizeof walk);
	walk.doc = doc;
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

/* a page's text and rules, as JSON */

/* a character that separates words */
static int is_space(int c)
{
	return c <= 32 || c == 0xa0 || (c >= 0x2000 && c <= 0x200b) || c == 0x202f || c == 0x205f || c == 0x3000 || c == 0xfeff;
}

static int finite_rect(fz_rect rect)
{
	return isfinite(rect.x0) && isfinite(rect.y0) && isfinite(rect.x1) && isfinite(rect.y1);
}

/* writes the word gathered in `word` with its box, if there is one, and empties it */
static void flush_word(fz_context *ctx, fz_buffer *out, fz_buffer *word, fz_rect *box, int *count)
{
	unsigned char *data;
	size_t size;
	/* terminated first: it may move the buffer's storage */
	fz_terminate_buffer(ctx, word);
	size = fz_buffer_storage(ctx, word, &data);
	if (size && finite_rect(*box) && !fz_is_empty_rect(*box))
	{
		fz_append_string(ctx, out, (*count)++ ? ",{\"text\":" : "{\"text\":");
		json_string(ctx, out, (const char *)data);
		fz_append_string(ctx, out, ",\"rect\":");
		json_rect(ctx, out, *box);
		fz_append_byte(ctx, out, '}');
	}
	fz_clear_buffer(ctx, word);
	*box = fz_empty_rect;
}

/* a character's box: MuPDF's quad spans the font's ascender and descender,
 * which many fonts give with their line gap; this one spans at most 0.8 em
 * above the baseline and 0.25 below it, close to the type itself (and to
 * what poppler reads from base 14 metrics) */
static fz_rect char_box(fz_context *ctx, fz_stext_char *ch)
{
	float ascender = fz_font_ascender(ctx, ch->font);
	float descender = fz_font_descender(ctx, ch->font);
	float span = ascender - descender;
	fz_point up, along, low;
	fz_quad quad;
	if (!(span > 0.01f))
		return fz_rect_from_quad(ch->quad);
	/* a vector of 1 em from the baseline up, and the advance along it */
	up = fz_make_point((ch->quad.ul.x - ch->quad.ll.x) / span, (ch->quad.ul.y - ch->quad.ll.y) / span);
	along = fz_make_point(ch->quad.lr.x - ch->quad.ll.x, ch->quad.lr.y - ch->quad.ll.y);
	ascender = fz_min(ascender, 0.8f);
	descender = fz_max(descender, -0.25f);
	low = fz_make_point(ch->origin.x + up.x * descender, ch->origin.y + up.y * descender);
	quad.ll = low;
	quad.lr = fz_make_point(low.x + along.x, low.y + along.y);
	quad.ul = fz_make_point(low.x + up.x * (ascender - descender), low.y + up.y * (ascender - descender));
	quad.ur = fz_make_point(quad.ul.x + along.x, quad.ul.y + along.y);
	return fz_rect_from_quad(quad);
}

/* whether a vector is nearly white: not a line anyone sees */
static int is_white(uint32_t argb)
{
	return ((argb >> 16) & 0xff) > 0xf0 && ((argb >> 8) & 0xff) > 0xf0 && (argb & 0xff) > 0xf0;
}

int blank_page_text_json(blank_doc *doc, int index, char **json, size_t *len)
{
	blank_engine *engine = doc->engine;
	fz_context *ctx = engine->ctx;
	fz_stext_page *text = NULL;
	fz_device *device = NULL;
	fz_buffer *out = NULL, *rules = NULL, *word = NULL;
	int status = BLANK_OK;
	*json = NULL;
	*len = 0;
	engine->refused = 0;
	fz_var(text);
	fz_var(device);
	fz_var(out);
	fz_var(rules);
	fz_var(word);
	fz_var(status);
	fz_try(ctx)
	{
		fz_page *page = load_page(doc, index);
		fz_stext_options options;
		fz_stext_block *block;
		unsigned char *data;
		size_t size;
		int words = 0, lines = 0;
		memset(&options, 0, sizeof options);
		options.flags = FZ_STEXT_COLLECT_VECTORS;
		text = fz_new_stext_page(ctx, fz_bound_page(ctx, page));
		device = fz_new_stext_device(ctx, text, &options);
		/* the page and its annotations, without the form's widgets: their
		 * values aren't the page's text */
		fz_run_page_contents(ctx, page, device, fz_identity, NULL);
		fz_run_page_annots(ctx, page, device, fz_identity, NULL);
		fz_close_device(ctx, device);

		out = fz_new_buffer(ctx, 4096);
		rules = fz_new_buffer(ctx, 256);
		word = fz_new_buffer(ctx, 64);
		fz_append_string(ctx, out, "{\"words\":[");
		for (block = text->first_block; block; block = block->next)
		{
			if (block->type == FZ_STEXT_BLOCK_TEXT)
			{
				fz_stext_line *line;
				for (line = block->u.t.first_line; line; line = line->next)
				{
					fz_stext_char *ch;
					fz_rect box = fz_empty_rect;
					for (ch = line->first_char; ch; ch = ch->next)
					{
						char utf8[FZ_UTFMAX];
						if (is_space(ch->c))
						{
							flush_word(ctx, out, word, &box, &words);
							continue;
						}
						fz_append_data(ctx, word, utf8, fz_runetochar(utf8, ch->c));
						box = fz_union_rect(box, char_box(ctx, ch));
					}
					flush_word(ctx, out, word, &box, &words);
				}
			}
			else if (block->type == FZ_STEXT_BLOCK_VECTOR)
			{
				fz_rect box = block->bbox;
				if (finite_rect(box) && box.x1 - box.x0 >= RULE_MIN_WIDTH && box.y1 - box.y0 <= RULE_MAX_HEIGHT && !is_white(block->u.v.argb))
				{
					if (lines++)
						fz_append_byte(ctx, rules, ',');
					json_rect(ctx, rules, box);
				}
			}
		}
		fz_append_string(ctx, out, "],\"rules\":[");
		size = fz_buffer_storage(ctx, rules, &data);
		fz_append_data(ctx, out, data, size);
		fz_append_string(ctx, out, "]}");
		size = fz_buffer_storage(ctx, out, &data);
		*json = malloc(size);
		if (!*json)
			fz_throw(ctx, FZ_ERROR_SYSTEM, "out of memory");
		memcpy(*json, data, size);
		*len = size;
	}
	fz_always(ctx)
	{
		fz_drop_device(ctx, device);
		fz_drop_stext_page(ctx, text);
		fz_drop_buffer(ctx, out);
		fz_drop_buffer(ctx, rules);
		fz_drop_buffer(ctx, word);
	}
	fz_catch(ctx)
		status = caught(engine, BLANK_ENGINE);
	return status;
}

/* filling the form in */

/* the base 14 font MuPDF draws a field's text in: the one its /DA names,
 * if it is one of the five it knows, else Helvetica (pdf-appearance.c) */
static const char *appearance_font(fz_context *ctx, pdf_document *pdf, pdf_obj *field)
{
	const char *da = pdf_to_str_buf(ctx, pdf_dict_get_inheritable(ctx, field, PDF_NAME(DA)));
	const char *font;
	float size, color[4];
	int n;
	if (!da || !*da)
		da = pdf_to_str_buf(ctx, pdf_dict_getp(ctx, pdf_trailer(ctx, pdf), "Root/AcroForm/DA"));
	pdf_parse_default_appearance(ctx, da ? da : "", &font, &size, &n, color);
	if (!strcmp(font, "Cour")) return "Courier";
	if (!strcmp(font, "TiRo")) return "Times-Roman";
	if (!strcmp(font, "Symb")) return "Symbol";
	if (!strcmp(font, "ZaDb")) return "ZapfDingbats";
	return "Helvetica";
}

/* whether MuPDF can show `text` in the field: it writes a field's value in
 * its base 14 font with the Windows-1252 encoding, and puts anything else
 * in fonts of its own (Greek, Cyrillic, CJK fonts it doesn't embed) or
 * replaces it, so only what that encoding and font have is shown as typed */
static int shows(fz_context *ctx, pdf_document *pdf, pdf_obj *field, const char *text)
{
	fz_font *font = fz_new_base14_font(ctx, appearance_font(ctx, pdf, field));
	int ok = 1;
	fz_try(ctx)
	{
		while (*text && ok)
		{
			int c;
			text += fz_chartorune(&c, text);
			if (c == '\n' || c == '\r')
				continue;
			if (c == FZ_REPLACEMENT_CHARACTER || fz_windows_1252_from_unicode(c) <= 0 || fz_encode_character(ctx, font, c) <= 0)
				ok = 0;
		}
	}
	fz_always(ctx)
		fz_drop_font(ctx, font);
	fz_catch(ctx)
		fz_rethrow(ctx);
	return ok;
}

/* whether MuPDF can show every option of a list box: it draws them all, by
 * their display texts, whichever is chosen (pdf_write_ch_widget_appearance) */
static int shows_options(fz_context *ctx, pdf_document *pdf, pdf_obj *field)
{
	int i, n = pdf_choice_field_option_count(ctx, field);
	for (i = 0; i < n; i++)
		if (!shows(ctx, pdf, field, pdf_choice_field_option(ctx, field, 0, i)))
			return 0;
	return 1;
}

/* the widget `i` of a terminal field: its kids without /T, or itself; NULL past the last */
static pdf_obj *widget_of(fz_context *ctx, pdf_obj *field, int i)
{
	pdf_obj *kids = pdf_dict_get(ctx, field, PDF_NAME(Kids));
	pdf_obj *widget;
	if (!pdf_is_array(ctx, kids))
		return i == 0 ? field : NULL;
	while (i < pdf_array_len(ctx, kids))
	{
		widget = pdf_array_get(ctx, kids, i);
		if (!pdf_dict_get(ctx, widget, PDF_NAME(T)))
			return widget;
		i++;
	}
	return NULL;
}

/* the number of runes in `text` */
static int runes(const char *text)
{
	int count = 0, c;
	while (*text)
	{
		text += fz_chartorune(&c, text);
		count++;
	}
	return count;
}

/* sets a check box or radio button group to the state `value` (a name):
 * the field's /V, and each widget's /AS where it has that state, else /Off */
static void set_button(fz_context *ctx, pdf_document *pdf, pdf_obj *field, pdf_obj *value)
{
	pdf_obj *widget;
	int i;
	pdf_dict_put(ctx, field, PDF_NAME(V), value);
	pdf_dirty_obj(ctx, field);
	for (i = 0; (widget = widget_of(ctx, field, i)) != NULL; i++)
	{
		pdf_obj *states = pdf_dict_getp(ctx, widget, "AP/N");
		pdf_dict_put(ctx, widget, PDF_NAME(AS), pdf_dict_get(ctx, states, value) ? value : PDF_NAME(Off));
		pdf_dirty_obj(ctx, widget);
	}
	pdf->resynth_required = 1;
}

/* whether a radio button group has a widget with the state `name` */
static int has_state(fz_context *ctx, pdf_obj *field, const char *name)
{
	pdf_obj *widget;
	int i;
	for (i = 0; (widget = widget_of(ctx, field, i)) != NULL; i++)
		if (pdf_dict_gets(ctx, pdf_dict_getp(ctx, widget, "AP/N"), name))
			return 1;
	return 0;
}

/* fills one field in; inside fz_try */
static int fill_field(fz_context *ctx, pdf_document *pdf, pdf_obj *fields, const blank_fill *fill)
{
	pdf_obj *field = pdf_lookup_field(ctx, fields, fill->field);
	char *name;
	int same, type, flags, max_len, i, options;
	const char *value = fill->text;
	if (!field || has_field_kids(ctx, pdf_dict_get(ctx, field, PDF_NAME(Kids))))
		return BLANK_BAD_REQUEST;
	/* the field of that full name, not one whose name only starts so */
	name = pdf_load_field_name(ctx, field);
	same = !strcmp(name, fill->field);
	fz_free(ctx, name);
	if (!same)
		return BLANK_BAD_REQUEST;
	type = pdf_field_type(ctx, field);
	flags = pdf_field_flags(ctx, field);
	if (flags & PDF_FIELD_IS_READ_ONLY)
		return BLANK_BAD_REQUEST;
	switch (type)
	{
	case PDF_WIDGET_TYPE_TEXT:
		if (!value)
			return BLANK_BAD_REQUEST;
		max_len = pdf_dict_get_inheritable_int(ctx, field, PDF_NAME(MaxLen));
		if (max_len > 0 && runes(value) > max_len)
			return BLANK_BAD_REQUEST;
		if (!(flags & PDF_TX_FIELD_IS_MULTILINE) && strpbrk(value, "\r\n"))
			return BLANK_BAD_REQUEST;
		if (!shows(ctx, pdf, field, value))
			return BLANK_MISSING_GLYPHS;
		pdf_set_field_value(ctx, pdf, field, value, 1);
		return BLANK_OK;
	case PDF_WIDGET_TYPE_COMBOBOX:
	case PDF_WIDGET_TYPE_LISTBOX:
		if (!value)
			return BLANK_BAD_REQUEST;
		/* one of its options, by what it shows; its export value is set */
		options = pdf_choice_field_option_count(ctx, field);
		for (i = 0; i < options; i++)
			if (!strcmp(pdf_choice_field_option(ctx, field, 0, i), value))
			{
				value = pdf_choice_field_option(ctx, field, 1, i);
				break;
			}
		if (i == options && *value && !(type == PDF_WIDGET_TYPE_COMBOBOX && (flags & PDF_CH_FIELD_IS_EDIT)))
			return BLANK_BAD_REQUEST;
		/* what MuPDF draws: a combo box's value, the one exported (its /V),
		 * a list box's options */
		if (type == PDF_WIDGET_TYPE_COMBOBOX ? !shows(ctx, pdf, field, value) : !shows_options(ctx, pdf, field))
			return BLANK_MISSING_GLYPHS;
		pdf_set_field_value(ctx, pdf, field, value, 1);
		return BLANK_OK;
	case PDF_WIDGET_TYPE_CHECKBOX:
		if (value)
			return BLANK_BAD_REQUEST;
		if (fill->checked)
		{
			pdf_obj *widget, *on = NULL;
			for (i = 0; !on && (widget = widget_of(ctx, field, i)) != NULL; i++)
			{
				const char *state = on_state(ctx, widget);
				if (state)
					on = pdf_new_name(ctx, state);
			}
			if (!on)
				on = PDF_NAME(Yes);
			fz_try(ctx)
				set_button(ctx, pdf, field, on);
			fz_always(ctx)
				pdf_drop_obj(ctx, on);
			fz_catch(ctx)
				fz_rethrow(ctx);
		}
		else
			set_button(ctx, pdf, field, PDF_NAME(Off));
		return BLANK_OK;
	case PDF_WIDGET_TYPE_RADIOBUTTON:
		if (!value)
			return BLANK_BAD_REQUEST;
		if (!strcmp(value, "Off"))
		{
			set_button(ctx, pdf, field, PDF_NAME(Off));
			return BLANK_OK;
		}
		if (!has_state(ctx, field, value))
			return BLANK_BAD_REQUEST;
		{
			pdf_obj *on = pdf_new_name(ctx, value);
			fz_try(ctx)
				set_button(ctx, pdf, field, on);
			fz_always(ctx)
				pdf_drop_obj(ctx, on);
			fz_catch(ctx)
				fz_rethrow(ctx);
		}
		return BLANK_OK;
	default:
		return BLANK_BAD_REQUEST;
	}
}

/* draws the appearances of the filled fields' widgets again: their pages
 * are loaded together, since MuPDF updates the pages that are open */
static void update_pages(blank_doc *doc, const blank_fill *fills, int count)
{
	fz_context *ctx = doc->engine->ctx;
	pdf_obj *fields = pdf_dict_getp(ctx, pdf_trailer(ctx, doc->pdf), "Root/AcroForm/Fields");
	form_walk walk;
	fz_page **pages = NULL;
	int i, j, page;
	memset(&walk, 0, sizeof walk);
	walk.doc = doc;
	fz_var(pages);
	fz_try(ctx)
	{
		find_widgets(&walk);
		pages = fz_calloc(ctx, doc->pages ? doc->pages : 1, sizeof *pages);
		for (i = 0; i < count; i++)
		{
			pdf_obj *field = pdf_lookup_field(ctx, fields, fills[i].field), *widget;
			for (j = 0; field && (widget = widget_of(ctx, field, j)) != NULL; j++)
			{
				page = page_of(&walk, widget);
				if (page >= 0 && !pages[page])
					pages[page] = fz_load_page(ctx, &doc->pdf->super, page);
			}
		}
		for (page = 0; page < doc->pages; page++)
			if (pages[page])
				pdf_update_page(ctx, (pdf_page *)pages[page]);
	}
	fz_always(ctx)
	{
		if (pages)
			for (page = 0; page < doc->pages; page++)
				fz_drop_page(ctx, pages[page]);
		fz_free(ctx, pages);
		fz_free(ctx, walk.widgets);
		fz_free(ctx, walk.ctms);
	}
	fz_catch(ctx)
		fz_rethrow(ctx);
}

int blank_set_fills(blank_doc *doc, const blank_fill *fills, int count, blank_doc **out, int *failed)
{
	blank_engine *engine = doc->engine;
	fz_context *ctx = engine->ctx;
	blank_doc *filled = NULL;
	int status, i;
	*out = NULL;
	*failed = -1;
	status = blank_open(engine, doc->data, doc->len, doc->password, &filled);
	if (status != BLANK_OK)
		return status;
	engine->refused = 0;
	fz_var(status);
	fz_var(i);
	fz_try(ctx)
	{
		pdf_obj *fields = pdf_dict_getp(ctx, pdf_trailer(ctx, filled->pdf), "Root/AcroForm/Fields");
		for (i = 0; i < count && status == BLANK_OK; i++)
		{
			status = fill_field(ctx, filled->pdf, fields, &fills[i]);
			if (status != BLANK_OK)
				*failed = i;
		}
		if (status == BLANK_OK)
			update_pages(filled, fills, count);
	}
	fz_catch(ctx)
		status = caught(engine, BLANK_ENGINE);
	if (status != BLANK_OK)
	{
		blank_doc_drop(filled);
		return status;
	}
	*out = filled;
	return BLANK_OK;
}

int blank_save(blank_doc *doc, unsigned char **data, size_t *len)
{
	blank_engine *engine = doc->engine;
	fz_context *ctx = engine->ctx;
	fz_buffer *buffer = NULL;
	fz_output *out = NULL;
	int status = BLANK_OK;
	*data = NULL;
	*len = 0;
	/* MuPDF can't append to a repaired PDF; one with bytes before its
	 * header would get offsets that are off by them (pdf_write_document
	 * doesn't take its bias into account) */
	if (doc->repaired || doc->pdf->bias)
		return BLANK_REPAIRED;
	if (doc->encrypted)
		return BLANK_ENCRYPTED;
	engine->refused = 0;
	fz_var(buffer);
	fz_var(out);
	fz_var(status);
	fz_try(ctx)
	{
		pdf_write_options options = pdf_default_write_options;
		unsigned char *saved;
		size_t size;
		options.do_incremental = 1;
		buffer = fz_new_buffer(ctx, doc->len + 4096);
		out = fz_new_output_with_buffer(ctx, buffer);
		pdf_write_document(ctx, doc->pdf, out, &options);
		fz_close_output(ctx, out);
		size = fz_buffer_storage(ctx, buffer, &saved);
		*data = malloc(size ? size : 1);
		if (!*data)
			fz_throw(ctx, FZ_ERROR_SYSTEM, "out of memory");
		memcpy(*data, saved, size);
		*len = size;
	}
	fz_always(ctx)
	{
		fz_drop_output(ctx, out);
		fz_drop_buffer(ctx, buffer);
	}
	fz_catch(ctx)
		status = caught(engine, BLANK_ENGINE);
	return status;
}
