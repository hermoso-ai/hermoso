import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IPollFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

// The Hermoso REST API. Described live at https://app.hermoso.ai/openapi.json
export const BASE_URL = 'https://app.hermoso.ai/v1';
export const USER_AGENT = 'n8n-nodes-hermoso/0.1.0';

const ASSET_HOSTS = ['assets.hermoso.ai', 'app.hermoso.ai'];

export type HermosoContext = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions;

/**
 * A brand on your own account is selected with one header. A brand another account shared with you needs
 * a second one, so the brand list stores both values in one string: "<brand id>::<owner account id>".
 */
export const BRAND_SEPARATOR = '::';

export function brandHeaders(brand: string | undefined): IDataObject {
	const raw = String(brand ?? '').trim();
	if (!raw) return {};
	const [user, owner] = raw.split(BRAND_SEPARATOR);
	return owner ? { 'X-Hermoso-User': user, 'X-Hermoso-Owner': owner } : { 'X-Hermoso-User': user };
}

/** The dropdown value for one row of GET /v1/brands. */
export function brandValue(row: IDataObject): string {
	const headers = (row.headers as IDataObject) ?? {};
	const user = String(headers['X-Hermoso-User'] ?? row.id ?? '');
	const owner = String(headers['X-Hermoso-Owner'] ?? '');
	return owner ? `${user}${BRAND_SEPARATOR}${owner}` : user;
}

/** Drop undefined, null, empty strings and empty arrays so the API sees only what the user filled in. */
export function compact(obj: IDataObject): IDataObject {
	const out: IDataObject = {};
	for (const [key, value] of Object.entries(obj)) {
		if (value === undefined || value === null || value === '') continue;
		if (Array.isArray(value) && value.length === 0) continue;
		out[key] = value;
	}
	return out;
}

export interface HermosoRequest {
	method: IHttpRequestMethods;
	path: string;
	brand?: string;
	qs?: IDataObject;
	body?: IDataObject | Buffer;
	headers?: IDataObject;
	/** Statuses that the caller handles itself (for example a 404 that means "nothing found"). */
	allowStatus?: number[];
	itemIndex?: number;
}

export interface HermosoResponse {
	statusCode: number;
	body: IDataObject;
	headers: IDataObject;
}

function parseBody(body: unknown): IDataObject {
	if (body === undefined || body === null || body === '') return {};
	if (typeof body === 'string') {
		try {
			return JSON.parse(body) as IDataObject;
		} catch {
			return { text: body };
		}
	}
	if (Buffer.isBuffer(body)) return parseBody(body.toString('utf8'));
	return body as IDataObject;
}

/**
 * One place that talks to Hermoso. Every failure comes back in one envelope,
 * { error: { type, code, message, param?, connector? }, request_id }, and the message is written for people,
 * so it is what the n8n error panel shows. The description says how to get unstuck.
 */
export async function hermosoApiRequest(
	this: HermosoContext,
	request: HermosoRequest,
): Promise<HermosoResponse> {
	const isBinary = Buffer.isBuffer(request.body);
	const options: IHttpRequestOptions = {
		method: request.method,
		url: `${BASE_URL}${request.path}`,
		headers: {
			Accept: 'application/json',
			'User-Agent': USER_AGENT,
			...brandHeaders(request.brand),
			...(request.headers ?? {}),
		},
		qs: request.qs ? compact(request.qs) : undefined,
		body: request.body,
		json: !isBinary,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};
	if (options.qs && Object.keys(options.qs).length === 0) delete options.qs;
	if (request.body === undefined) delete options.body;

	const response = (await this.helpers.httpRequestWithAuthentication.call(
		this,
		'hermosoApi',
		options,
	)) as { statusCode: number; body: unknown; headers: IDataObject };

	const result: HermosoResponse = {
		statusCode: response.statusCode,
		body: parseBody(response.body),
		headers: response.headers ?? {},
	};
	if (result.statusCode < 400 || (request.allowStatus ?? []).includes(result.statusCode)) {
		return result;
	}
	throw hermosoError.call(this, result, request.itemIndex);
}

function hermosoError(this: HermosoContext, response: HermosoResponse, itemIndex?: number) {
	const envelope = response.body;
	const err = (
		typeof envelope.error === 'object' && envelope.error !== null ? envelope.error : {}
	) as IDataObject;
	const code = String(err.code ?? `http_${response.statusCode}`);
	const requestId = envelope.request_id ? ` (request ${String(envelope.request_id)})` : '';
	const message =
		String(
			err.message ??
				(typeof envelope.error === 'string' ? envelope.error : '') ??
				`Hermoso answered with status ${response.statusCode}.`,
		) || `Hermoso answered with status ${response.statusCode}.`;

	let description = `Hermoso code: ${code}${requestId}.`;
	let shownMessage = message;

	if (response.statusCode === 401 && err.type !== 'connector_error' && !err.connector) {
		shownMessage = 'Hermoso did not accept this API key';
		description =
			'Create a new key in Hermoso under MCP & CLI, paste it into the Hermoso API credential, and run the node again.';
	} else if (code === 'brand_not_found') {
		shownMessage = 'Hermoso could not find the brand chosen in this node';
		description =
			"It may have been deleted, or this API key may no longer have access to it. Pick the brand again in the 'Brand' parameter, or clear it to use the brand the key is set to.";
	} else if (err.connector) {
		description = `Connect or reconnect the ${String(err.connector)} account in Hermoso under Connectors, then run the node again.`;
	} else if (err.type === 'insufficient_credits') {
		description = 'Add credits in Hermoso under Billing, then run the node again.';
	} else if (response.statusCode === 429) {
		const retry = response.headers['retry-after'];
		description = `Hermoso is limiting requests. Wait${retry ? ` ${String(retry)} seconds` : ' a moment'} and run the node again.`;
	} else if (response.statusCode === 404 && code.endsWith('_not_found')) {
		description = `Check the ID, and that it belongs to the brand chosen in this node. ${description}`;
	} else if (err.param) {
		description = `Check the '${String(err.param)}' value. ${description}`;
	}

	return new NodeApiError(this.getNode(), envelope as JsonObject, {
		message: shownMessage,
		description,
		httpCode: String(response.statusCode),
		itemIndex,
	});
}

export function isHermosoHosted(url: string): boolean {
	try {
		return ASSET_HOSTS.includes(new URL(url).hostname);
	} catch {
		return false;
	}
}

export function fileNameOf(url: string): string {
	try {
		const parts = new URL(url).pathname.split('/');
		return decodeURIComponent(parts[parts.length - 1] ?? '');
	} catch {
		return '';
	}
}

/** Call one Hermoso tool: POST /v1/tools/{name}. The JSON body is the argument object. */
export async function callTool(
	this: HermosoContext,
	name: string,
	args: IDataObject,
	options: { brand?: string; wait?: number; idempotencyKey?: string; itemIndex?: number } = {},
): Promise<{ text: string; data: IDataObject; job: IDataObject | null }> {
	const response = await hermosoApiRequest.call(this, {
		method: 'POST',
		path: `/tools/${encodeURIComponent(name)}`,
		brand: options.brand,
		qs: options.wait === undefined ? undefined : { wait: options.wait },
		headers: options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : undefined,
		body: compact(args),
		itemIndex: options.itemIndex,
	});
	const body = response.body;
	if (body.object === 'tool_job') return { text: String(body.text ?? ''), data: {}, job: body };
	return {
		text: String(body.text ?? ''),
		data: (body.data as IDataObject) ?? {},
		job: null,
	};
}

/** Bring an outside file into Hermoso storage. Files already stored there pass through untouched. */
export async function ingestMediaUrl(
	this: IExecuteFunctions,
	url: string,
	brand: string,
	itemIndex: number,
	fileName?: string,
): Promise<IDataObject> {
	if (isHermosoHosted(url)) {
		return { object: 'media', url, type: null, bytes: null, name: null };
	}
	const response = await hermosoApiRequest.call(this, {
		method: 'POST',
		path: '/media',
		brand,
		qs: { url },
		headers: fileName ? { 'X-File-Name': encodeURIComponent(fileName) } : undefined,
		itemIndex,
	});
	return response.body;
}

/** The API's post object plus a few flat fields that are easier to use in later nodes. */
export function shapePost(post: IDataObject): IDataObject {
	const media = (Array.isArray(post.media) ? post.media : []) as IDataObject[];
	const results = (Array.isArray(post.results) ? post.results : []) as IDataObject[];
	const failed = results.filter((r) => r && r.ok === false);
	return {
		...post,
		media_urls: media.map((m) => m?.url).filter(Boolean),
		published_urls: results.filter((r) => r && r.ok !== false && r.url).map((r) => r.url),
		failed_channels: failed.map((r) => r.channel).filter(Boolean),
		error_summary: failed
			.map((r) => `${String(r.channel)}: ${String(r.error ?? 'failed')}`)
			.join('; '),
	};
}

export function simplifyPost(post: IDataObject): IDataObject {
	const shaped = shapePost(post);
	return {
		id: shaped.id,
		status: shaped.status ?? null,
		scheduled_at: shaped.scheduled_at ?? null,
		channels: shaped.channels ?? [],
		caption: shaped.caption ?? '',
		media_urls: shaped.media_urls,
		published_urls: shaped.published_urls,
		failed_channels: shaped.failed_channels,
		error_summary: shaped.error_summary,
		created_at: shaped.created_at ?? null,
	};
}

/**
 * One shape for a render job, whatever it came from: a job from GET /v1/jobs, the 202 handle a no-wait call
 * answers with, or a render that was already finished when the API answered.
 */
export function shapeJob(input: IDataObject, fallbackType?: string): IDataObject {
	const job = input ?? {};
	const result = ((typeof job.result === 'object' && job.result !== null ? job.result : null) ??
		{}) as IDataObject;
	const id = job.id ?? job.job_id ?? job.jobId ?? null;
	const url = job.url ?? result.video ?? result.image ?? job.video ?? job.image ?? null;
	const status = job.status ?? (job.stillRendering ? 'running' : url ? 'done' : null);
	return {
		id,
		status,
		is_finished: status === 'done' || status === 'error',
		type: job.type ?? fallbackType ?? null,
		label: job.label ?? null,
		progress: typeof job.progress === 'number' ? job.progress : null,
		url,
		poster_url: job.poster_url ?? result.poster ?? job.poster ?? null,
		model: job.model ?? result.model ?? null,
		credits_used: job.credits_used ?? null,
		error: job.error_message ?? (typeof job.error === 'string' ? job.error : null),
		created_at: job.created_at ?? null,
		updated_at: job.updated_at ?? null,
		brand_id: job.brand_id ?? null,
		poll_url: job.poll_url ?? (id ? `${BASE_URL}/jobs/${String(id)}` : null),
	};
}

/** Read posts, newest first, following the cursor for up to maxPages pages. */
export async function listPosts(
	this: HermosoContext,
	brand: string,
	filters: {
		status?: string;
		channel?: string;
		limit?: number;
		maxPages?: number;
		itemIndex?: number;
	},
): Promise<IDataObject[]> {
	const posts: IDataObject[] = [];
	let cursor: string | undefined;
	const maxPages = filters.maxPages ?? 1;
	for (let page = 0; page < maxPages; page++) {
		const response = await hermosoApiRequest.call(this, {
			method: 'GET',
			path: '/posts',
			brand,
			qs: {
				limit: filters.limit ?? 100,
				status: filters.status,
				channel: filters.channel,
				starting_after: cursor,
			},
			itemIndex: filters.itemIndex,
		});
		const body = response.body;
		posts.push(...((body.data as IDataObject[]) ?? []));
		if (!body.has_more || !body.next_cursor) break;
		cursor = String(body.next_cursor);
	}
	return posts;
}

/** Library files, newest first. A Library item has no id of its own; its file URL is stable and unique. */
export async function listLibrary(
	this: HermosoContext,
	brand: string,
	kind: string,
	limit: number,
	itemIndex?: number,
): Promise<IDataObject[]> {
	const { data } = await callTool.call(
		this,
		'list_library',
		{ kind: kind || 'all', limit: Math.min(Math.max(limit, 1), 60) },
		{ brand, itemIndex },
	);
	return ((data.assets as IDataObject[]) ?? [])
		.filter((a) => a && /^https:\/\//i.test(String(a.url ?? '')))
		.map((a) => ({
			id: a.url,
			url: a.url,
			kind: a.kind ?? null,
			model: a.model ?? null,
			file_name: fileNameOf(String(a.url)),
			age_hours: a.ageHours ?? null,
		}));
}

/** The label a post gets in a dropdown. */
export function postLabel(post: IDataObject): string {
	const text = String(post.caption || post.title_effective || 'Post with no caption')
		.replace(/\s+/g, ' ')
		.trim();
	const when = post.scheduled_at
		? String(post.scheduled_at).slice(0, 16).replace('T', ' ')
		: 'no time';
	return `${text.slice(0, 60)} (${String(post.status)}, ${when} UTC)`;
}

/**
 * n8n's date picker gives a wall-clock time with no offset, meant in the workflow's time zone. The API needs
 * an exact instant, so a value without an offset is read in that zone. A value that carries its own offset
 * (or Z) is used as it is.
 */
export function toUtcIso(value: string, timeZone: string): string {
	const text = String(value).trim();
	if (!text) return '';
	if (/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
		const d = new Date(text);
		return Number.isNaN(d.getTime()) ? text : d.toISOString();
	}
	const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
	if (!match) return text;
	const [, y, mo, d, h = '0', mi = '0', s = '0'] = match;
	const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
	const offset = zoneOffsetMs(asUtc, timeZone);
	// A second pass settles the rare case where the first guess lands across a daylight saving change.
	const first = asUtc - offset;
	const second = asUtc - zoneOffsetMs(first, timeZone);
	return new Date(second).toISOString();
}

function zoneOffsetMs(instant: number, timeZone: string): number {
	try {
		const parts = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		}).formatToParts(new Date(instant));
		const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
		const wall = Date.UTC(
			get('year'),
			get('month') - 1,
			get('day'),
			get('hour'),
			get('minute'),
			get('second'),
		);
		return wall - Math.floor(instant / 1000) * 1000;
	} catch {
		return 0;
	}
}
