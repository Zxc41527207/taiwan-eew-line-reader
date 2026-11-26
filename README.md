# Taiwan EEW LINE Reader

A Node.js worker that listens for Taiwan EEW packets from the RPTeS RFEQ WebSocket and pushes new or updated reports to a LINE Official Account destination.

The worker checks `HasEarthquake` before reading the `Earthquake` object, parses its `data` JSON string, and signs each polling request with the timestamp headers used by the website. Polling is sequential and defaults to one request every two seconds; `POLL_INTERVAL_MS` cannot be set below 2000.

## Run locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env`, set `LINE_CHANNEL_ACCESS_TOKEN` and `LINE_TO`, and choose an `EEW_LOCATION_CODE` such as `Taipei` or `Hualien`.
3. Run `npm install`, then `npm test` and `npm start`.

`LINE_TO` is the LINE user, group, or room ID that the Official Account is allowed to message. `INITIALIZATION_URL` can override the default initialization endpoint, and the real-time API URL is taken from its response. Keep `.env` private and never commit it.

## Deploy to Render

Create a Blueprint from this repository using `render.yaml`, or create a Background Worker with build command `npm install` and start command `npm start`. Set `LINE_CHANNEL_ACCESS_TOKEN` and `LINE_TO` in the Render environment settings, and configure `EEW_LOCATION_CODE` for the area to monitor. Keep the worker running continuously to receive alerts.

The in-memory duplicate cache prevents repeated alerts while the worker is running, but it does not survive a worker restart, so the current alert could be sent again after a restart.

## Data note

This worker consumes the TWEarthquake third-party API, not the Central Weather Administration API. Only EEW alerts are forwarded; P-Alert, reports, tsunami messages, and Firebase notifications are not handled. The notification reminds recipients to use Central Weather Administration information as the official source. This is an additional notification channel, not an official warning system or a substitute for emergency alerts; use the service in accordance with its terms and avoid increasing the polling rate.