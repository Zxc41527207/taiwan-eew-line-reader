# Taiwan EEW LINE Reader

A Node.js worker that listens for Taiwan EEW packets over WebSocket and pushes each report to a LINE Official Account destination.

The reader expects JSON messages with outer `type: "eew_tw"` and `content.type: "TWEEW"`. It does not send a subscription frame. Duplicate reports are suppressed by `id` and `report_num`; later report numbers for the same earthquake are sent as updates.

## Run locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env` and set `LINE_CHANNEL_ACCESS_TOKEN` and `LINE_TO`.
3. Run `npm install`, then `npm test` and `npm start`.

`LINE_TO` is the LINE user, group, or room ID that the Official Account is allowed to message. Keep `.env` private and never commit it.

## Deploy to Render

Create a Blueprint from this repository using `render.yaml`, or create a Background Worker with build command `npm install` and start command `npm start`. Set `LINE_CHANNEL_ACCESS_TOKEN` and `LINE_TO` in the Render environment settings. Keep the worker running continuously to receive alerts.

The in-memory duplicate cache survives WebSocket reconnects but not a worker restart, so a replayed latest report after a restart could be sent again.

## Data note

This worker consumes the supplied RPTeS RFEQ WebSocket. The message's `eew_tw` type identifies the Taiwan EEW data as described by the feed; the notification includes a reminder to use Central Weather Administration information as the official source. This service is an additional notification channel, not an official warning system or a substitute for emergency alerts.