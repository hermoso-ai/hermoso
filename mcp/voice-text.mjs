// ── THE AI VOICE-AGENT TOOLS' ANSWER TEXT (2026-11-18) ───────────────────────────────────────────────────────────
// One sentence per tool answer, shared by the in-app Studio agent (server.js) and both MCP twins (mcp/tools.mjs,
// cli/mcp/tools.mjs), so every surface describes the same result the same way. The routes put the facts in `note`;
// listings are written out here, because plenty of MCP clients show the text and nothing else.
// PURE and import-free: cli/mcp/ ships this file as a byte copy (the published package has no lib/).

const s = (v) => String(v ?? '');
const LABEL = { vapi: 'Vapi', retell: 'Retell AI', elevenlabs: 'ElevenLabs', telnyx: 'Telnyx AI' };
const lab = (p) => LABEL[p] || s(p);
const when = (v) => s(v).slice(0, 16).replace('T', ' ');

export function voiceToolText(name, d = {}) {
  const x = d && typeof d === 'object' ? d : {};
  const note = typeof x.note === 'string' && x.note.trim() ? x.note.trim() : '';
  switch (name) {
    case 'list_voice_agents': {
      const r = Array.isArray(x.agents) ? x.agents : [];
      if (!r.length) return note || 'No voice agents on the connected platform yet. create_voice_agent builds one from the brand profile.';
      return `${r.length} voice agent(s):\n` + r.slice(0, 60).map((a) => `• ${a.name || '(unnamed)'} (${a.id}, ${lab(a.provider)})${a.voice?.id ? ` · voice ${a.voice.id}` : ''}${a.llm ? ` · ${a.llm}` : ''}${a.updatedAt ? ` · updated ${when(a.updatedAt)}` : ''}`).join('\n') + (note ? `\n${note}` : '');
    }
    case 'get_voice_agent': {
      const a = x.agent || {};
      return [`${a.name || '(unnamed)'} (${a.id}, ${lab(a.provider)})`, a.firstMessage ? `First line: ${JSON.stringify(a.firstMessage)}` : 'Waits for the caller to speak first.', a.voice?.id ? `Voice: ${[a.voice.provider, a.voice.id].filter(Boolean).join(' ')}` : '', a.llm ? `Model: ${a.llm}` : '', a.language ? `Language: ${a.language}` : '', a.maxDurationSeconds ? `Longest call: ${a.maxDurationSeconds}s` : '', a.webhookUrl ? `Reports calls to: ${a.webhookUrl}` : '', a.prompt ? `Instructions:\n${s(a.prompt).slice(0, 4000)}` : ''].filter(Boolean).join('\n');
    }
    case 'draft_voice_agent': {
      const p = x.spec || {};
      return [note, p.name ? `Name: ${p.name}` : '', p.firstMessage ? `First line: ${JSON.stringify(p.firstMessage)}` : '', p.successCriteria ? `Success: ${p.successCriteria}` : '', Array.isArray(p.outcomeFields) && p.outcomeFields.length ? `Pulled from each call: ${p.outcomeFields.map((f) => `${f.name} (${f.type})`).join(', ')}` : '', p.prompt ? `Instructions:\n${s(p.prompt).slice(0, 6000)}` : ''].filter(Boolean).join('\n');
    }
    case 'list_voice_agent_voices': {
      const r = Array.isArray(x.voices) ? x.voices : [];
      return [`${r.length} voice(s) on ${lab(x.provider)}:`, ...r.slice(0, 80).map((v) => `• ${v.name || v.id} (${v.id})${v.provider && v.provider !== x.provider ? ` · ${v.provider}` : ''}${v.gender ? ` · ${v.gender}` : ''}${v.accent ? ` · ${v.accent}` : ''}${v.language ? ` · ${v.language}` : ''}`), note].filter(Boolean).join('\n');
    }
    case 'list_voice_agent_numbers': {
      const r = Array.isArray(x.numbers) ? x.numbers : [], f = Array.isArray(x.forwarded) ? x.forwarded : [];
      if (!r.length && !f.length) return note || `No numbers on ${lab(x.provider)} yet. attach_voice_agent_number puts one of the brand's Twilio or Telnyx numbers on an agent.`;
      return [`${r.length} number(s) on ${lab(x.provider)}:`, ...r.map((n) => `• ${n.phoneNumber || n.id} (${n.id}${n.carrier ? `, ${n.carrier}` : ''}) · ${n.agentId ? `answered by ${n.agentId}` : 'no agent'}${n.outboundAgentId ? ` · calls out as ${n.outboundAgentId}` : ''}`),
        ...(f.length ? [`${f.length} forwarded from Hermoso's call handling:`, ...f.map((n) => `• ${n.phoneNumber} (${n.carrier}) → agent ${n.agentId}`)] : []), note].filter(Boolean).join('\n');
    }
    case 'list_voice_agent_batches': {
      const b = Array.isArray(x.batches) ? x.batches : [];
      if (Array.isArray(x.calls)) return `${x.calls.length} call(s) in batch ${s(x.batchId)}:\n` + x.calls.slice(0, 80).map((c) => `• ${c.to} · ${c.status || '?'}${c.durationSec != null ? ` · ${c.durationSec}s` : ''}${c.successful != null ? ` · ${c.successful ? 'goal met' : 'goal not met'}` : ''} (${c.id})`).join('\n');
      if (!b.length) return note || 'No batches on this platform.';
      return `${b.length} batch(es):\n` + b.slice(0, 50).map((y) => `• ${y.name || y.id} (${y.id}) · ${y.status || '?'}${y.total != null ? ` · ${y.total} recipient(s)` : ''}${y.ended != null ? ` · ${y.ended} done` : ''}${y.createdAt ? ` · ${when(y.createdAt)}` : ''}`).join('\n');
    }
    case 'list_voice_agent_calls': {
      const c = Array.isArray(x.calls) ? x.calls : [];
      if (!c.length) return note || 'No voice-agent calls yet.';
      return `${c.length} call(s):\n` + c.slice(0, 60).map((y) => `• ${when(y.startedAt)} ${y.direction === 'out' ? '→' : y.direction === 'in' ? '←' : '·'} ${y.direction === 'out' ? y.to : y.from || 'web'} · ${lab(y.provider)} · ${y.status || '?'}${y.durationSec != null ? ` · ${y.durationSec}s` : ''}${y.successful != null ? ` · ${y.successful ? 'goal met' : 'goal not met'}` : ''}${y.summary ? ` · ${JSON.stringify(s(y.summary).slice(0, 160))}` : ''} (${y.id})`).join('\n') + (note ? `\n${note}` : '');
    }
    case 'get_voice_agent_call': {
      const c = x.call || {};
      const t = Array.isArray(c.transcript) ? c.transcript : [];
      return [`${c.direction === 'out' ? 'Outbound' : c.direction === 'in' ? 'Inbound' : 'Web'} call ${c.id} on ${lab(c.provider)}: ${c.from || '?'} → ${c.to || '?'} · ${c.status || '?'}${c.durationSec != null ? ` · ${c.durationSec}s` : ''}${c.endedReason ? ` · ended: ${c.endedReason}` : ''}${c.cost?.amount != null ? ` · ${c.cost.amount} ${c.cost.currency || ''} on the platform` : ''}`,
        c.summary ? `Summary: ${c.summary}` : '', c.successful != null ? (c.successful ? 'The call met its goal.' : 'The call did not meet its goal.') : '', c.sentiment ? `Caller sentiment: ${c.sentiment}` : '',
        c.outcome && typeof c.outcome === 'object' && Object.keys(c.outcome).length ? `Outcome: ${JSON.stringify(c.outcome).slice(0, 1500)}` : '', c.listenUrl ? `Recording: ${c.listenUrl}` : '',
        t.length ? `Transcript:\n${t.filter((y) => y.role !== 'tool').map((y) => `${y.role === 'caller' ? 'Caller' : 'Agent'}: ${y.text}`).join('\n').slice(0, 12000)}` : (c.transcriptText ? `Transcript:\n${s(c.transcriptText).slice(0, 12000)}` : '')].filter(Boolean).join('\n');
    }
    default: return note || 'Done.';
  }
}
