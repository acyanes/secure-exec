#!/bin/bash
set -e

cd "$(dirname "$0")"

# Build Rust to WASM using WASIX target for subprocess support
# WASIX provides proc_spawn2, fd_dup2, etc. needed for native subprocess spawning
echo "==> Building WASM module..."
cargo wasix build --release

# Package into .webc
echo "==> Packaging .webc..."
rm -f ../assets/runtime.webc
wasmer package build -o ../assets/runtime.webc

echo ""
echo "==> Built runtime.webc"
