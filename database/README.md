# Database handoff

The checked-in backend currently uses SQLite through `backend/storage.py`. On startup it creates `sensor_telemetry_v2` with:

- `device_id`, `boot_id`, `seq` as the sample identity, unique on all three;
- `received_at` stored as an ISO 8601 UTC timestamp from the backend clock;
- the validated schema-6 JSON payload stored for latest-state and history responses;
- an index supporting latest/history lookup by device.

No live `.db` file belongs in Git. Long's task is to add the MySQL schema and migration/initialization here, then change the storage adapter and settings without changing the MQTT topic or API contract. Preserve idempotent ingestion, UTC receive time, and the 20-second online calculation. Document how to create the database and configure secrets locally; never commit passwords or production connection strings.
