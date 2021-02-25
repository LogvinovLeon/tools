import { assert } from '@0x/assert';
import { Resolver, SpyResolver } from '@0x/sol-resolver';
import { logUtils } from '@0x/utils';
import { CompilerOptions, ContractArtifact, ContractVersionData, StandardOutput } from 'ethereum-types';
import * as fs from 'fs';
import * as _ from 'lodash';
import * as path from 'path';
import * as semver from 'semver';
import { StandardInput } from 'solc';
import { promisify } from 'util';

import { compilerOptionsSchema } from './schemas/compiler_options_schema';
import {
    createDirIfDoesNotExistAsync,
    getContractArtifactIfExistsAsync,
    getSolcJSVersionFromPath,
    getSolcJSVersionListAsync,
    normalizeSolcVersion,
    parseSolidityVersionRange,
} from './utils/compiler';
import { constants } from './utils/constants';
import { fsWrapper } from './utils/fs_wrapper';
import { utils } from './utils/utils';

import { TYPE_ALL_FILES_IDENTIFIER } from './compiler';
import { JSONNameResolver } from './resolvers/json_name_resolver';
import { SolcWrapper } from './solc_wrapper';
import { SolcWrapperV01 } from './solc_wrapper_v01';
import { SolcWrapperV02 } from './solc_wrapper_v02';
import { SolcWrapperV03 } from './solc_wrapper_v03';
import { SolcWrapperV04 } from './solc_wrapper_v04';
import { SolcWrapperV05 } from './solc_wrapper_v05';
import { SolcWrapperV06 } from './solc_wrapper_v06';
import { SolcWrapperV07 } from './solc_wrapper_v07';
import { SolcWrapperV08 } from './solc_wrapper_v08';

export const ALL_CONTRACTS_IDENTIFIER = '*';
export const ALL_FILES_IDENTIFIER = '*';

const DEFAULT_COMPILER_OPTS: CompilerOptions = {
    contractsDir: 'contracts',
    artifactsDir: 'artifacts',
    contracts: ALL_CONTRACTS_IDENTIFIER as TYPE_ALL_FILES_IDENTIFIER,
    useDockerisedSolc: false,
    isOfflineMode: false,
    shouldSaveStandardInput: false,
    shouldCompileIndependently: false,
};

interface ContractPathToData {
    [contractPath: string]: ContractData;
}

interface CompileContractsOpts {
    shouldCompileIndependently: boolean;
    shouldPersist: boolean;
}

interface ContractData {
    currentArtifactIfExists: ContractArtifact | void;
    sourceTreeHashHex: string;
    contractName: string;
}

// tslint:disable no-non-null-assertion
/**
 * The Compiler facilitates compiling Solidity smart contracts and saves the results
 * to artifact files.
 */
export class JSONCompiler {
    private readonly _opts: CompilerOptions;
    private readonly _resolver: Resolver;
    private readonly _nameResolver: JSONNameResolver;
    private readonly _contractsDir: string;
    private readonly _artifactsDir: string;
    private readonly _solcVersionIfExists: string | undefined;
    private readonly _specifiedContracts: string[] | TYPE_ALL_FILES_IDENTIFIER;
    private readonly _isOfflineMode: boolean;
    private readonly _shouldSaveStandardInput: boolean;
    private readonly _shouldCompileIndependently: boolean;
    private readonly _solcWrappersByVersion: { [version: string]: SolcWrapper } = {};

    public static async getCompilerOptionsAsync(
        overrides: Partial<CompilerOptions> = {},
        file: string = 'compiler.json',
    ): Promise<CompilerOptions> {
        const fileConfig: CompilerOptions = fs.existsSync(file)
            ? JSON.parse((await promisify(fs.readFile)(file, 'utf8')).toString())
            : {};
        assert.doesConformToSchema('compiler.json', fileConfig, compilerOptionsSchema);
        return {
            ...fileConfig,
            ...overrides,
        };
    }

    /**
     * Instantiates a new instance of the Compiler class.
     * @param opts Optional compiler options
     * @return An instance of the Compiler class.
     */
    constructor(opts: CompilerOptions) {
        this._opts = { ...DEFAULT_COMPILER_OPTS, ...opts };
        assert.doesConformToSchema('opts', this._opts, compilerOptionsSchema);
        this._contractsDir = this._opts.contractsDir!;
        this._solcVersionIfExists =
            process.env.SOLCJS_PATH !== undefined
                ? getSolcJSVersionFromPath(process.env.SOLCJS_PATH)
                : this._opts.solcVersion;
        this._artifactsDir = this._opts.artifactsDir!;
        this._specifiedContracts = this._opts.contracts!;
        this._isOfflineMode = this._opts.isOfflineMode!;
        this._shouldSaveStandardInput = this._opts.shouldSaveStandardInput!;
        this._shouldCompileIndependently = this._opts.shouldCompileIndependently!;
        this._nameResolver = new JSONNameResolver(this._contractsDir);
        this._resolver = new JSONNameResolver(this._contractsDir);
    }

    /**
     * Compiles selected Solidity files found in `contractsDir` and writes JSON artifacts to `artifactsDir`.
     */
    public async compileAsync(): Promise<void> {
        await createDirIfDoesNotExistAsync(this._artifactsDir);
        await createDirIfDoesNotExistAsync(constants.SOLC_BIN_DIR);
        await this._compileContractsAsync(this.getContractFileNamesToCompile(), {
            shouldPersist: true,
            shouldCompileIndependently: this._shouldCompileIndependently,
        });
    }

    /**
     * Compiles Solidity files specified during instantiation, and returns the
     * compiler output given by solc.  Return value is an array of outputs:
     * Solidity modules are batched together by version required, and each
     * element of the returned array corresponds to a compiler version, and
     * each element contains the output for all of the modules compiled with
     * that version.
     */
    public async getCompilerOutputsAsync(): Promise<StandardOutput[]> {
        const promisedOutputs = await this._compileContractsAsync(this.getContractFileNamesToCompile(), {
            shouldPersist: false,
            shouldCompileIndependently: false,
        });
        // Batching is disabled so only the first unit for each version is used.
        return promisedOutputs.map(o => o[0]);
    }

    public getContractFileNamesToCompile(): string[] {
        let contractFileNamesToCompile;
        if (this._specifiedContracts === ALL_CONTRACTS_IDENTIFIER) {
            const allContractFiles = this._nameResolver.getAll();
            contractFileNamesToCompile = _.map(allContractFiles, contractSource =>
                path.basename(contractSource.path, constants.JSON_FILE_EXTENSION),
            );
        } else {
            return this._specifiedContracts;
        }
        return contractFileNamesToCompile;
    }

    /**
     * Compiles contracts, and, if `shouldPersist` is true, saves artifacts to artifactsDir.
     * @param fileName Name of contract with '.sol' extension.
     * @return an array of compiler outputs, where each element corresponds to a different version of solc-js.
     */
    private async _compileContractsAsync(
        contractFileNames: string[],
        opts: Partial<CompileContractsOpts> = {},
    ): Promise<StandardOutput[][]> {
        const _opts = {
            shouldPersist: false,
            shouldCompileIndependently: false,
            ...opts,
        };
        // map contract paths to data about them for later verification and persistence
        const contractPathToData: ContractPathToData = {};

        const solcJSVersionList = await getSolcJSVersionListAsync(this._isOfflineMode);
        for (const contractFileName of contractFileNames) {
            const spyResolver = new SpyResolver(this._resolver);
            const contractJSONSource = spyResolver.resolve(contractFileName);
            const standardJSONInput = JSON.parse(contractJSONSource.source);
            const sources = standardJSONInput.sources === undefined ? standardJSONInput : standardJSONInput.sources;
            const contractContentsByPath = _.mapValues(sources, (data: { content: string }) => data.content);
            const contractData = {
                contractName: path.basename(contractFileName, constants.SOLIDITY_FILE_EXTENSION),
                currentArtifactIfExists: await getContractArtifactIfExistsAsync(this._artifactsDir, contractFileName),
                sourceTreeHashHex: '0x',
            };
            contractPathToData[contractJSONSource.path] = contractData;
            let solcVersion: string | undefined;
            if (this._solcVersionIfExists) {
                solcVersion = this._solcVersionIfExists;
            } else {
                const releases = _.keys(solcJSVersionList.releases);
                const versionRanges = _.values(sources).map(({ content }) => parseSolidityVersionRange(content));
                const versionRange = versionRanges.join(' ');
                const solidityVersion = semver.maxSatisfying(releases, versionRange);
                if (solidityVersion) {
                    solcVersion = normalizeSolcVersion(solcJSVersionList.releases[solidityVersion]);
                }
                if (solcVersion === undefined) {
                    throw new Error(`Couldn't find any solidity version satisfying the constraint ${versionRange}`);
                }
            }

            const compiler = this._getSolcWrapperForVersion(solcVersion);
            logUtils.warn(`Compiling (${path.basename(contractJSONSource.path)}) with Solidity ${solcVersion}...`);
            const compilationResult = await compiler.compileAsync(contractContentsByPath, {});

            if (_opts.shouldPersist) {
                await this._persistCompiledContractAsync(
                    contractFileName,
                    solcVersion,
                    compilationResult.input,
                    compilationResult.output,
                );
            }
        }
        return [];
    }

    private _getSolcWrapperForVersion(solcVersion: string): SolcWrapper {
        const normalizedVersion = normalizeSolcVersion(solcVersion);
        return (
            this._solcWrappersByVersion[normalizedVersion] ||
            (this._solcWrappersByVersion[normalizedVersion] = this._createSolcInstance(normalizedVersion))
        );
    }

    private _createSolcInstance(solcVersion: string): SolcWrapper {
        if (solcVersion.startsWith('0.1.')) {
            return new SolcWrapperV01(solcVersion, this._opts);
        }
        if (solcVersion.startsWith('0.2.')) {
            return new SolcWrapperV02(solcVersion, this._opts);
        }
        if (solcVersion.startsWith('0.3.')) {
            return new SolcWrapperV03(solcVersion, this._opts);
        }
        if (solcVersion.startsWith('0.4.')) {
            return new SolcWrapperV04(solcVersion, this._opts);
        }
        if (solcVersion.startsWith('0.5.')) {
            return new SolcWrapperV05(solcVersion, this._opts);
        }
        if (solcVersion.startsWith('0.6')) {
            return new SolcWrapperV06(solcVersion, this._opts);
        }
        if (solcVersion.startsWith('0.7')) {
            return new SolcWrapperV07(solcVersion, this._opts);
        }
        if (solcVersion.startsWith('0.8')) {
            return new SolcWrapperV08(solcVersion, this._opts);
        }
        throw new Error(`Missing Solc wrapper implementation for version ${solcVersion}`);
    }

    private async _persistCompiledContractAsync(
        contractFileName: string,
        solcVersion: string,
        compilerInput: StandardInput,
        compilerOutput: StandardOutput,
    ): Promise<void> {
        for (const contractPath of Object.keys(compilerOutput.contracts)) {
            const contractName = path.basename(contractPath, constants.SOLIDITY_FILE_EXTENSION);
            const compiledContract = compilerOutput.contracts[contractPath][contractName];
            const contractVersion: Partial<ContractVersionData> = {
                compilerOutput: compiledContract,
                compiler: {
                    name: 'solc',
                    version: solcVersion,
                    settings: compilerInput.settings,
                },
            };
            const newArtifact = {
                schemaVersion: constants.LATEST_ARTIFACT_VERSION,
                contractName,
                ...contractVersion,
                chains: {},
            };
            const artifactString = utils.stringifyWithFormatting(newArtifact);
            const artefactName = `${contractFileName}-${contractName}`;
            const currentArtifactPath = `${this._artifactsDir}/${artefactName}.json`;
            await fsWrapper.writeFileAsync(currentArtifactPath, artifactString);
            logUtils.warn(`${artefactName} artifact saved!`);
        }
    }
}
