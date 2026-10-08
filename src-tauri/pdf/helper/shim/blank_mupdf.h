/*
 * Blank's shim over MuPDF: everything the helper asks of MuPDF, each entry
 * point inside fz_try, so an exception becomes a status instead of an abort.
 * Only src/mupdf.rs calls it.
 */
#ifndef BLANK_MUPDF_H
#define BLANK_MUPDF_H

#include <stddef.h>

typedef struct blank_engine blank_engine;
typedef struct blank_doc blank_doc;
typedef struct blank_cookie blank_cookie;

enum
{
	BLANK_OK = 0,
	BLANK_ENGINE = 1,
	BLANK_TOO_COMPLEX = 2,
	BLANK_CANCELLED = 3,
	BLANK_NEEDS_PASSWORD = 4,
	BLANK_DAMAGED = 5,
};

/*
 * Finds a system font for MuPDF: the family `name`, bold or italic, or,
 * with `name` NULL, the font for a CJK `ordering` (FZ_ADOBE_CNS, _GB, _JAPAN
 * or _KOREA). Writes the font file's path, NUL-terminated, and the face's
 * index in it; returns 0 for none.
 */
typedef int (*blank_font_finder)(const char *name, int bold, int italic, int ordering, char *path, size_t path_size, int *index);

/* a MuPDF context whose allocations stop at `memory_limit` bytes */
blank_engine *blank_engine_new(size_t memory_limit, size_t store_limit, blank_font_finder finder);
void blank_engine_drop(blank_engine *engine);
const char *blank_engine_version(void);

/* opens the PDF in `data`, which must outlive the document */
int blank_open(blank_engine *engine, const unsigned char *data, size_t len, const char *password, blank_doc **out);
void blank_doc_drop(blank_doc *doc);
int blank_doc_pages(const blank_doc *doc);
int blank_doc_repaired(const blank_doc *doc);
int blank_doc_encrypted(const blank_doc *doc);

int blank_page_info(blank_doc *doc, int page, float *width, float *height, int *rotation, float *user_unit);
/* the size in pixels a page is drawn with at `scale` */
int blank_render_size(blank_doc *doc, int page, float scale, int *width, int *height);
/* draws a page into `rgba`, `width` * `height` * 4 bytes the size above gave */
int blank_render(blank_doc *doc, int page, float scale, blank_cookie *cookie, unsigned char *rgba, int width, int height);

/* stops a render that runs with it, from another thread */
blank_cookie *blank_cookie_new(void);
void blank_cookie_abort(blank_cookie *cookie);
void blank_cookie_drop(blank_cookie *cookie);

/*
 * The form's fields, or (signatures != 0) its signatures, as JSON in the
 * shapes of protocol.rs, in *json (blank_free frees it).
 */
int blank_form_json(blank_doc *doc, int signatures, char **json, size_t *len);
void blank_free(char *json);

#endif
