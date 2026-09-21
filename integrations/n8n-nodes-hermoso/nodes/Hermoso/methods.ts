import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodePropertyOptions,
	INodeProperties,
} from 'n8n-workflow';
import { brandValue, callTool, hermosoApiRequest, listPosts, postLabel } from './GenericFunctions';

/** The brand picker used by every operation. Empty means the brand the API key is set to. */
export const brandProperty: INodeProperties = {
	displayName: 'Brand',
	name: 'brand',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	description: 'The brand workspace to act on. Leave empty to use the brand the API key is set to.',
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			placeholder: 'Select a brand...',
			typeOptions: {
				searchListMethod: 'searchBrands',
				searchable: true,
			},
		},
		{
			displayName: 'By ID',
			name: 'id',
			type: 'string',
			placeholder: 'e.g. pmrb4oek7ktq',
		},
	],
};

function currentBrand(this: ILoadOptionsFunctions): string {
	try {
		return String(this.getCurrentNodeParameter('brand', { extractValue: true }) ?? '');
	} catch {
		return '';
	}
}

const matches = (filter: string | undefined, ...values: unknown[]) => {
	const needle = String(filter ?? '')
		.trim()
		.toLowerCase();
	if (!needle) return true;
	return values.some((v) =>
		String(v ?? '')
			.toLowerCase()
			.includes(needle),
	);
};

export const listSearch = {
	async searchBrands(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
		// No brand header here: the list is the same whichever brand is picked.
		const response = await hermosoApiRequest.call(this, { method: 'GET', path: '/brands' });
		const rows = (response.body.data as IDataObject[]) ?? [];
		return {
			results: rows
				.filter((b) => b?.id)
				.map((b) => {
					const notes = [b.current ? 'current' : '', b.shared ? 'shared with you' : '']
						.filter(Boolean)
						.join(', ');
					return {
						name: `${String(b.name ?? b.id)}${notes ? ` (${notes})` : ''}`,
						value: brandValue(b),
					};
				})
				.filter((r) => matches(filter, r.name, r.value)),
		};
	},

	async searchPosts(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
		const rows = await listPosts.call(this, currentBrand.call(this), { limit: 100, maxPages: 1 });
		return {
			results: rows
				.map((p) => ({ name: postLabel(p), value: String(p.id) }))
				.filter((r) => matches(filter, r.name, r.value)),
		};
	},

	async searchScheduledPosts(
		this: ILoadOptionsFunctions,
		filter?: string,
	): Promise<INodeListSearchResult> {
		const rows = await listPosts.call(this, currentBrand.call(this), {
			status: 'scheduled',
			limit: 100,
			maxPages: 1,
		});
		return {
			results: rows
				.map((p) => ({ name: postLabel(p), value: String(p.id) }))
				.filter((r) => matches(filter, r.name, r.value)),
		};
	},

	async searchJobs(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
		const response = await hermosoApiRequest.call(this, {
			method: 'GET',
			path: '/jobs',
			brand: currentBrand.call(this),
			qs: { limit: 50 },
		});
		const rows = (response.body.data as IDataObject[]) ?? [];
		return {
			results: rows
				.map((j) => ({
					name: `${String(j.label ?? j.type ?? 'Job')} (${String(j.status)}) ${String(j.id)}`,
					value: String(j.id),
				}))
				.filter((r) => matches(filter, r.name, r.value)),
		};
	},

	async searchCollections(
		this: ILoadOptionsFunctions,
		filter?: string,
	): Promise<INodeListSearchResult> {
		const { data } = await callTool.call(
			this,
			'list_swipefile',
			{ limit: 1 },
			{ brand: currentBrand.call(this) },
		);
		const rows = (data.collections as IDataObject[]) ?? [];
		return {
			results: rows
				.map((c) => ({ name: String(c.name), value: String(c.name) }))
				.filter((r) => matches(filter, r.name)),
		};
	},
};

async function models(
	this: ILoadOptionsFunctions,
	kind: 'image' | 'video',
): Promise<INodePropertyOptions[]> {
	const { data } = await callTool.call(this, 'hermoso_capabilities', {});
	const options = (data.options as IDataObject) ?? {};
	const rows = (((options[kind] as IDataObject) ?? {}).models as IDataObject[]) ?? [];
	return [
		{ name: 'Recommended', value: '', description: 'Let Hermoso pick the model' },
		...rows
			.filter((m) => m?.id && !m.deprecated && !m.editOnly)
			.map((m) => ({
				name: m.best ? `${String(m.label)} (recommended)` : String(m.label ?? m.id),
				value: String(m.id),
			})),
	];
}

export const loadOptions = {
	async getChannels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		const response = await hermosoApiRequest.call(this, {
			method: 'GET',
			path: '/channels',
			brand: currentBrand.call(this),
		});
		const rows = (response.body.data as IDataObject[]) ?? [];
		return rows
			.filter((c) => c?.available && c.connected)
			.map((c) => ({
				name: c.account ? `${String(c.name)} (${String(c.account)})` : String(c.name),
				value: String(c.id),
				description: c.needs_reconnect ? 'Needs to be reconnected in Hermoso' : undefined,
			}));
	},

	async getAllChannels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		const response = await hermosoApiRequest.call(this, {
			method: 'GET',
			path: '/channels',
			brand: currentBrand.call(this),
		});
		const rows = (response.body.data as IDataObject[]) ?? [];
		return [
			{ name: 'Any Channel', value: '' },
			...rows.filter((c) => c?.id).map((c) => ({ name: String(c.name), value: String(c.id) })),
		];
	},

	async getImageModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		return await models.call(this, 'image');
	},

	async getVideoModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		return await models.call(this, 'video');
	},
};
