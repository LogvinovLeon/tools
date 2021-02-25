export const semVer = '\\d+.\\d+.\\d+';
export const commit = '\\+commit\\.[a-f0-9]{7,8}';
export const nightly = '(\\-nightly\\.\\d{4}\\.\\d{1,2}.\\d{1,2})?';
const solcVersionSchema = `^v?${semVer}${nightly}${commit}$`;

export const compilerOptionsSchema = {
    id: '/CompilerOptions',
    properties: {
        contractsDir: { type: 'string' },
        artifactsDir: { type: 'string' },
        solcVersion: { type: 'string', pattern: solcVersionSchema },
        compilerSettings: { type: 'object' },
        contracts: {
            oneOf: [
                {
                    type: 'string',
                    pattern: '^\\*$',
                },
                {
                    type: 'array',
                    items: {
                        type: 'string',
                    },
                },
            ],
        },
        useDockerisedSolc: { type: 'boolean' },
        isOfflineMode: { type: 'boolean' },
        shouldSaveStandardInput: { type: 'boolean' },
        shouldCompileIndependently: { type: 'boolean' },
    },
    type: 'object',
    required: [],
    additionalProperties: false,
};
