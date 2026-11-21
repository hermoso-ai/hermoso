// ── THE CALENDAR TOOLS' ANSWER TEXT (2026-11-20) ───────────────────────────────────────────────────────────────────
// One sentence per tool answer, shared by the in-app Studio agent (server.js) and both MCP twins (mcp/tools.mjs,
// cli/mcp/tools.mjs), so every surface describes the same result the same way. The routes put the facts in `note`;
// listings are written out here, because plenty of MCP clients show the text and nothing else.
// PURE and import-free: cli/mcp/ ships this file as a byte copy (the published package has no lib/).

const s = (v) => String(v ?? '');
const LABEL = { google_calendar: 'Google Calendar', outlook_calendar: 'Outlook calendar' };

function wall(iso, tz) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return s(iso);
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return `${p.weekday} ${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
  } catch { return s(iso).slice(0, 16).replace('T', ' ') + ' UTC'; }
}
function span(e, tz) {
  if (e.allDay) return `${s(e.start)} (all day${e.end && e.end !== e.start ? `, until ${s(e.end)} exclusive` : ''})`;
  const a = wall(e.start, tz), b = wall(e.end, tz);
  return `${a} → ${a.slice(0, 14) === b.slice(0, 14) ? b.slice(15) : b} ${tz || 'UTC'}`;
}
function eventLine(e, tz) {
  const guests = Array.isArray(e.participants) ? e.participants.length : 0;
  return `• ${e.title || '(no title)'} · ${span(e, tz)}${e.location ? ` · ${e.location}` : ''}${e.conferencing && e.conferencing.url ? ` · ${e.conferencing.url}` : ''}${guests ? ` · ${guests} guest(s)` : ''}${e.type === 'series' ? ' · repeats' : ''}${e.status === 'cancelled' ? ' · cancelled' : ''} (${e.id})`;
}
function eventFull(e, tz) {
  const lines = [eventLine(e, tz).slice(2)];
  if (e.organizer && e.organizer.email) lines.push(`Organizer: ${e.organizer.email}${e.organizer.self ? ' (this calendar)' : ''}`);
  for (const p of (e.participants || []).slice(0, 40)) lines.push(`  - ${p.email}${p.name ? ` (${p.name})` : ''}: ${p.status}${p.optional ? ', optional' : ''}${p.resource ? ', room' : ''}`);
  if (Array.isArray(e.recurrence) && e.recurrence.length) lines.push(`Repeats: ${e.recurrence.join(' ')}`);
  if (e.masterEventId) lines.push(`Part of series ${e.masterEventId}`);
  if (e.reminders && Array.isArray(e.reminders.overrides) && e.reminders.overrides.length) lines.push(`Reminders: ${e.reminders.overrides.map((r) => `${r.minutes} min ${r.method}`).join(', ')}`);
  if (e.htmlLink) lines.push(`Open: ${e.htmlLink}`);
  return lines.join('\n');
}

export function calendarToolText(name, d = {}) {
  const x = d && typeof d === 'object' ? d : {};
  const note = typeof x.note === 'string' && x.note.trim() ? x.note.trim() : '';
  const tz = s(x.timezone) || 'UTC';
  switch (name) {
    case 'list_calendars': {
      const r = Array.isArray(x.calendars) ? x.calendars : [];
      const err = Array.isArray(x.errors) && x.errors.length ? `\nCould not read: ${x.errors.map((e) => `${e.account} (${e.error})`).join('; ')}` : '';
      return (r.length ? r.slice(0, 80).map((c) => `• ${c.name}${c.primary ? ' (main)' : ''} · ${LABEL[c.provider] || c.provider} ${c.account}${c.timezone ? ` · ${c.timezone}` : ''}${c.readOnly ? ' · read only' : ''} (calendarId ${c.id})`).join('\n') + '\n' : '') + note + err;
    }
    case 'list_calendar_events': {
      const r = Array.isArray(x.events) ? x.events : [];
      if (!r.length) return `${note}\nNo events in that window. That is a real empty calendar, not a failed read.`;
      return `${note}\n${r.slice(0, 100).map((e) => eventLine(e, tz)).join('\n')}${x.cursor ? `\n(more: pass cursor=${x.cursor})` : ''}`;
    }
    case 'get_calendar_event':
      return x.event ? `${eventFull(x.event, tz)}\n${note}` : note;
    case 'create_calendar_event':
    case 'update_calendar_event':
    case 'respond_to_calendar_event':
      return x.event ? `${note}\n${eventFull(x.event, tz)}` : note;
    case 'delete_calendar_event':
      return note;
    case 'calendar_free_busy': {
      const r = Array.isArray(x.calendars) ? x.calendars : [];
      return `${note}\n${r.map((c) => (c.busy == null ? `• ${c.who}: could not read (${c.error || 'unknown'})` : `• ${c.who}: ${c.busy.length ? c.busy.slice(0, 40).map((b) => span({ start: b.start, end: b.end }, tz)).join('; ') : 'free the whole window'}`)).join('\n')}`;
    }
    case 'find_meeting_slots': {
      const r = Array.isArray(x.slots) ? x.slots : [];
      if (!r.length) return `${note}\nNo time in that window works. Widen the window, shorten the meeting, or pass anyTime:true to look outside working hours.`;
      return `${note}\n${r.slice(0, 60).map((t) => `• ${span({ start: t.start, end: t.end }, tz)}${Array.isArray(t.available) ? ` · free: ${t.available.join(', ')}` : ''}`).join('\n')}`;
    }
    default:
      return note || 'Done.';
  }
}
