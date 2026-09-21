import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { listLibrary, listPosts, shapePost } from '../Hermoso/GenericFunctions';
import { brandProperty, listSearch, loadOptions } from '../Hermoso/methods';

// Hermoso has no webhooks for these events, so this node polls. It remembers the IDs it has already seen, so
// each library file or post starts the workflow once.

const SEEN_LIMIT = 1000;

async function readRows(
	this: IPollFunctions,
	event: string,
	brand: string,
): Promise<IDataObject[]> {
	if (event === 'newLibraryItem') {
		const kind = this.getNodeParameter('kind', 'all') as string;
		return await listLibrary.call(this, brand, kind, 60);
	}
	const channel = String(this.getNodeParameter('channel', '') ?? '') || undefined;
	let statuses: string[] = [];
	let pages = 1;
	if (event === 'postScheduled') {
		statuses = ['scheduled'];
		// The calendar is ordered by publish time, not by when a post was added, so read further.
		pages = 3;
	} else if (event === 'postPublished') {
		statuses = this.getNodeParameter('includePartial', false)
			? ['published', 'partially_published']
			: ['published'];
	} else if (event === 'postFailed') {
		// "indeterminate" means a send was interrupted and Hermoso cannot confirm it went out.
		statuses = this.getNodeParameter('includePartial', true)
			? ['failed', 'indeterminate', 'partially_published']
			: ['failed', 'indeterminate'];
	}
	const rows: IDataObject[] = [];
	for (const status of statuses) {
		const posts = await listPosts.call(this, brand, {
			status,
			channel,
			limit: 100,
			maxPages: pages,
		});
		rows.push(...posts.map(shapePost));
	}
	return rows;
}

export class HermosoTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Hermoso Trigger',
		name: 'hermosoTrigger',
		icon: { light: 'file:../../icons/hermoso.svg', dark: 'file:../../icons/hermoso.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Starts the workflow when a Hermoso library file or post changes',
		defaults: {
			name: 'Hermoso Trigger',
		},
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'hermosoApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Trigger On',
				name: 'event',
				type: 'options',
				noDataExpression: true,
				default: 'newLibraryItem',
				options: [
					{
						name: 'New Library Item',
						value: 'newLibraryItem',
						description: 'A finished image or video lands in the Hermoso library',
					},
					{
						name: 'New Scheduled Post',
						value: 'postScheduled',
						description: 'A post is added to the Hermoso publishing calendar',
					},
					{
						name: 'New Published Post',
						value: 'postPublished',
						description: 'A post finishes publishing to its channels',
					},
					{
						name: 'New Failed Post',
						value: 'postFailed',
						description: 'A post fails to publish, so you can alert the team or retry',
					},
				],
			},
			brandProperty,
			{
				displayName: 'Kind',
				name: 'kind',
				type: 'options',
				default: 'all',
				displayOptions: { show: { event: ['newLibraryItem'] } },
				options: [
					{ name: 'Images and Videos', value: 'all' },
					{ name: 'Images Only', value: 'image' },
					{ name: 'Videos Only', value: 'video' },
				],
				description: 'Which finished files should start the workflow',
			},
			{
				displayName: 'Channel Name or ID',
				name: 'channel',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getAllChannels', loadOptionsDependsOn: ['brand.value'] },
				default: '',
				displayOptions: { show: { event: ['postScheduled', 'postPublished', 'postFailed'] } },
				description:
					'Only posts that include this channel. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Include Partly Published Posts',
				name: 'includePartial',
				type: 'boolean',
				default: false,
				displayOptions: { show: { event: ['postPublished'] } },
				description:
					'Whether to include posts that reached some channels and failed on others. The failed_channels field names the ones that did not go out.',
			},
			{
				displayName: 'Include Partly Published Posts',
				name: 'includePartial',
				type: 'boolean',
				default: true,
				displayOptions: { show: { event: ['postFailed'] } },
				description:
					'Whether to also start the workflow when a post reached some channels and failed on others',
			},
		],
	};

	methods = { listSearch, loadOptions };

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const event = this.getNodeParameter('event') as string;
		const brand = String(this.getNodeParameter('brand', '', { extractValue: true }) ?? '').trim();
		const rows = (await readRows.call(this, event, brand)).filter((r) => r.id);

		// A manual test run shows the newest match so there is something to map, and remembers nothing.
		if (this.getMode() === 'manual') {
			return rows.length ? [this.helpers.returnJsonArray(rows.slice(0, 1))] : null;
		}

		const state = this.getWorkflowStaticData('node');
		// The remembered IDs belong to one set of filters. Changing the filters starts a fresh baseline.
		const scope = JSON.stringify({
			event,
			brand,
			kind: event === 'newLibraryItem' ? this.getNodeParameter('kind', 'all') : null,
			channel: event === 'newLibraryItem' ? null : this.getNodeParameter('channel', ''),
		});
		const ids = rows.map((r) => String(r.id));

		if (state.scope !== scope || !Array.isArray(state.seen)) {
			// First run after activation: record what already exists, so old items do not flood the workflow.
			state.scope = scope;
			state.seen = ids.slice(0, SEEN_LIMIT);
			return null;
		}

		const seen = new Set(state.seen as string[]);
		const fresh = rows.filter((r) => !seen.has(String(r.id)));
		state.seen = [...ids, ...(state.seen as string[]).filter((id) => !ids.includes(id))].slice(
			0,
			SEEN_LIMIT,
		);
		if (!fresh.length) return null;
		// Oldest first, so the workflow handles them in the order they happened.
		return [this.helpers.returnJsonArray(fresh.reverse())];
	}
}
