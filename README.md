# Taiwan EEW LINE Reader

A Node.js worker that listens for Taiwan EEW packets from the RPTeS RFEQ WebSocket and pushes new or updated reports to a LINE Official Account destination.

The worker listens for pushed RPtES RFEQ packets and parses `eew_tw` content. Duplicate reports are deduplicated by `id` and `report_num`.

## Run locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env` and set `LINE_CHANNEL_ACCESS_TOKEN` for a Messaging API Channel enabled for broadcast.
3. Run `npm install`, then `npm test` and `npm start`.

`LINE_CHANNEL_ACCESS_TOKEN` must belong to a Messaging API Channel with broadcast enabled. The service sends one broadcast message to recipients eligible for the Official Account. Broadcast does not guarantee delivery to every add-friend contact; LINE plan and Messaging API policies apply. Keep `.env` private and never commit it.

## Deploy to Render

Create a Blueprint from this repository using `render.yaml`, or create a Background Worker with build command `npm install` and start command `npm start`. Set `LINE_CHANNEL_ACCESS_TOKEN` in the Render environment settings. Keep the worker running continuously to receive alerts.

Successfully sent report keys are persisted in `DEDUPE_FILE` (default `/tmp/taiwan-eew-line-reader-dedupe.json`) so same-service restarts do not immediately resend old reports. The `/tmp` location should be changed to a Render Persistent Disk path for storage across instance rebuilds.

## Data note

This worker consumes the TWEarthquake third-party API, not the Central Weather Administration API. Only EEW alerts are forwarded; P-Alert, reports, tsunami messages, and Firebase notifications are not handled. The notification reminds recipients to use Central Weather Administration information as the official source. This is an additional notification channel, not an official warning system or a substitute for emergency alerts; use the service in accordance with its terms and avoid increasing the polling rate.