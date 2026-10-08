#include "internal.h"

/* Put the fz_context in thread-local storage */

#ifdef _WIN32
static CRITICAL_SECTION mutexes[FZ_LOCK_MAX];
#else
static pthread_mutex_t mutexes[FZ_LOCK_MAX];
#endif

static void lock(void *user, int lock)
{
    // suppress unused variable warning
    (void)user;
#ifdef _WIN32
    EnterCriticalSection(&mutexes[lock]);
#else
    (void)pthread_mutex_lock(&mutexes[lock]);
#endif
}

static void unlock(void *user, int lock)
{
    // suppress unused variable warning
    (void)user;
#ifdef _WIN32
    LeaveCriticalSection(&mutexes[lock]);
#else
    (void)pthread_mutex_unlock(&mutexes[lock]);
#endif
}

static const fz_locks_context locks =
    {
        NULL, /* user */
        lock,
        unlock};

/* Context */
void mupdf_drop_base_context(fz_context *ctx)
{
    int i;
    for (i = 0; i < FZ_LOCK_MAX; i++)
    {
#ifdef _WIN32
        DeleteCriticalSection(&mutexes[i]);
#else
        (void)pthread_mutex_destroy(&mutexes[i]);
#endif
    }

    fz_drop_context(ctx);
    ctx = NULL;
}

fz_context *mupdf_new_base_context()
{
    int i;
    for (i = 0; i < FZ_LOCK_MAX; i++)
    {
#ifdef _WIN32
        InitializeCriticalSection(&mutexes[i]);
#else
        (void)pthread_mutex_init(&mutexes[i], NULL);
#endif
    }
    fz_context *ctx = fz_new_context(NULL, &locks, FZ_STORE_DEFAULT);
    if (!ctx)
    {
        mupdf_drop_base_context(ctx);
        return NULL;
    }
    fz_try(ctx) {
        fz_register_document_handlers(ctx);
    }
    fz_catch(ctx) {
        mupdf_drop_base_context(ctx);
    }
    // Disable default warning & error printing
    fz_set_warning_callback(ctx, NULL, NULL);
    fz_set_error_callback(ctx, NULL, NULL);
    return ctx;
}
