#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

PUBLIC_FIELDS = ("platform", "handle", "profileUrl", "followers", "avgViews")
PRICE_FIELDS = ("historicalCost", "externalQuote", "cpm")
COLLABORATION_FIELDS = ("count", "lastDate", "products", "totalCost")
POST_FIELDS = ("product", "date", "cost", "externalQuote", "link", "views", "engagementRate", "metricsWindow")


def scalar(value):
    return value if value is None or isinstance(value, (str, int, float, bool)) else None


def private_fields(record):
    price_source = record.get("price") if isinstance(record.get("price"), dict) else {}
    collaboration_source = record.get("collaboration") if isinstance(record.get("collaboration"), dict) else {}
    price = {field: scalar(price_source.get(field)) for field in PRICE_FIELDS}
    collaboration = {field: scalar(collaboration_source.get(field)) for field in COLLABORATION_FIELDS if field != "products"}
    products = collaboration_source.get("products")
    collaboration["products"] = [str(value) for value in products if isinstance(value, (str, int, float))] if isinstance(products, list) else []
    posts = []
    for post in collaboration_source.get("posts") or []:
        if isinstance(post, dict):
            posts.append({field: scalar(post.get(field)) for field in POST_FIELDS})
    collaboration["posts"] = posts
    return {"price": price, "collaboration": collaboration}


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
        records[key] = {
            **{field: record.get(field) for field in PUBLIC_FIELDS},
            "private": private_fields(record),
        }
    return {
        "schemaVersion": 2,
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
    print(json.dumps({
        "records": len(output["records"]),
        "publicFields": list(PUBLIC_FIELDS),
        "privateFields": ["price", "collaboration"],
    }))


if __name__ == "__main__":
    main()
