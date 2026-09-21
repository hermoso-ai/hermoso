import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError, sleep } from 'n8n-workflow';

import {
	callTool,
	compact,
	fileNameOf,
	hermosoApiRequest,
	ingestMediaUrl,
	listLibrary,
	listPosts,
	shapeJob,
	shapePost,
	simplifyPost,
	toUtcIso,
} from './GenericFunctions';
import { nodeProperties } from './descriptions';
import { listSearch, loadOptions } from './methods';

// Programmatic style, because several operations need more than one dependent request: a post first copies
// outside media into Hermoso storage, a render may answer with a job that is then polled, and a search
// filters the library after reading it.

const text = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());

function simplifyJob(job: IDataObject): IDataObject {
	const shaped = shapeJob(job);
	return {
		id: shaped.id,
		status: shaped.status,
		is_finished: shaped.is_finished,
		type: shaped.type,
		progress: shaped.progress,
		url: shaped.url,
		poster_url: shaped.poster_url,
		model: shaped.model,
		error: shaped.error,
		updated_at: shaped.updated_at,
	};
}

export class Hermoso implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Hermoso',
		name: 'hermoso',
		icon: { light: 'file:../../icons/hermoso.svg', dark: 'file:../../icons/hermoso.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Create on-brand image and video ads, schedule social posts and manage your Hermoso library',
		defaults: {
			name: 'Hermoso',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'hermosoApi',
				required: true,
			},
		],
		properties: nodeProperties,
	};

	methods = { listSearch, loadOptions };

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		// A key tied to this execution, this node and this item. A retry of the same execution sends the same
		// key, and Hermoso answers it with the first result instead of rendering or posting twice.
		const runKey = (i: number, given: unknown) =>
			text(given) ||
			`n8n-${this.getExecutionId()}-${this.getNode().id}-${resource}-${operation}-${i}`.slice(
				0,
				255,
			);

		const push = (data: IDataObject | IDataObject[], i: number) => {
			for (const json of Array.isArray(data) ? data : [data]) {
				returnData.push({ json, pairedItem: { item: i } });
			}
		};

		for (let i = 0; i < items.length; i++) {
			try {
				const brand =
					resource === 'brand'
						? ''
						: text(this.getNodeParameter('brand', i, '', { extractValue: true }));

				if (resource === 'brand' && operation === 'getAll') {
					const response = await hermosoApiRequest.call(this, {
						method: 'GET',
						path: '/brands',
						itemIndex: i,
					});
					let rows = (response.body.data as IDataObject[]) ?? [];
					if (!this.getNodeParameter('returnAll', i)) {
						rows = rows.slice(0, this.getNodeParameter('limit', i) as number);
					}
					push(rows, i);
				} else if (resource === 'image' && operation === 'generate') {
					const options = this.getNodeParameter('options', i, {}) as IDataObject;
					const returnJob = this.getNodeParameter('returnJob', i, false) as boolean;
					const refImages = ((options.referenceImages as string[]) ?? []).map(text).filter(Boolean);
					const answer = await callTool.call(
						this,
						'generate_image',
						{
							prompt: this.getNodeParameter('prompt', i) as string,
							aspectRatio: options.aspectRatio,
							refImages,
							useBrand: options.useBrand === undefined ? undefined : options.useBrand === true,
							model: options.model,
						},
						{
							brand,
							wait: returnJob ? 0 : undefined,
							idempotencyKey: runKey(i, options.idempotencyKey),
							itemIndex: i,
						},
					);
					if (answer.job) {
						push({ ...shapeJob(answer.job, 'image'), message: answer.text }, i);
					} else if (answer.data.jobId || answer.data.stillRendering) {
						push(
							{ ...shapeJob(answer.data, 'image'), id: answer.data.jobId, message: answer.text },
							i,
						);
					} else {
						const image = text(answer.data.image);
						if (!image) {
							throw new NodeOperationError(
								this.getNode(),
								answer.text || 'Hermoso did not return an image',
								{
									itemIndex: i,
									description: 'Try the node again with a more specific prompt.',
								},
							);
						}
						push(
							{
								id: image,
								url: image,
								model: answer.data.model ?? null,
								file_name: fileNameOf(image),
								note: answer.data.productNote ?? null,
							},
							i,
						);
					}
				} else if (resource === 'video' && operation === 'generate') {
					const options = this.getNodeParameter('options', i, {}) as IDataObject;
					const answer = await callTool.call(
						this,
						'generate_video',
						{
							prompt: this.getNodeParameter('prompt', i) as string,
							aspectRatio: options.aspectRatio,
							durationSeconds: options.durationSeconds,
							refImage: text(options.firstFrameImage),
							ttsScript: text(options.voiceoverScript),
							resolution: options.resolution,
							model: options.model,
						},
						{
							brand,
							wait: 0,
							idempotencyKey: runKey(i, options.idempotencyKey),
							itemIndex: i,
						},
					);
					let job = answer.job
						? shapeJob(answer.job, 'video')
						: shapeJob({ ...answer.data, id: answer.data.jobId ?? answer.data.id }, 'video');
					if (!job.id && !job.url) {
						throw new NodeOperationError(
							this.getNode(),
							answer.text || 'Hermoso did not return a render job',
							{
								itemIndex: i,
							},
						);
					}
					if (this.getNodeParameter('waitForVideo', i, false) && job.id && !job.is_finished) {
						const deadline =
							Date.now() + (this.getNodeParameter('maxWaitMinutes', i, 10) as number) * 60000;
						const gap =
							Math.min(Math.max(Number(answer.job?.retry_after_seconds ?? 10), 5), 30) * 1000;
						while (!job.is_finished && Date.now() + gap < deadline) {
							await sleep(gap);
							const response = await hermosoApiRequest.call(this, {
								method: 'GET',
								path: `/jobs/${encodeURIComponent(String(job.id))}`,
								brand,
								itemIndex: i,
							});
							job = shapeJob(response.body, 'video');
						}
					}
					push({ ...job, message: answer.text }, i);
				} else if (resource === 'job' && operation === 'get') {
					const id = text(this.getNodeParameter('jobId', i, '', { extractValue: true }));
					const response = await hermosoApiRequest.call(this, {
						method: 'GET',
						path: `/jobs/${encodeURIComponent(id)}`,
						brand,
						itemIndex: i,
					});
					const simplify = this.getNodeParameter('simplify', i, true) as boolean;
					push(simplify ? simplifyJob(response.body) : response.body, i);
				} else if (resource === 'job' && operation === 'getAll') {
					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					const limit = returnAll ? Infinity : (this.getNodeParameter('limit', i) as number);
					const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
					const simplify = this.getNodeParameter('simplify', i, true) as boolean;
					const jobs: IDataObject[] = [];
					let cursor: string | undefined;
					do {
						const response = await hermosoApiRequest.call(this, {
							method: 'GET',
							path: '/jobs',
							brand,
							qs: {
								limit: Math.min(100, limit - jobs.length),
								status: filters.status,
								type: filters.type,
								starting_after: cursor,
							},
							itemIndex: i,
						});
						jobs.push(...((response.body.data as IDataObject[]) ?? []));
						cursor =
							response.body.has_more && response.body.next_cursor
								? String(response.body.next_cursor)
								: undefined;
					} while (cursor && jobs.length < limit);
					push(
						jobs.slice(0, limit).map((j) => (simplify ? simplifyJob(j) : j)),
						i,
					);
				} else if (resource === 'libraryItem' && operation === 'getAll') {
					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					const limit = returnAll ? 60 : (this.getNodeParameter('limit', i) as number);
					const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
					const needle = text(filters.contains).toLowerCase();
					const kind = this.getNodeParameter('kind', i, 'all') as string;
					const rows = await listLibrary.call(this, brand, kind, needle ? 60 : limit, i);
					push(
						rows
							.filter(
								(a) =>
									!needle ||
									String(a.url).toLowerCase().includes(needle) ||
									String(a.model ?? '')
										.toLowerCase()
										.includes(needle),
							)
							.slice(0, limit),
						i,
					);
				} else if (resource === 'media' && operation === 'upload') {
					const inputType = this.getNodeParameter('inputType', i) as string;
					const fileName = text(this.getNodeParameter('fileName', i, ''));
					if (inputType === 'binary') {
						const property = this.getNodeParameter('binaryPropertyName', i) as string;
						const binary = this.helpers.assertBinaryData(i, property);
						const buffer = await this.helpers.getBinaryDataBuffer(i, property);
						const response = await hermosoApiRequest.call(this, {
							method: 'POST',
							path: '/media',
							brand,
							body: buffer,
							headers: {
								'Content-Type': binary.mimeType || 'application/octet-stream',
								'X-File-Name': encodeURIComponent(fileName || binary.fileName || 'upload'),
								'Idempotency-Key': runKey(i, ''),
							},
							itemIndex: i,
						});
						push(response.body, i);
					} else {
						const url = text(this.getNodeParameter('fileUrl', i));
						push(await ingestMediaUrl.call(this, url, brand, i, fileName || undefined), i);
					}
				} else if (resource === 'post' && operation === 'create') {
					const timing = this.getNodeParameter('timing', i) as string;
					const extra = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
					const channels = (this.getNodeParameter('channels', i, []) as string[]).filter(Boolean);
					let scheduledAt: string | undefined;
					if (timing === 'scheduled') {
						// A blank time must never turn into "publish right now".
						const raw = text(this.getNodeParameter('scheduledAt', i, ''));
						if (!raw) {
							throw new NodeOperationError(
								this.getNode(),
								"The 'Publish Time' parameter is empty",
								{
									itemIndex: i,
									description:
										"Set a date and time, or change 'When to Publish' to 'Next Free Queue Slot' or 'Publish Now'.",
								},
							);
						}
						scheduledAt = toUtcIso(raw, this.getTimezone());
					}
					const media: IDataObject[] = [];
					for (const url of (this.getNodeParameter('media', i, []) as string[])
						.map(text)
						.filter(Boolean)) {
						const stored = await ingestMediaUrl.call(this, url, brand, i);
						media.push(compact({ url: stored.url, type: stored.type }));
					}
					const response = await hermosoApiRequest.call(this, {
						method: 'POST',
						path: '/posts',
						brand,
						headers: { 'Idempotency-Key': runKey(i, extra.idempotencyKey) },
						body: compact({
							channels,
							caption: text(this.getNodeParameter('caption', i, '')),
							title: text(extra.title),
							link: text(extra.link),
							media,
							visibility: extra.visibility,
							scheduled_at: scheduledAt,
							use_queue: timing === 'queue' ? true : undefined,
							timezone: timing === 'queue' ? text(extra.timezone) : undefined,
						}),
						itemIndex: i,
					});
					const simplify = this.getNodeParameter('simplify', i, true) as boolean;
					push(simplify ? simplifyPost(response.body) : shapePost(response.body), i);
				} else if (resource === 'post' && operation === 'get') {
					const id = text(this.getNodeParameter('postId', i, '', { extractValue: true }));
					const response = await hermosoApiRequest.call(this, {
						method: 'GET',
						path: `/posts/${encodeURIComponent(id)}`,
						brand,
						itemIndex: i,
					});
					const simplify = this.getNodeParameter('simplify', i, true) as boolean;
					push(simplify ? simplifyPost(response.body) : shapePost(response.body), i);
				} else if (resource === 'post' && operation === 'getAll') {
					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					const limit = returnAll ? Infinity : (this.getNodeParameter('limit', i) as number);
					const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
					const simplify = this.getNodeParameter('simplify', i, true) as boolean;
					const rows = await listPosts.call(this, brand, {
						status: text(filters.status) || undefined,
						channel: text(filters.channel) || undefined,
						limit: Math.min(100, limit),
						maxPages: returnAll ? 1000 : Math.ceil(limit / 100),
						itemIndex: i,
					});
					push(
						rows.slice(0, limit).map((p) => (simplify ? simplifyPost(p) : shapePost(p))),
						i,
					);
				} else if (resource === 'post' && operation === 'cancel') {
					const id = text(this.getNodeParameter('scheduledPostId', i, '', { extractValue: true }));
					const response = await hermosoApiRequest.call(this, {
						method: 'DELETE',
						path: `/posts/${encodeURIComponent(id)}`,
						brand,
						itemIndex: i,
					});
					push({ id: response.body.id ?? id, deleted: response.body.deleted === true }, i);
				} else if (resource === 'swipefile' && operation === 'saveAd') {
					const collection = text(
						this.getNodeParameter('collection', i, '', { extractValue: true }),
					);
					const ad = this.getNodeParameter('ad', i, {}) as IDataObject;
					const item = compact({
						key: text(ad.key),
						advertiser: text(ad.advertiser),
						title: text(ad.title),
						body: text(ad.body),
						image: text(ad.image),
						video: text(ad.video),
						link: text(ad.link),
						platform: text(ad.platform),
					});
					if (!collection) {
						throw new NodeOperationError(this.getNode(), "The 'Collection' parameter is empty", {
							itemIndex: i,
							description: 'Pick a collection, or type a name to create one.',
						});
					}
					// An advertiser name or a platform alone is not an ad.
					if (!item.title && !item.body && !item.image && !item.video && !item.link) {
						throw new NodeOperationError(this.getNode(), 'There is nothing to save yet', {
							itemIndex: i,
							description:
								"Fill in at least one of 'Headline', 'Ad Copy', 'Image URL', 'Video URL' or 'Link' under 'Ad'.",
						});
					}
					const { data } = await callTool.call(
						this,
						'save_to_swipefile',
						{ collection, items: [item] },
						{ brand, itemIndex: i },
					);
					push(
						{
							id: data.collectionId ?? collection,
							collection: data.collection ?? collection,
							saved: typeof data.saved === 'number' ? data.saved : null,
							moved: typeof data.moved === 'number' ? data.moved : null,
							total: typeof data.total === 'number' ? data.total : null,
						},
						i,
					);
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`The operation '${operation}' is not supported for '${resource}'`,
						{ itemIndex: i },
					);
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				// An API failure already carries Hermoso's own message and a way to get unstuck; wrapping keeps both.
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
