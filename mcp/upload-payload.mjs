// A FILE THAT NEVER ARRIVED IS NOT "A BINARY FORMAT I DON'T UNDERSTAND" (2026-11-04, account 71c940fc).
//
// upload_file answered "I can't read melissokomia-vozi-honey-jars.jpg, it looks like a binary format I don't understand
// yet" to ChatGPT (client openai-mcp) on 2026-11-03 23:24:11Z. The whole MCP request was 1,971 bytes, headers included,
// so the `dataUri` it carried decoded to a few hundred bytes at most: not a photo of honey jars. The bytes the sniffer
// read did not start FF D8 (a JPEG always does, and the sniffer has always known that), because they were never the
// file. A model that cannot read the user's attachment writes a path or a file id where the base64 belongs, and Node's
// base64 decoder never refuses anything: it skips what it cannot read and hands back noise. The noise was then judged
// as a file, and the refusal blamed the file. The earlier fix for the same sentence (fi:ebce00ccdb92, BMP/TIFF/JPEG XL
// named .jpg, lib/upload-image-formats.mjs) was real but answered a different question.
//
// Three readers, used on both sides of the wire:
//   · dataUriPayload(s): upload_file's `dataUri`, read STRICTLY. A payload that is not base64 is refused before a byte
//     is sent, and the refusal quotes what was there ("/mnt/data/x.jpg" reads as a path) and names the three sources
//     that do carry a file.
//   · base64TextBytes(buf): a request BODY that is itself a data: URI or base64 text (an agent that PUT the encoded
//     file to the one-time link). The server decodes it when the decoded bytes are a file it recognises.
//   · notTheFileMessage(...): the sentence for bytes whose NAME or declared type says image / video / audio / PDF and
//     whose contents are none of them. It says the file did not arrive and how to send it, not that its format is odd.
//
// Byte-identical in mcp/ and cli/mcp/ (the CLI ships rooted at cli/), and imported by server.js (ingestUpload).
// Pure; run by tools/upload-not-the-file-check.mjs.

const B64_BODY = /^[A-Za-z0-9+/_-]+={0,2}$/;
const DATA_URI = /^data:([^;,]*)((?:;[^;,]*)*?);base64,(.*)$/is;
const strip = (s) => String(s || '').replace(/\s+/g, '');

/** Strict base64 → Buffer, or null when the text is not base64 (Buffer.from would decode it to noise instead). */
export function strictBase64(text) {
  const t = strip(text);
  if (!t || t.length % 4 === 1 || !B64_BODY.test(t)) return null;
  const buf = Buffer.from(t.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return buf.length ? buf : null;
}

const quote = (s) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > 80 ? `${t.slice(0, 77)}...` : t; };
const looksLikeRef = (s) => /^(?:[a-z][a-z0-9+.-]+:\/\/|sandbox:|file:|\/|~\/|[A-Za-z]:\\|\.\.?\/)|\.(?:jpe?g|png|webp|gif|heic|mp4|mov|pdf)$/i.test(String(s || '').trim());

/** upload_file's `dataUri`, read strictly: { ok:true, mime, buf } or { ok:false, message }. */
export function dataUriPayload(dataUri, { name = '' } = {}) {
  const raw = String(dataUri || '').trim();
  const m = DATA_URI.exec(raw);
  const what = name ? `the \`dataUri\` for ${name}` : 'the `dataUri`';
  const ways = 'Nothing was uploaded. Put the file\'s own bytes, base64-encoded, after `base64,`; or pass a public https link to the file as `url`; or, if you can run an HTTP request, call upload_file with `getUploadUrl` and PUT the raw bytes to the link it returns.';
  if (!m) return { ok: false, message: `${what[0].toUpperCase()}${what.slice(1)} is not a data: URI (data:<type>;base64,<the file's bytes>). ${ways}` };
  const payload = m[3];
  const buf = strictBase64(payload);
  if (!buf) {
    const shown = quote(payload);
    const ref = looksLikeRef(payload);
    return { ok: false, message: `${what[0].toUpperCase()}${what.slice(1)} does not carry the file: what follows \`base64,\` is not base64${shown ? ` (it reads \`${shown}\`${ref ? ', which is a file path or reference, not the file' : ''})` : ' (it is empty)'}. ${ways}` };
  }
  return { ok: true, mime: m[1] || 'application/octet-stream', buf };
}

/** A request body that is itself a data: URI or base64 text → the bytes it encodes, else null. */
export function base64TextBytes(buf) {
  if (!buf || buf.length < 16) return null;
  const head = buf.subarray(0, 64).toString('latin1');
  if (!/^\s*(?:data:|[A-Za-z0-9+/_-]{16})/.test(head)) return null; // cheap: most files fail on their first bytes
  const text = buf.toString('latin1').trim();
  const m = DATA_URI.exec(text);
  return strictBase64(m ? m[3] : text);
}

const EXT_KIND = { jpg: 'JPEG image', jpeg: 'JPEG image', jfif: 'JPEG image', png: 'PNG image', webp: 'WebP image', gif: 'GIF image', heic: 'HEIC photo', heif: 'HEIC photo', avif: 'AVIF image', mp4: 'MP4 video', mov: 'MOV video', m4v: 'video', webm: 'WebM video', mp3: 'MP3 audio', wav: 'WAV audio', m4a: 'audio file', pdf: 'PDF' };

/** What the caller SAID the file is (its name first, then its declared type), or null when neither names a media file. */
export function namedMediaKind({ fname = '', mime = '' } = {}) {
  const ext = (String(fname).split('.').pop() || '').toLowerCase();
  if (String(fname).includes('.') && EXT_KIND[ext]) return EXT_KIND[ext];
  const t = String(mime || '').toLowerCase().split(';')[0].trim();
  if (t === 'image/jpeg' || t === 'image/jpg') return 'JPEG image';
  if (t === 'application/pdf') return 'PDF';
  const top = t.split('/')[0];
  return top === 'image' ? 'image' : top === 'video' ? 'video' : top === 'audio' ? 'audio file' : null;
}

/** The refusal for bytes named as a media file that are not one: the file did not arrive, and how to send it. */
export function notTheFileMessage({ fname = '', kind = 'image', bytes = 0 } = {}) {
  const who = String(fname || '').trim() || 'That file';
  const an = /^(?:image|audio|AVIF|MP|MOV)/.test(kind) ? 'an' : 'a'; // said aloud: an image, an MP4 video, a JPEG image, a HEIC photo
  const size = Number(bytes) > 0 ? `the ${Number(bytes).toLocaleString('en-US')} bytes that arrived` : 'what arrived';
  return `${who} is named as ${an} ${kind}, but ${size} are not one, so the file itself never reached me. That happens when a file path, a file id or a description is sent where the file's contents belong. Nothing was saved. Send the file's raw bytes, or a public https link to it.`;
}
