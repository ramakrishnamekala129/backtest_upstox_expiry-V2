# TrendDates Mobile Plan

## Goal
Build and maintain an Android app that displays trend tables with working month-based filtering from regenerated Python outputs.

## Current State
- React Native Android app builds and runs on emulator.
- Multi-month data export is enabled in `trendatestocks_v1.1.py`.
- App reads synced JSON from `mobile_table_viewer/assets/trend_tables.json`.

## Plan
1. Data pipeline
- Run `trendatestocks_v1.1.py` to regenerate `excel_output/trend_tables.json`.
- Use `BACKTEST_MONTHS` env var when wider history is needed.
- Verify generated JSON includes expected month keys before sync.

2. App data sync
- Run `npm run sync-data` in `mobile_table_viewer`.
- Confirm asset file timestamp changes after sync.

3. Build and install
- Build emulator APK with `npm run release-apk-emulator`.
- Install on emulator with `adb install -r`.
- Launch and validate no `ReactNativeJS` errors.

4. Functional checks
- Select a month and switch all tabs (`Trend Dates`, `Single View`, `Summary`, `Date Groups`).
- Confirm rows and metrics recalculate for selected month.
- Check empty-state behavior when a month has no rows in a tab.

5. Release readiness
- Build signed ARM64 release for real device testing.
- Keep emulator (`x86_64`) and phone (`arm64`) artifacts separate.
- Document the exact build command and output path for each target.

## Validation Checklist
- [ ] JSON regenerated successfully
- [ ] Multiple months present in synced asset
- [ ] APK installed successfully
- [ ] App launches without crash
- [ ] Month selection changes tab outputs
- [ ] Metrics update with filter changes

## Notes
- If month selection appears unchanged, first confirm the dataset has more than one month.
- Rebuild APK after each data sync so bundled asset changes are included.
