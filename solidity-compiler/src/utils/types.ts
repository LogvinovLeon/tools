export enum AbiType {
    Function = 'function',
    Constructor = 'constructor',
    Event = 'event',
    Fallback = 'fallback',
}

export interface SolcErrors {
    [key: string]: boolean;
}

export interface ContractSourceData {
    [contractName: string]: ContractSpecificSourceData;
}

export type SolcJSReleases = Record<string, string>;

export interface SolcJSBuild {
    path: string;
    version: string;
    build: string;
    longVersion: string;
    keccak256: string;
    urls: string[];
}

export interface SolcJSVersionList {
    builds: SolcJSBuild[];
    releases: SolcJSReleases;
    latestRelease: string;
}

export interface ContractSpecificSourceData {
    solcVersionRange: string;
    sourceHash: Buffer;
    sourceTreeHash: Buffer;
}

export interface Token {
    address?: string;
    name: string;
    symbol: string;
    decimals: number;
    ipfsHash: string;
    swarmHash: string;
}

export type DoneCallback = (err?: Error) => void;

export class CompilationError extends Error {
    public errorsCount: number;
    public typeName = 'CompilationError';
    constructor(errorsCount: number) {
        super('Compilation errors encountered');
        this.errorsCount = errorsCount;
    }
}

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
