// A YOUTUBE LINK AS THE SOURCE FILE OF A JOB IS REFUSED AT THE DOOR, ON EVERY SURFACE (usage review 2026-11-26).
//
// YouTube does not let our servers download its videos (server.js YOUTUBE_DOWNLOADABLE has the measurements). POST
// /api/jobs already refused a YouTube source before any hold, but it was the ONLY door that asked: the Studio agent
// planned the edit, drew its card, told the user it was starting, and the app's submit then came back 400 — fifteen
// times across five accounts in one day ("make clips from this", "add subtitles to this" on a YouTube link). So the
// same question is now asked where each surface first holds the link:
//   · the Studio agent, before any tool card, quote or dispatch (server.js runExploreTool → studioYoutubeRefusal);
//   · the MCP / CLI tools, before anything is sent (mcp/client.mjs submitJob, the one seam every job tool submits through);
//   · the web app, before it posts (public/app.js runJob mirrors youtubeFileJobInput; tools/youtube-link-early-refusal-check.mjs
//     runs both on the same table so the mirror cannot drift);
//   · and the server doors themselves (POST /api/jobs, jobHoldQuote, chatRenderJob), which stay the floor.
// Where the words of the video help the job (clips chosen by what is said, subtitles, a dub), the refusal also says
// what the link CAN give: its captions, read by analyze_video (0ee9460f), the spoken words with timestamps and not
// the picture. PURE, no imports: the server and both MCP twins import this same file (cli/mcp/ is a byte twin).

const YOUTUBE_DOMAINS = ['youtube.com', 'youtu.be', 'youtube-nocookie.com'];

/** An http(s) link on YouTube: youtube.com and every subdomain (www, m, music), youtu.be, youtube-nocookie.com. */
export function isYouTubeUrl(raw) {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!/^https?:\/\//i.test(s)) return false;
  let h = '';
  try { h = new URL(s).hostname.toLowerCase().replace(/\.$/, ''); } catch { return false; }
  return YOUTUBE_DOMAINS.some((d) => h === d || h.endsWith('.' + d)); // "notyoutube.com" and "youtube.com.evil.tld" both miss
}

/** The job types whose worker needs the video FILE (a YouTube page has none we can fetch). */
export const YOUTUBE_FILE_JOBS = new Set(['clipper', 'lineswap', 'subtitles', 'reframe', 'upscale', 'videoedit', 'dub', 'voiceswap', 'multiply', 'motion', 'motionmoving', 'postedit', 'videofinish', 'fixbeat', 'repurpose', 'explainer']);
/** The job types where the video's WORDS help: what is said picks the clips, makes the subtitles, is what a dub translates. */
export const YOUTUBE_TRANSCRIPT_HELPS_JOBS = new Set(['clipper', 'subtitles', 'dub', 'lineswap', 'voiceswap']);

// The fields that name a source video, at the top of an input and inside its lists (a post_edit's ops, a stitch's clips).
const SOURCE_KEYS = ['video', 'url', 'videoUrl', 'src', 'source', 'hook', 'fromVideo', 'sourceVideo', 'audio'];
const LIST_KEYS = ['clips', 'videos', 'ops', 'segments', 'sources', 'inserts'];
const ITEM_KEYS = ['src', 'source', 'video', 'videoUrl', 'fromVideo', 'sourceVideo']; // never a nested `url`: an op's url is often a link, not footage

/** The first YouTube link an input names as its source video, or '' when it names none. */
export function youtubeSourceIn(input) {
  if (!input || typeof input !== 'object') return '';
  for (const k of SOURCE_KEYS) if (isYouTubeUrl(input[k])) return input[k].trim();
  for (const k of LIST_KEYS) {
    const list = input[k];
    if (!Array.isArray(list)) continue;
    for (const it of list.slice(0, 200)) {
      if (isYouTubeUrl(it)) return it.trim();
      if (it && typeof it === 'object') for (const j of ITEM_KEYS) if (isYouTubeUrl(it[j])) return it[j].trim();
    }
  }
  return '';
}

/** True when a job of this type would have to download a YouTube video. `downloadable` is the deployment's switch (off everywhere). */
export function youtubeFileJobInput(type, input, { downloadable = false } = {}) {
  return !downloadable && YOUTUBE_FILE_JOBS.has(String(type || '')) && !!youtubeSourceIn(input);
}

// The Studio's tools that cut, edit, dub or read the FILE of the video they are given. `transcript` marks the ones where
// the captions are a real help. A tool not listed is untouched: analyze_video and repurpose_transcript read a YouTube
// link from its captions, upload_google_ads_video takes a YouTube video by design, and a publish tool's link is a link.
export const YOUTUBE_FILE_TOOLS = new Map([
  ['clip_video', { transcript: true }], ['add_subtitles', { transcript: true }],
  ['repurpose_video', {}], ['add_presenter', {}], ['video_frames', {}], ['check_video', {}], ['make_insert', {}],
  ['face_swap_video', {}], ['track_objects', {}], ['split_vocals', {}], ['video_filter', {}],
  ['cut_out_video_background', {}], ['change_video_text', { transcript: true }], ['multiply_ad', {}], ['hook_variants', {}],
  ['edit_video', {}], ['post_edit', {}], ['reangle_video', {}], ['recast_motion', {}], ['recast_hook', {}],
  ['finish_video', {}], ['fix_beat', {}], ['make_motion_film', {}], // make_motion_film queues motionmoving, a file job when a source clip rides it
]);

export const YOUTUBE_NO_DOWNLOAD_TEXT = 'YouTube does not let us download videos, so nothing was made and nothing was charged. Download the video yourself and upload the file here, and we will work from that.';

/** The one refusal. `transcript` adds what the link CAN give; `forAgent` names the tool that gives it. */
export function youtubeRefusalText({ transcript = false, forAgent = false } = {}) {
  if (!transcript) return YOUTUBE_NO_DOWNLOAD_TEXT;
  return forAgent
    ? `${YOUTUBE_NO_DOWNLOAD_TEXT} From the link alone, analyze_video can read what is said in the video from its YouTube captions (the spoken words with timestamps, not the picture): offer that, for example to choose the moments or check the words, and run it only if they want it.`
    : `${YOUTUBE_NO_DOWNLOAD_TEXT} From the link alone we can still read what is said in the video, from its captions (the words, not the picture): ask for that if it helps.`;
}

/** The Studio agent's refusal for a tool given a YouTube source, or '' when the call may go ahead. */
export function studioYoutubeRefusal(name, input, { downloadable = false } = {}) {
  const t = YOUTUBE_FILE_TOOLS.get(String(name || ''));
  if (downloadable || !t || !youtubeSourceIn(input)) return '';
  return `NOT STARTED. ${youtubeRefusalText({ transcript: !!t.transcript, forAgent: true })} Tell the user exactly that in their own language, never say it has started, and do not call this tool again with the YouTube link.`;
}
