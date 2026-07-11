# Autopilot recovery - 2026-07-11

## Root cause

The autopilot and publish scheduler treated operational waits longer than 12
hours as editorial rejections. Posts delayed by publishing windows, cooldowns
or Meta retries were cancelled and their news items were marked `rejected`.
Some cancelled posts also left their news item orphaned as `scheduled`.

## Changes

- Pending news remains eligible for 48 hours.
- Scheduled news may wait in the publishing queue for 72 hours.
- Operational expiry is stored as `failed`, not `rejected`.
- Cancelling duplicate queue rows also closes the duplicate news item.
- Cancelling an expired scheduled row also closes its news item.
- Subscription and Edge Function failures are recorded in `activity_logs`.
- The recovery migration requeues recent items rejected by the former 12-hour
  rule and recent scheduled orphans, while preserving deduplication.

## Lovable deployment order

1. Apply `20260711130000_recover_autopilot_freshness_rejections.sql`.
2. Deploy the `autopilot` Edge Function.
3. Deploy the `publish-scheduler` Edge Function.
4. Invoke `autopilot` once and inspect its response.
5. Inspect `activity_logs` for `autopilot_function_failed` or
   `publish_blocked_subscription` if a customer still does not publish.

The VPS does not need a deployment for this release.
