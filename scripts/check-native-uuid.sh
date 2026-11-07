#!/usr/bin/env bash
set -euo pipefail

# The source can belong to an isolated checkout; it is read, never executed or edited.
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source_file="${1:-$root/android-native/app/src/main/java/cl/alejandrino/nativeapp/NativeCheckService.java}"
if [[ $# -gt 0 ]]; then shift; fi
java "$root/tests/android/NativeUuidContractTest.java" "$source_file" "$@"
