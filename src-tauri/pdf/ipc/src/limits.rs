//! What keeps a helper from taking the machine down. The first line is the
//! helper's own allocator, which refuses MuPDF's allocations past a cap
//! (`--memory-limit-mb`), so a memory bomb fails its request; these are the
//! backstops of the system around it.

/// the helper's address space on Linux: virtual memory, so generous
#[cfg(target_os = "linux")]
const ADDRESS_SPACE: u64 = 4 << 30;

/// sets the helper's own limits, first thing in its `main`: on Linux, its
/// address space, and that the kernel kills it when Blank goes
pub fn limit_helper() {
    #[cfg(target_os = "linux")]
    unsafe {
        let limit = libc::rlimit {
            rlim_cur: ADDRESS_SPACE,
            rlim_max: ADDRESS_SPACE,
        };
        libc::setrlimit(libc::RLIMIT_AS, &limit);
        libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGKILL);
    }
}

/// the most memory a helper may hold before the system's backstop ends it,
/// where the helper's own cap didn't stop it (macOS and Windows; Linux caps
/// the address space above)
#[cfg(any(target_os = "macos", windows))]
const MEMORY_BACKSTOP: u64 = 2560 << 20;

/// how the app starts a helper: on Windows without a console window
pub fn spawn_options(command: &mut std::process::Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(windows_sys::Win32::System::Threading::CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = command;
}

/// the system's backstop for one helper, for as long as it lives: on
/// Windows a job object that limits its memory and kills it with Blank; on
/// macOS, which doesn't enforce RLIMIT_AS, a thread that kills it when its
/// footprint grows past the backstop
pub struct Backstop {
    #[cfg(windows)]
    job: windows_sys::Win32::Foundation::HANDLE,
    #[cfg(target_os = "macos")]
    done: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

impl Backstop {
    #[cfg(not(any(target_os = "macos", windows)))]
    pub fn watch(_child: &std::process::Child) -> Backstop {
        Backstop {}
    }

    #[cfg(windows)]
    pub fn watch(child: &std::process::Child) -> Backstop {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, JOB_OBJECT_LIMIT_PROCESS_MEMORY,
        };
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if !job.is_null() {
                let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                limits.BasicLimitInformation.LimitFlags =
                    JOB_OBJECT_LIMIT_PROCESS_MEMORY | JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                limits.ProcessMemoryLimit = MEMORY_BACKSTOP as usize;
                SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    &limits as *const _ as *const std::ffi::c_void,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                );
                AssignProcessToJobObject(job, child.as_raw_handle() as _);
            }
            Backstop { job }
        }
    }

    #[cfg(target_os = "macos")]
    pub fn watch(child: &std::process::Child) -> Backstop {
        use std::sync::atomic::Ordering;
        let done = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let watching = done.clone();
        let pid = child.id() as libc::c_int;
        std::thread::spawn(move || {
            while !watching.load(Ordering::Relaxed) {
                let mut usage: libc::rusage_info_v2 = unsafe { std::mem::zeroed() };
                let read = unsafe {
                    libc::proc_pid_rusage(
                        pid,
                        libc::RUSAGE_INFO_V2,
                        &mut usage as *mut _ as *mut libc::rusage_info_t,
                    )
                };
                if read != 0 {
                    return;
                }
                if usage.ri_phys_footprint > MEMORY_BACKSTOP {
                    log::warn!("PDF helper: memory backstop");
                    unsafe { libc::kill(pid, libc::SIGKILL) };
                    return;
                }
                std::thread::sleep(std::time::Duration::from_millis(500));
            }
        });
        Backstop { done }
    }
}

impl Drop for Backstop {
    fn drop(&mut self) {
        #[cfg(windows)]
        if !self.job.is_null() {
            unsafe { windows_sys::Win32::Foundation::CloseHandle(self.job) };
        }
        #[cfg(target_os = "macos")]
        self.done.store(true, std::sync::atomic::Ordering::Relaxed);
    }
}

// the job's handle is only closed, from whichever thread drops it
#[cfg(windows)]
unsafe impl Send for Backstop {}
