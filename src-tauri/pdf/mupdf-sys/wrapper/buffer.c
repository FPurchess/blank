#include "internal.h"

/* Buffer */
size_t mupdf_buffer_read_bytes(fz_context *ctx, fz_buffer *buf, size_t at, unsigned char *output, size_t buf_len, mupdf_error_t **errptr)
{
    size_t remaining_input = 0;
    unsigned char *data;
    size_t len = fz_buffer_storage(ctx, buf, &data);
    /* If the offset is exactly at the end of the buffer, there are no bytes left to read.
     * This is not necessarily an EOF condition; it just means 0 bytes are available. */
    if (at == len)
    {
        // EOF
        return 0;
    }
    else if (at > len)
    {
        *errptr = mupdf_new_error_from_str("invalid offset, offset > buffer length");
        return 0;
    }
    remaining_input = len - at;
    len = fz_minz(buf_len, remaining_input);
    memcpy(output, &data[at], len);
    return len;
}

void mupdf_buffer_write_bytes(fz_context *ctx, fz_buffer *buf, const unsigned char *bytes, size_t len, mupdf_error_t **errptr)
{
    TRY_CATCH_VOID(fz_append_data(ctx, buf, bytes, len));
}

fz_buffer *mupdf_buffer_from_str(fz_context *ctx, const char *s, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_buffer*, NULL, fz_new_buffer_from_copied_data(ctx, (const unsigned char *)s, strlen(s)));
}

fz_buffer *mupdf_buffer_from_base64(fz_context *ctx, const char *s, mupdf_error_t **errptr)
{
    TRY_CATCH(fz_buffer*, NULL, fz_new_buffer_from_base64(ctx, s, strlen(s)));
}
