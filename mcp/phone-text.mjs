// ── THE PHONE / SMS / VOICE TOOLS' ANSWER TEXT (2026-11-18) ──────────────────────────────────────────────────────
// One sentence per tool answer, shared by the in-app Studio agent (server.js) and both MCP twins (mcp/tools.mjs,
// cli/mcp/tools.mjs), so every surface describes the same result the same way. The routes put the facts in `note`
// where there is one; the listings are written out here, because plenty of MCP clients show the text and nothing else.
// PURE and import-free: cli/mcp/ ships this file as a byte copy (the published package has no lib/).

const s = (v) => String(v ?? '');
const caps = (c) => (c ? ['sms', 'mms', 'voice'].filter((k) => c[k]).map((k) => k.toUpperCase()).join('/') : '');

export function phoneToolText(name, d = {}) {
  const x = d && typeof d === 'object' ? d : {};
  const note = typeof x.note === 'string' && x.note.trim() ? x.note.trim() : '';
  switch (name) {
    case 'list_phone_numbers': {
      const rows = Array.isArray(x.numbers) ? x.numbers : [];
      if (!rows.length) return note || 'No phone numbers on the connected account. search_phone_numbers finds one to buy.';
      return `${rows.length} number(s):\n` + rows.map((n) => `• ${n.phoneNumber} (${n.id}, ${n.provider || ''}${caps(n.capabilities) ? `, ${caps(n.capabilities)}` : ''}) · texts ${n.inbox ? 'come into the Inbox' : 'not in the Inbox'} · calls ${n.handling || 'not handled by Hermoso'}`).join('\n') + (note ? `\n${note}` : '');
    }
    case 'search_phone_numbers': {
      const rows = Array.isArray(x.numbers) ? x.numbers : [];
      return rows.length ? `${note}\n` + rows.slice(0, 30).map((n) => `• ${n.phoneNumber}${n.locality || n.region ? ` · ${[n.locality, n.region].filter(Boolean).join(', ')}` : ''}${caps(n.capabilities) ? ` · ${caps(n.capabilities)}` : ''}${n.monthlyCost?.amount != null ? ` · ${n.monthlyCost.amount} ${n.monthlyCost.currency || ''}/month` : ''}${n.addressRequired && n.addressRequired !== 'none' ? ` · needs an address (${n.addressRequired})` : ''}`).join('\n') : note;
    }
    case 'send_sms': {
      const rows = Array.isArray(x.results) ? x.results : [];
      return [note, ...rows.filter((r) => r.sent).slice(0, 20).map((r) => `• ${r.to}: ${r.status || 'accepted'} (${r.id}, ${r.segments ?? '?'} segment(s))${r.notes?.length ? ` · ${r.notes.join(' ')}` : ''}`)].filter(Boolean).join('\n');
    }
    case 'get_sms_status': return note || `${s(x.message?.to)}: ${s(x.message?.status) || 'unknown'}`;
    case 'sms_conversation': {
      const m = Array.isArray(x.messages) ? x.messages : [];
      if (!m.length) return `No texts with ${s(x.with)} ${x.source === 'inbox' ? 'kept in the Inbox (30 days)' : 'on the account'}.`;
      return `${m.length} text(s) with ${s(x.with)}:\n` + m.map((y) => `${s(y.at).slice(0, 16).replace('T', ' ')} ${y.direction === 'in' ? '←' : '→'} ${JSON.stringify(s(y.text).slice(0, 300))}${y.status ? ` (${y.status})` : ''}`).join('\n');
    }
    case 'set_sms_settings': {
      if (note) return note;
      const t = x.settings || {};
      return `${s(x.provider)} sending settings: quiet hours ${t.quietHours ? `on (${t.quietStart}:00–${t.quietEnd}:00 recipient time)` : 'off'}, opt-out list ${t.optOutList ? 'on' : 'off'}, consent note ${t.consentCheck ? 'on' : 'off'}${x.messagingServiceSid ? `, Messaging Service ${x.messagingServiceSid}` : ''}.`;
    }
    case 'list_sms_consents': {
      const r = Array.isArray(x.records) ? x.records : [];
      if (!r.length) return 'No consent records or opt-outs kept for this brand.';
      return `${r.length} number(s):\n` + r.slice(0, 50).map((y) => `• ${y.phone}${y.consent ? ` · consent: ${y.consent.source} (${s(y.consent.at).slice(0, 10)})${y.consent.marketing === false ? ', not marketing' : ''}` : ''}${y.optedOut ? ` · opted out ${s(y.optedOutAt).slice(0, 10)}${y.keyword ? ` (${y.keyword})` : ''}` : ''}`).join('\n');
    }
    case 'list_provider_opt_outs': {
      if (x.available === false) return note;
      const r = Array.isArray(x.optOuts) ? x.optOuts : [];
      return r.length ? `${r.length} number(s) Telnyx blocks after an opt-out:\n` + r.slice(0, 50).map((o) => `• ${o.phone} → ${o.to} (${o.keyword || 'STOP'}, ${s(o.at).slice(0, 10)})`).join('\n') : 'Telnyx lists no opt-outs.';
    }
    case 'sms_registration_status': {
      const b = Array.isArray(x.brands) ? x.brands : [], k = Array.isArray(x.campaigns) ? x.campaigns : [], tf = Array.isArray(x.tollFree) ? x.tollFree : [];
      return [note, ...b.map((y) => `• brand ${y.name || y.id}: ${y.status}${y.identityStatus ? ` (${y.identityStatus})` : ''}`), ...k.map((y) => `• campaign ${y.id} (${y.useCase || '?'}): ${y.status}${y.messagingServiceName ? ` · service ${y.messagingServiceName}` : ''}`), ...tf.map((y) => `• toll-free ${y.phoneNumber || (y.phoneNumbers || []).join('/')}: ${y.status}${y.rejectionReason || y.reason ? ` (${y.rejectionReason || y.reason})` : ''}`)].filter(Boolean).join('\n');
    }
    case 'list_calls': {
      const c = Array.isArray(x.calls) ? x.calls : [];
      if (!c.length) return note || 'No calls on these numbers yet.';
      return `${c.length} call(s):\n` + c.slice(0, 40).map((y) => `• ${s(y.startedAt || (y.at ? new Date(y.at).toISOString() : '')).slice(0, 16).replace('T', ' ')} ${y.from} → ${y.to} · ${y.status || '?'}${y.duration != null ? ` · ${y.duration}s` : ''}${y.missed ? ' · missed' : ''}${y.textedBack ? ' · texted back' : ''}${y.tracking?.campaign ? ` · ${y.tracking.campaign}` : ''} (${y.id})`).join('\n') + (note ? `\n${note}` : '');
    }
    case 'list_call_recordings': {
      const r = Array.isArray(x.recordings) ? x.recordings : [];
      return r.length ? `${r.length} recording(s) of ${s(x.callId)}:\n` + r.map((y) => `• ${y.id} · ${y.duration ?? '?'}s · ${y.status || ''}${y.transcript ? `\n  ${JSON.stringify(s(y.transcript).slice(0, 600))}` : ''}`).join('\n') : note;
    }
    case 'transcribe_call': return x.transcript ? `Transcript of ${s(x.callId)}${x.creditsUsed ? ` (${x.creditsUsed} credit(s))` : ''}:\n${s(x.transcript)}` : note;
    case 'call_tracking_report': return note || 'No tracked calls.';
    case 'list_shopify_sms_buyers': {
      const r = Array.isArray(x.buyers) ? x.buyers : [];
      return [note, ...r.slice(0, 40).map((y) => `• ${y.name || '(no name)'} ${y.phone} · ${y.kind === 'order' ? `order ${y.order}` : 'abandoned checkout'} · ${y.total || ''} · SMS consent ${y.smsConsent || 'unknown'}`)].filter(Boolean).join('\n');
    }
    default: return note || 'Done.';
  }
}
