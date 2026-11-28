// MICROSOFT ADVERTISING REPORT WINDOWS: ONE LIST FOR THE SERVER AND EVERY TOOL SCHEMA (2026-11-28).
//
// Microsoft's ReportTimePeriod value set, exactly as published at
// https://learn.microsoft.com/en-us/advertising/reporting-service/reporttimeperiod (bingads-13, read 2026-11-28): 17
// values, in the order of Microsoft's own XSD. server.js validates `timePeriod` against this list (msaReport refuses
// anything else by name, case-insensitively) and the microsoft_ads_report tool schemas declare it as an enum, so the
// values a client is offered and the values the server accepts cannot drift apart.
//
// Why it is its own module: Anthropic's review of Hermoso Ads Reporting (2026-11-28) found the curated connector's
// timePeriod saying "must be one of the values in the description" while that connector's shorter description listed
// none. The values now live in the schema itself, where every connector's listing carries them.
//
// Pure, no imports. Byte-identical twins: mcp/msads-report-times.mjs and cli/mcp/msads-report-times.mjs. Pinned by
// tools/directory-reports-readonly-check.mjs and tools/msads-report-window-check.mjs.
export const MSADS_REPORT_TIMES = Object.freeze([
  'Today', 'Yesterday', 'LastSevenDays', 'ThisWeek', 'LastWeek', 'Last14Days', 'Last30Days', 'LastFourWeeks', 'ThisMonth',
  'LastMonth', 'LastThreeMonths', 'LastSixMonths', 'ThisYear', 'LastYear', 'ThisWeekStartingMonday', 'LastWeekStartingMonday',
  'LastFourWeeksStartingMonday',
]);
export const MSADS_REPORT_TIME_DEFAULT = 'Last30Days';
