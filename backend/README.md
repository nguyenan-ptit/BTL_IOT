# Backend prototype

FastAPI + Paho MQTT receiver for firmware schema 6. It subscribes to `iot/devices/+/telemetry`, validates topic/payload and matching device ID, then stores accepted samples in SQLite. It also provides the current API/dashboard prototype and publishes threshold and buzzer-test commands.

## Local setup

From this directory on Windows:

```powershell
Copy-Item .\settings.example.json .\settings.local.json
py -m pip install -r requirements.txt
py -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Edit only `settings.local.json` for real values. For EMQX Serverless set the deployment hostname, port `8883`, `mqtt_tls: true`, topic `iot/devices/+/telemetry`, MQTT username/password, and `discovery_enabled: false`. Use credentials created under EMQX Access Control, not the console login. Put the provider CA file beside the settings file and set `mqtt_ca_certs` to its filename or absolute path. TLS peer/hostname verification remains enabled. `settings.local.json`, CA files, passwords, database files, and logs must not be committed.

The example defaults to a local non-TLS broker at `127.0.0.1:1884`; it is a template, not the Cloud configuration. `database` may be a relative SQLite filename or an absolute path. In the API, `/api/health` reports receiver status and counters, `/api/devices` returns latest device state, `/api/history?device_id=node02` returns history, and `/` serves the prototype dashboard.

## Current storage and handoff

`storage.py` creates `sensor_telemetry_v2` with `received_at` in UTC and a unique key on `(device_id, boot_id, seq)`. Duplicate samples are ignored; online is derived from the last valid receive time (20-second window). The currently verified deployment is a local FastAPI process receiving node02 telemetry from EMQX Cloud and saving it to SQLite.

**Long's next task:** replace SQLite operations and SQLite-specific error handling in `storage.py`/`app.py` with MySQL while keeping API responses and MQTT schema stable. Add a portable schema/migration under `../database/`, configure connection details through local settings/runtime secrets, preserve UTC receive timestamps and duplicate protection, and verify ingest/latest/history after restarts. Do not upload the local `.db` file or reuse credentials copied from a developer machine.

This is prototype code, not production deployment. API health, payload `test: true`, and `/api/devices` `prototype: true` are explicit test-state indicators. The frontend React app in `../frontend/` still needs integration with the API. Physical buzzer/LED behavior must be verified on the board.
