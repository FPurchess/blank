#![no_std]
#![allow(non_upper_case_globals)]
#![allow(non_camel_case_types)]
#![allow(non_snake_case)]
#![allow(clippy::all)]

include!(concat!(env!("OUT_DIR"), "/bindings.rs"));

use core::ffi::{c_int, CStr};

/// This function allocates a new device and returns a pointer to it if no error occured. For the
/// required structure of `T` check the example below. If an error occurs the pointer `errptr` points
/// to will be set to to a pointer pointing to the error and null returned from this function.
///
/// # Safety
///
/// The caller must ensure `ctx` and `errptr` to be a valid pointers.
///
/// It must also ensure `T` to be a type that starts with `fz_device`. Memory will be allocated for
/// a new instance of `T`, but only the `fz_device` portion will be initialized. The rest is
/// currently being zero-initialized, but this might change in the future.
///
/// The `*mut T` pointer returned is only guaranteed to be well aligned up to the alignment
/// of [`max_align_t`].
///
/// # Example
///
/// This is how a compliant `T` might look like. The `repr(C)` is necessary as `repr(Rust)` does
/// not guarantee stable field orderings.
///
/// ```rust
/// use mupdf_sys::{fz_device, max_align_t};
///
/// #[repr(C)]
/// struct MyDevice {
///     base: fz_device,
///     foo: u32,
/// }
///
/// const { assert!(align_of::<MyDevice>() <= align_of::<max_align_t>()); }
/// ```
pub unsafe fn mupdf_new_derived_device<T>(
    ctx: *mut fz_context,
    label: &'static CStr,
    errptr: *mut *mut mupdf_error_t,
) -> *mut T {
    let SIZE: c_int = const {
        if (c_int::MAX as usize) < size_of::<T>() {
            panic!("device too big")
        } else {
            size_of::<T>() as c_int
        }
    };

    let device = mupdf_new_device_of_size(ctx, SIZE, errptr);
    let label = Memento_label(device.cast(), label.as_ptr());
    label.cast()
}
