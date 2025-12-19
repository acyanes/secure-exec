# Host Exec Notify FD: Zero-CPU Idle Polling

## Problem

The current `host_exec` streaming implementation uses a polling loop with a 10ms timeout:

```rust
loop {
    poll_oneoff([stdin, 10ms_timeout]);  // Wake every 10ms
    host_exec_poll(session);              // Check for host output
}
```

This causes ~100 wakeups/second even when idle, wasting CPU.

## Goal

Enable `poll_oneoff` to wait on both stdin AND host output simultaneously, achieving zero CPU usage when idle:

```rust
poll_oneoff([stdin, notify_fd], timeout=∞);  // Only wake when data arrives
```

## Architecture Challenge

```
┌─────────────────────────────────────────────────────────────────┐
│ WASM Worker                                                     │
│   poll_oneoff blocks here                                       │
│   Uses Atomics.wait internally                                  │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ SharedArrayBuffer + Atomics
                          │
┌─────────────────────────────────────────────────────────────────┐
│ Main Thread (Scheduler)                                         │
│   Receives stdout/stderr from host process                      │
│   Needs to wake poll_oneoff when data arrives                   │
└─────────────────────────────────────────────────────────────────┘
```

The challenge: `poll_oneoff` uses wasmer-wasix's async VirtualFile polling mechanism. To integrate host_exec notifications, we need a VirtualFile whose `poll_read_ready` can be signaled from the scheduler.

## Proposed Solution: `host_exec_get_notify_fd`

### New Syscall

```rust
fn host_exec_get_notify_fd(session: u64, fd_ptr: *mut u32) -> Errno;
```

Returns a file descriptor that becomes readable when the session has output available.

### Implementation Components

#### 1. HostExecNotifyFile (VirtualFile implementation)

```rust
pub struct HostExecNotifyFile {
    session: HostExecSession,
    // Backed by SharedArrayBuffer in wasmer-js
    ready_flag: Arc<AtomicBool>,  // Or platform-specific mechanism
}

impl VirtualFile for HostExecNotifyFile {
    fn poll_read_ready(&self, cx: &mut Context) -> Poll<io::Result<usize>> {
        if self.ready_flag.load(Ordering::Acquire) {
            Poll::Ready(Ok(1))
        } else {
            // Register waker for async notification
            cx.waker().wake_by_ref();
            Poll::Pending
        }
    }

    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        // Consume the notification
        self.ready_flag.store(false, Ordering::Release);
        buf[0] = 1;
        Ok(1)
    }
}
```

#### 2. Trait Extension

```rust
trait HostExecRuntime {
    // ... existing methods ...

    /// Create a notification file for the session.
    /// The returned file becomes readable when output is available.
    fn host_exec_create_notify_file(
        &self,
        session: HostExecSession,
    ) -> BoxFuture<'_, Result<Box<dyn VirtualFile + Send + Sync>, anyhow::Error>>;
}
```

#### 3. Wasmer-js Implementation

The wasmer-js runtime would:
1. Create a SharedArrayBuffer for each session's notify flag
2. Return a HostExecNotifyFile backed by this buffer
3. When queuing output data, signal the buffer via `Atomics.store` + `Atomics.notify`

#### 4. Scheduler Changes

```rust
fn queue_output(&self, session_id: u64, data: ...) {
    OUTPUT_QUEUES.lock().unwrap()...push(data);

    // Signal the notification file
    if let Some(notify_buf) = NOTIFY_BUFFERS.get(&session_id) {
        Atomics::store(&notify_buf, 0, 1);
        Atomics::notify(&notify_buf, 0);
    }
}
```

### Files to Modify

| Repository | File | Changes |
|------------|------|---------|
| wasmer | `lib/wasix/src/syscalls/wasix/host_exec_get_notify_fd.rs` | New syscall |
| wasmer | `lib/wasix/src/syscalls/wasix/mod.rs` | Register syscall |
| wasmer | `lib/wasix/src/lib.rs` | Export syscall |
| wasmer | `lib/wasix/src/runtime/host_exec.rs` | Add trait method |
| wasmer | `lib/wasix/src/fs/host_exec_notify_file.rs` | New VirtualFile impl |
| wasmer-js | `src/runtime.rs` | Implement trait method |
| wasmer-js | `src/tasks/scheduler.rs` | Signal on data arrival |
| nanosandbox | `wasix-runtime/src/main.rs` | Use notify_fd in poll loop |

### Complexity

The main complexity is integrating with wasmer-wasix's async polling mechanism:

1. **VirtualFile::poll_read_ready** uses Rust's async `Context` and `Waker`
2. **wasmer-js uses Atomics.wait** for blocking, not Rust async
3. Need to bridge these two mechanisms

This requires understanding how `__asyncify` in wasmer-js converts async Rust code to blocking Atomics.wait calls.

### Estimated Effort

~300-400 lines across all files. The trickiest part is the VirtualFile implementation that correctly integrates with both the async polling mechanism and the SharedArrayBuffer signaling.

## Alternatives Considered

### 1. Adaptive Timeout

Simple improvement to current approach:
- Start with 10ms timeout
- Increase to 100ms when idle
- Decrease on activity

Pros: Simple, no new syscalls
Cons: Still has some CPU overhead

### 2. fd_pipe + host_exec_set_notify_fd

Use standard `fd_pipe()` to create a pipe, then bind it to a session:

```rust
let (read_fd, write_fd) = fd_pipe();
host_exec_set_notify_fd(session, write_fd);
poll_oneoff([stdin, read_fd], ...);
```

Pros: More POSIX-like
Cons: Standard pipes are intra-WASM; scheduler can't write to them without the same SharedArrayBuffer complexity

### 3. Threads (wasm32-wasip1-threads)

Use separate threads for stdin reading and host output reading.

Pros: Clean separation
Cons: **Doesn't work** - wasmer-js doesn't support wasm32-wasip1-threads target

## Current State

The poll-based implementation with 10ms timeout is working and all tests pass. The notify_fd optimization is deferred for future work due to complexity.

## References

- WASI poll_oneoff: https://github.com/WebAssembly/WASI/blob/main/legacy/preview1/docs.md#poll_oneoff
- wasmer-js asyncify: Uses binaryen's asyncify transform for blocking operations
- Linux eventfd: Similar concept for cross-thread notification
