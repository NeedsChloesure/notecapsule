#!/usr/bin/env python3

# This script is for administrating the durable objects in the cloud.

import os
import requests
from datetime import datetime, timezone


CF_API_TOKEN = os.environ["CF_API_TOKEN"]
ACCOUNT_ID = os.environ["CF_ACCT_ID"]
NAMESPACE_ID = os.environ["DO_NAMESPACE_ID"]
DO_INFO_URL = os.environ["DO_INFO_URL"]
DO_AUTH_HEADER = os.environ["DO_AUTH"]

HEADERS = {
    "Authorization": f"Bearer {CF_API_TOKEN}",
}

DO_HEADERS = {
    "Authorization": f"Bearer {DO_AUTH_HEADER}"
}

def list_objects():
    objects = []
    cursor = None

    while True:
        params = {"limit": 10000}

        if cursor:
            params["cursor"] = cursor

        url = (
            f"https://api.cloudflare.com/client/v4"
            f"/accounts/{ACCOUNT_ID}"
            f"/workers/durable_objects/namespaces/{NAMESPACE_ID}"
            f"/objects"
        )

        response = requests.get(
            url,
            headers=HEADERS,
            params=params,
            timeout=30,
        )
        response.raise_for_status()

        data = response.json()

        if not data.get("success"):
            raise RuntimeError(data)

        objects.extend(data["result"])

        cursor = data.get("result_info", {}).get("cursor")

        if not cursor:
            break

    return objects


def get_object_info(object_id):
    response = requests.get(
        DO_INFO_URL,
        params={"DO": object_id},
        timeout=30,
        headers=DO_HEADERS
    )
    response.raise_for_status()

    return response.json()


def format_bytes(size):
    if size is None:
        return "?"
    # Kilobyte & Kibibyte isn't a mismatch here really,
    # Cloudflare displays *Kilobytes* (or MB/GB) in the dash
    # But the docs use MiB as the max value size. The decision here is
    # intentional.
    if size < 1024:
        return f"{size} B"
    elif size < 1024 ** 2:
        return f"{size / 1000:.2f} KB"
    elif size < 1024 ** 3:
        return f"{size / 1000**2:.2f} MB"
    else:
        return f"{size / 1000**3:.2f} GB"


# Unused, but can be used for formatting alarm timestamps (stored in ms)
# for date-string display. I'm including it here for someone else to use it.
def format_alarm(timestamp_ms):
    if timestamp_ms is None:
        return "NONE"

    dt = datetime.fromtimestamp(
        timestamp_ms / 1000,
        tz=timezone.utc,
    )

    return dt.isoformat()


def main():
    print("Getting Durable Objects...")

    objects = list_objects()

    print(f"Found {len(objects)} objects.")
    print()

    suspicious = []
    total_size = 0
    stored_data = 0
    total_skipped_suspected_fired = 0

    for obj in objects:
        object_id = obj["id"]
        has_stored_data = obj.get("hasStoredData", False)
        if has_stored_data:
          stored_data += 1
          try:
              info = get_object_info(object_id)

              size = info.get("size")
              alarm = info.get("alarm")

              if size == 4096 and alarm is None:
                  # Why continue here?
                  # if the alarm is none, but the size is 4096
                  # the likely cause is that the DO alarm *fired*
                  # and cleared the data stored, but the API
                  # response hasn't caught up yet.
                  # A better implementation would check these later
                  # in about 15 minutes to see if the API response caught
                  # up to reality, but just skipping over them for now is
                  # ok with me.
                  total_skipped_suspected_fired += 1
                  continue
              
              if size is not None:
                  total_size += size

              # The ONLY condition we consider suspicious.
              if alarm is None:
                  suspicious.append({
                      "id": object_id,
                      "size": size,
                      "hasStoredData": has_stored_data,
                      "alarm": alarm,
                  })

          except Exception as e:
              print(f"ERROR inspecting {object_id}: {e}")

    print(f"Total DO storage: {format_bytes(total_size)}")
    print()

    if not suspicious:
        print("OK: No suspicious Durable Objects found.")
        print("Every object with stored data has an alarm.")
        print(f"Objects with stored stored data: {stored_data}")
        print(f"Objects skipped because their alarm has likely fired: {total_skipped_suspected_fired}")
        return

    print("=" * 80)
    print(f"SUSPICIOUS OBJECTS: {len(suspicious)}")
    print("Stored data exists, but no alarm is scheduled.")
    print("=" * 80)
    print()
    print(f"Objects with stored data: {stored_data}")
    print(f"Objects omitted from suspicious treatment due to heuristics: {total_skipped_suspected_fired}")

    for obj in suspicious:
        print(
            f"{obj['id']}  "
            f"size={format_bytes(obj['size'])}  "
            f"stored={obj['hasStoredData']}  "
            f"alarm=NONE"
        )


if __name__ == "__main__":
    main()
