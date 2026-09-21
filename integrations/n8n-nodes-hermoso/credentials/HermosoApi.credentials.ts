import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class HermosoApi implements ICredentialType {
	name = 'hermosoApi';

	displayName = 'Hermoso API';

	icon: Icon = { light: 'file:../icons/hermoso.svg', dark: 'file:../icons/hermoso.dark.svg' };

	documentationUrl = 'https://hermoso.ai/docs/api/';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			placeholder: 'e.g. hmk_...',
			description:
				'Sign in at https://app.hermoso.ai, open MCP & CLI, and create a key. It starts with hmk_.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey.trim()}}',
			},
		},
	};

	// A free, authenticated read: it proves the key works without touching any brand.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://app.hermoso.ai/v1',
			url: '/account/email',
			method: 'GET',
		},
	};
}
