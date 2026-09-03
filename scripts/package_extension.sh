#!/bin/sh
set -eu

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
extension_dir="$root_dir/extension"
dist_dir="$root_dir/dist"
version=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$extension_dir/manifest.json")
archive="$dist_dir/creator-intel-personal-v${version}.zip"

if rg -n -i 'grow-max|growmax|kol\.grow|max\.com|feishu|lark|googleusercontent|client_secret|campaign|customer-project|wishlist|outreach|blacklist' "$extension_dir"; then
  echo "Packaging stopped: company-only reference found" >&2
  exit 1
fi

mkdir -p "$dist_dir"
rm -f "$archive"
(cd "$extension_dir" && zip -qr "$archive" . \
  -x '*.DS_Store' 'assets/brand/*' 'assets/icon-source.svg')
printf '%s\n' "$archive"
