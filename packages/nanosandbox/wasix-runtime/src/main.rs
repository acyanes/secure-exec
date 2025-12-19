use std::collections::HashMap;
use std::env;
use std::io::{self, Read, Write};
use std::process::exit;

// Syscall imports
#[link(wasm_import_module = "wasix_32v1")]
extern "C" {
    fn host_exec_start(
        request_ptr: *const u8,
        request_len: usize,
        session_ptr: *mut u64,
    ) -> i32;

    fn host_exec_read(
        session: u64,
        type_ptr: *mut u32,
        data_ptr: *mut u8,
        data_len_ptr: *mut usize,
    ) -> i32;

    fn host_exec_write(
        session: u64,
        data_ptr: *const u8,
        data_len: usize,
    ) -> i32;

    fn host_exec_close_stdin(session: u64) -> i32;
}

// Message type constants
const HOST_EXEC_STDOUT: u32 = 1;
const HOST_EXEC_STDERR: u32 = 2;
const HOST_EXEC_EXIT: u32 = 3;

#[derive(serde::Serialize)]
struct Request {
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    cwd: String,
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let command = env::var("HOST_EXEC_COMMAND").unwrap_or_else(|_| "node".to_string());

    eprintln!("[wasix-shim] Starting with command: {} args: {:?}", command, &args[1..]);

    // Build request
    let request = Request {
        command,
        args: args[1..].to_vec(),
        env: env::vars().collect(),
        cwd: env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| "/".to_string()),
    };

    let request_json = match serde_json::to_vec(&request) {
        Ok(j) => j,
        Err(e) => {
            eprintln!("[wasix-shim] Failed to serialize request: {}", e);
            exit(1);
        }
    };

    // Start host execution
    let mut session: u64 = 0;
    let errno = unsafe {
        host_exec_start(
            request_json.as_ptr(),
            request_json.len(),
            &mut session,
        )
    };

    if errno != 0 {
        eprintln!("[wasix-shim] host_exec_start failed with errno {}", errno);
        exit(1);
    }

    eprintln!("[wasix-shim] Session started: {}", session);

    // Forward stdin to host process (batch mode - read all, then send)
    // This works for non-interactive use cases where stdin is provided upfront
    {
        let mut stdin_buf = Vec::new();
        if let Ok(n) = io::stdin().read_to_end(&mut stdin_buf) {
            if n > 0 {
                eprintln!("[wasix-shim] Sending {} bytes of stdin to host", n);
                let errno = unsafe {
                    host_exec_write(session, stdin_buf.as_ptr(), stdin_buf.len())
                };
                if errno != 0 {
                    eprintln!("[wasix-shim] host_exec_write failed with errno {}", errno);
                }
            }
        }
        // Close stdin to signal EOF to the host process
        unsafe { host_exec_close_stdin(session) };
        eprintln!("[wasix-shim] Closed stdin");
    }

    // Main loop: read output from host and forward to our stdio
    let mut stdout = io::stdout();
    let mut stderr = io::stderr();
    let mut buf = vec![0u8; 64 * 1024]; // 64KB buffer

    loop {
        let mut msg_type: u32 = 0;
        let mut data_len = buf.len();

        let errno = unsafe {
            host_exec_read(
                session,
                &mut msg_type,
                buf.as_mut_ptr(),
                &mut data_len,
            )
        };

        if errno != 0 {
            eprintln!("[wasix-shim] host_exec_read failed with errno {}", errno);
            exit(1);
        }

        match msg_type {
            HOST_EXEC_STDOUT => {
                if let Err(e) = stdout.write_all(&buf[..data_len]) {
                    eprintln!("[wasix-shim] stdout write error: {}", e);
                }
                let _ = stdout.flush();
            }
            HOST_EXEC_STDERR => {
                if let Err(e) = stderr.write_all(&buf[..data_len]) {
                    eprintln!("[wasix-shim] stderr write error: {}", e);
                }
                let _ = stderr.flush();
            }
            HOST_EXEC_EXIT => {
                // data_len contains the exit code
                let exit_code = data_len as i32;
                eprintln!("[wasix-shim] Exiting with code {}", exit_code);
                exit(exit_code);
            }
            _ => {
                eprintln!("[wasix-shim] Unknown message type: {}", msg_type);
                exit(1);
            }
        }
    }
}
