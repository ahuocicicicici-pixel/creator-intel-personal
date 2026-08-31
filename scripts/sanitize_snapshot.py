#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

PUBLIC_FIELDS = ("platform", "handle", "profileUrl", "followers", "avgViews")


def sanitize(source):
    records = {}
    for key, record in source.get("records", {}).items():
        if not isinstance(record, dict):
            continue
        platform = str(record.get("platform") or "").upper().strip()
        handle = str(record.get("handle") or "").lower().lstrip("@").strip()
        expected = f"{platform}:{handle}"
        if key != expected or platform not in {"IG", "TT", "YT", "X"} or not handle:
            continue
        records[key] = {field: record.get(field) for field in PUBLIC_FIELDS}
    return {
        "schemaVersion": 1,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "sourceLastSyncAt": source.get("lastSyncAt"),
        "records": records,
    }


def main():
    parser = argparse.ArgumentParser(description="Create a public-only personal creator library snapshot")
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    output = sanitize(json.loads(args.source.read_text()))
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    args.destination.write_text(json.dumps(output, separators=(",", ":")))
    print(json.dumps({"records": len(output["records"]), "fields": list(PUBLIC_FIELDS)}))


if __name__ == "__main__":
    main()
