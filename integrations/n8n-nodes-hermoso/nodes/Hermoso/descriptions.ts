import type { INodeProperties } from 'n8n-workflow';
import { brandProperty } from './methods';

const show = (resource: string, operation: string[]) => ({
	show: { resource: [resource], operation },
});

const simplifyProperty = (resource: string, operation: string[]): INodeProperties => ({
	displayName: 'Simplify',
	name: 'simplify',
	type: 'boolean',
	default: true,
	displayOptions: show(resource, operation),
	description: 'Whether to return a simplified version of the response instead of the raw data',
});

const idempotencyOption: INodeProperties = {
	displayName: 'Idempotency Key',
	name: 'idempotencyKey',
	type: 'string',
	default: '',
	description:
		'A value unique to this run, such as an ID from an earlier node. If the same value arrives again within 24 hours, Hermoso returns the first result instead of doing the work twice. Leave empty and a key is built from this execution, so a retry of the same execution is always safe.',
};

const postIdLocator = (
	name: string,
	searchListMethod: string,
	operation: string[],
): INodeProperties => ({
	displayName: 'Post',
	name,
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	displayOptions: show('post', operation),
	description: 'The post to use',
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			placeholder: 'Select a post...',
			typeOptions: { searchListMethod, searchable: true },
		},
		{
			displayName: 'By ID',
			name: 'id',
			type: 'string',
			placeholder: 'e.g. rec_4f2a9c1b7d30',
		},
	],
});

export const nodeProperties: INodeProperties[] = [
	{
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Brand', value: 'brand' },
			{ name: 'Image', value: 'image' },
			{ name: 'Job', value: 'job' },
			{ name: 'Library Item', value: 'libraryItem' },
			{ name: 'Media', value: 'media' },
			{ name: 'Post', value: 'post' },
			{ name: 'Swipefile', value: 'swipefile' },
			{ name: 'Video', value: 'video' },
		],
		default: 'post',
	},

	// ----------------------------------------------------------------- operations
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['brand'] } },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Retrieve a list of the brand workspaces this API key can use',
				action: 'Get many brands',
			},
		],
		default: 'getAll',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['image'] } },
		options: [
			{
				name: 'Generate',
				value: 'generate',
				description: 'Create an on-brand image ad from a prompt',
				action: 'Generate an image',
			},
		],
		default: 'generate',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['video'] } },
		options: [
			{
				name: 'Generate',
				value: 'generate',
				description: 'Start a video render from a prompt and return the render job',
				action: 'Generate a video',
			},
		],
		default: 'generate',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['job'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Retrieve a render job, with the finished file once it is done',
				action: 'Get a job',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Retrieve a list of render jobs, newest first',
				action: 'Get many jobs',
			},
		],
		default: 'get',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['libraryItem'] } },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Find the newest images and videos in the Hermoso library',
				action: 'Get many library items',
			},
		],
		default: 'getAll',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['media'] } },
		options: [
			{
				name: 'Upload',
				value: 'upload',
				description:
					'Store an image or video in Hermoso and get a hosted link posts and renders accept',
				action: 'Upload media',
			},
		],
		default: 'upload',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['post'] } },
		options: [
			{
				name: 'Cancel',
				value: 'cancel',
				description: 'Cancel a post that is still waiting in the publishing calendar',
				action: 'Cancel a post',
			},
			{
				name: 'Create',
				value: 'create',
				description:
					'Create a social post that publishes now, at a set time, or in the next free queue slot',
				action: 'Create a post',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Retrieve a post with its status and the result on each channel',
				action: 'Get a post',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Retrieve a list of posts, newest first',
				action: 'Get many posts',
			},
		],
		default: 'create',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['swipefile'] } },
		options: [
			{
				name: 'Save Ad',
				value: 'saveAd',
				description: 'Save an ad to a swipefile collection, creating the collection if needed',
				action: 'Save ad to swipefile',
			},
		],
		default: 'saveAd',
	},

	// ----------------------------------------------------------------- brand picker
	{
		...brandProperty,
		displayOptions: {
			show: { resource: ['image', 'video', 'job', 'libraryItem', 'media', 'post', 'swipefile'] },
		},
	},

	// ----------------------------------------------------------------- brand: getAll
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: true,
		displayOptions: show('brand', ['getAll']),
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: { show: { resource: ['brand'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},

	// ----------------------------------------------------------------- image: generate
	{
		displayName: 'Prompt',
		name: 'prompt',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		displayOptions: show('image', ['generate']),
		placeholder:
			'e.g. A can of sparkling soda on a sunny picnic blanket, bold headline "Summer in a can"',
		description:
			'Describe the image: subject, composition, lighting, and any words that should appear on it',
	},
	{
		displayName: 'Return Job Without Waiting',
		name: 'returnJob',
		type: 'boolean',
		default: false,
		displayOptions: show('image', ['generate']),
		description:
			'Whether to return a job as soon as the render is accepted instead of waiting for the image. Use Job > Get to collect the file later.',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show('image', ['generate']),
		options: [
			{
				displayName: 'Shape',
				name: 'aspectRatio',
				type: 'options',
				default: '1:1',
				options: [
					{ name: 'Square (1:1)', value: '1:1' },
					{ name: 'Portrait (4:5)', value: '4:5' },
					{ name: 'Vertical (9:16)', value: '9:16' },
					{ name: 'Landscape (16:9)', value: '16:9' },
				],
				description: 'The shape of the finished image',
			},
			{
				displayName: 'Use Saved Brand Assets',
				name: 'useBrand',
				type: 'boolean',
				default: true,
				description:
					'Whether to add the product photos and logo saved on the brand so the result is on brand',
			},
			{
				displayName: 'Reference Image URLs',
				name: 'referenceImages',
				type: 'string',
				typeOptions: { multipleValues: true },
				default: [],
				placeholder: 'e.g. https://example.com/image.png',
				description:
					'Public links to product or logo photos to place in the image. When set, they are used instead of the saved brand assets.',
			},
			{
				displayName: 'Model Name or ID',
				name: 'model',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getImageModels' },
				default: '',
				description:
					'Leave empty for the recommended model. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			idempotencyOption,
		],
	},

	// ----------------------------------------------------------------- video: generate
	{
		displayName: 'Prompt',
		name: 'prompt',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		displayOptions: show('video', ['generate']),
		placeholder: 'e.g. Close up of a can being opened, bubbles rising, bright kitchen, upbeat mood',
		description:
			'Describe the video shot by shot: who or what is on screen, the action, the setting and the mood',
	},
	{
		displayName: 'Wait for Video',
		name: 'waitForVideo',
		type: 'boolean',
		default: false,
		displayOptions: show('video', ['generate']),
		description:
			'Whether to keep checking the render until the video is finished. When off, the node returns the job right away and Job > Get collects the file later. A video usually takes one to three minutes.',
	},
	{
		displayName: 'Max Wait (Minutes)',
		name: 'maxWaitMinutes',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 30 },
		default: 10,
		displayOptions: {
			show: { resource: ['video'], operation: ['generate'], waitForVideo: [true] },
		},
		description:
			'How long to keep checking. If the video is not finished by then, the node returns the job as it stands and the render keeps going.',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show('video', ['generate']),
		options: [
			{
				displayName: 'First Frame Image URL',
				name: 'firstFrameImage',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://example.com/image.png',
				description: 'A public link to an image the video should open on, such as a product photo',
			},
			idempotencyOption,
			{
				displayName: 'Length in Seconds',
				name: 'durationSeconds',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 8,
				description:
					'Each model supports its own lengths. A length in between is rounded up to the next one the model supports.',
			},
			{
				displayName: 'Model Name or ID',
				name: 'model',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getVideoModels' },
				default: '',
				description:
					'Leave empty and Hermoso picks a model. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Resolution',
				name: 'resolution',
				type: 'options',
				default: '720p',
				options: [
					{ name: '480p Draft', value: '480p' },
					{ name: '720p', value: '720p' },
					{ name: '1080p', value: '1080p' },
					{ name: '4K', value: '4k' },
				],
				description: 'Not every model offers every resolution',
			},
			{
				displayName: 'Shape',
				name: 'aspectRatio',
				type: 'options',
				default: '9:16',
				options: [
					{ name: 'Vertical (9:16)', value: '9:16' },
					{ name: 'Square (1:1)', value: '1:1' },
					{ name: 'Landscape (16:9)', value: '16:9' },
				],
				description: 'The shape of the finished video',
			},
			{
				displayName: 'Voiceover Script',
				name: 'voiceoverScript',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'Words for a voiceover to speak. Leave empty for no voiceover.',
			},
		],
	},

	// ----------------------------------------------------------------- job
	{
		displayName: 'Job',
		name: 'jobId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: show('job', ['get']),
		description: 'The render job to read',
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: 'Select a job...',
				typeOptions: { searchListMethod: 'searchJobs', searchable: true },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. job_mu72wqqalon82',
			},
		],
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: show('job', ['getAll']),
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: { show: { resource: ['job'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: show('job', ['getAll']),
		options: [
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				default: 'done',
				options: [
					{ name: 'Done', value: 'done' },
					{ name: 'Error', value: 'error' },
					{ name: 'Queued', value: 'queued' },
					{ name: 'Running', value: 'running' },
				],
			},
			{
				displayName: 'Type',
				name: 'type',
				type: 'string',
				default: '',
				placeholder: 'e.g. video',
				description: 'Only jobs of this type, such as video, stitch, avatar or templatead',
			},
		],
	},
	simplifyProperty('job', ['get', 'getAll']),

	// ----------------------------------------------------------------- library item
	{
		displayName: 'Kind',
		name: 'kind',
		type: 'options',
		default: 'all',
		displayOptions: show('libraryItem', ['getAll']),
		options: [
			{ name: 'Images and Videos', value: 'all' },
			{ name: 'Images Only', value: 'image' },
			{ name: 'Videos Only', value: 'video' },
		],
		description: 'Which kind of file to look for. The newest come first.',
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: show('libraryItem', ['getAll']),
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 60 },
		default: 50,
		displayOptions: {
			show: { resource: ['libraryItem'], operation: ['getAll'], returnAll: [false] },
		},
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: show('libraryItem', ['getAll']),
		options: [
			{
				displayName: 'File Link or Model Contains',
				name: 'contains',
				type: 'string',
				default: '',
				placeholder: 'e.g. video',
				description:
					'Only items whose file link or model name contains this text. The search covers the 60 newest items.',
			},
		],
	},

	// ----------------------------------------------------------------- media: upload
	{
		displayName: 'Input Type',
		name: 'inputType',
		type: 'options',
		default: 'url',
		displayOptions: show('media', ['upload']),
		options: [
			{ name: 'URL', value: 'url', description: 'Hermoso fetches the file from a public link' },
			{ name: 'Binary File', value: 'binary', description: 'Send a file from an earlier node' },
		],
	},
	{
		displayName: 'File URL',
		name: 'fileUrl',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['media'], operation: ['upload'], inputType: ['url'] } },
		placeholder: 'e.g. https://example.com/image.png',
		description: 'A public https link to an image or video',
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		displayOptions: { show: { resource: ['media'], operation: ['upload'], inputType: ['binary'] } },
		hint: 'The name of the input binary field containing the file to upload',
	},
	{
		displayName: 'File Name',
		name: 'fileName',
		type: 'string',
		default: '',
		displayOptions: show('media', ['upload']),
		placeholder: 'e.g. fall-lineup.jpg',
		description: 'A name to keep with the file. Leave empty to keep the original name.',
	},

	// ----------------------------------------------------------------- post: create
	{
		displayName: 'Channel Names or IDs',
		name: 'channels',
		type: 'multiOptions',
		typeOptions: { loadOptionsMethod: 'getChannels', loadOptionsDependsOn: ['brand.value'] },
		required: true,
		default: [],
		displayOptions: show('post', ['create']),
		description:
			'Where the post goes. The list shows the channels connected to this brand in Hermoso. Each channel publishes on its own, so one failing does not stop the others. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Caption',
		name: 'caption',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		displayOptions: show('post', ['create']),
		description:
			'The post text. Hermoso checks each channel length limit when the post is created and says which channel is over.',
	},
	{
		displayName: 'When to Publish',
		name: 'timing',
		type: 'options',
		default: 'scheduled',
		displayOptions: show('post', ['create']),
		options: [
			{ name: 'At a Set Time', value: 'scheduled' },
			{ name: 'Next Free Queue Slot', value: 'queue' },
			{ name: 'Publish Now', value: 'now' },
		],
		description:
			'A set time, the next open slot in the posting schedule of this brand, or right away',
	},
	{
		displayName: 'Publish Time',
		name: 'scheduledAt',
		type: 'dateTime',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['post'], operation: ['create'], timing: ['scheduled'] } },
		description:
			"When the post should go out, at least one minute from now. A time without a time zone is read in the workflow's time zone.",
	},
	{
		displayName: 'Media URLs',
		name: 'media',
		type: 'string',
		typeOptions: { multipleValues: true },
		default: [],
		displayOptions: show('post', ['create']),
		placeholder: 'e.g. https://example.com/image.png',
		description:
			'Public links to images or a video. One item makes a single post, two or more make a carousel in the order given. Outside links are copied into Hermoso first, for free.',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show('post', ['create']),
		options: [
			{
				displayName: 'Link',
				name: 'link',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://example.com/offer',
				description: 'A destination link to attach, on channels that support one',
			},
			{
				displayName: 'Time Zone',
				name: 'timezone',
				type: 'string',
				default: '',
				placeholder: 'e.g. America/Toronto',
				description:
					'For the next free queue slot only. Leave empty to use the time zone saved on the brand.',
			},
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				default: '',
				description:
					'The headline that Pinterest and YouTube ask for. Leave empty and Hermoso writes one from the caption.',
			},
			{
				displayName: 'Visibility',
				name: 'visibility',
				type: 'options',
				default: 'public',
				options: [
					{ name: 'Draft', value: 'draft' },
					{ name: 'Private', value: 'private' },
					{ name: 'Public', value: 'public' },
					{ name: 'Unlisted', value: 'unlisted' },
				],
				description:
					'If a chosen channel cannot honor the setting, Hermoso refuses the post and says why instead of changing it quietly',
			},
			idempotencyOption,
		],
	},

	// ----------------------------------------------------------------- post: get / cancel / getAll
	postIdLocator('postId', 'searchPosts', ['get']),
	postIdLocator('scheduledPostId', 'searchScheduledPosts', ['cancel']),
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: show('post', ['getAll']),
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: { show: { resource: ['post'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: show('post', ['getAll']),
		options: [
			{
				displayName: 'Channel Name or ID',
				name: 'channel',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getAllChannels', loadOptionsDependsOn: ['brand.value'] },
				default: '',
				description:
					'Only posts that include this channel. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				default: 'scheduled',
				options: [
					{ name: 'Failed', value: 'failed' },
					{ name: 'Partially Published', value: 'partially_published' },
					{ name: 'Processing', value: 'processing' },
					{ name: 'Published', value: 'published' },
					{ name: 'Scheduled', value: 'scheduled' },
				],
			},
		],
	},
	simplifyProperty('post', ['create', 'get', 'getAll']),

	// ----------------------------------------------------------------- swipefile: saveAd
	{
		displayName: 'Collection',
		name: 'collection',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: show('swipefile', ['saveAd']),
		description: 'The collection to save into. A new name creates the collection.',
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: 'Select a collection...',
				typeOptions: { searchListMethod: 'searchCollections', searchable: true },
			},
			{
				displayName: 'By Name',
				name: 'name',
				type: 'string',
				placeholder: 'e.g. Competitor winners',
			},
		],
	},
	{
		displayName: 'Ad',
		name: 'ad',
		type: 'collection',
		placeholder: 'Add Ad Field',
		default: {},
		displayOptions: show('swipefile', ['saveAd']),
		description: 'Fill in at least one of Headline, Ad Copy, Image URL, Video URL or Link',
		options: [
			{
				displayName: 'Ad Copy',
				name: 'body',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'The main text of the ad',
			},
			{
				displayName: 'Ad ID',
				name: 'key',
				type: 'string',
				default: '',
				description:
					'A stable ID for this ad if you have one. Saving the same ad again moves it to the chosen collection instead of adding a copy.',
			},
			{
				displayName: 'Advertiser',
				name: 'advertiser',
				type: 'string',
				default: '',
				description: 'The brand that ran the ad',
			},
			{
				displayName: 'Headline',
				name: 'title',
				type: 'string',
				default: '',
				description: 'The headline or opening hook of the ad',
			},
			{
				displayName: 'Image URL',
				name: 'image',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://example.com/image.png',
			},
			{
				displayName: 'Link',
				name: 'link',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://example.com/offer',
				description: 'Where the ad can be seen, or the page it sends people to',
			},
			{
				displayName: 'Platform',
				name: 'platform',
				type: 'string',
				default: '',
				placeholder: 'e.g. instagram',
				description: 'Where the ad ran, in your own words',
			},
			{
				displayName: 'Video URL',
				name: 'video',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://example.com/video.mp4',
			},
		],
	},
];
