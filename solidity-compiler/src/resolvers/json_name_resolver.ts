import * as fs from 'fs';
import * as path from 'path';

import { ContractSource, Resolver } from '@0x/sol-resolver';

const JSON_FILE_EXTENSION = '.json';

export class JSONNameResolver extends Resolver {
    private readonly _contractsDir: string;
    constructor(contractsDir: string) {
        super();
        this._contractsDir = contractsDir;
    }
    public resolveIfExists(lookupContractName: string): ContractSource | undefined {
        const lookupContractNameNormalized = path.basename(lookupContractName, JSON_FILE_EXTENSION);
        let contractSource: ContractSource | undefined;
        const onFile = (filePath: string) => {
            const contractName = path.basename(filePath, JSON_FILE_EXTENSION);
            if (contractName === lookupContractNameNormalized) {
                const contractPath = path.join(this._contractsDir, filePath);
                const absoluteContractPath = path.resolve(contractPath);
                const source = fs.readFileSync(absoluteContractPath).toString('utf-8');
                contractSource = {
                    source,
                    path: contractPath.replace('.json', '.sol'),
                    absolutePath: absoluteContractPath,
                };
                return true;
            }
            return undefined;
        };
        this._traverseContractsDir(this._contractsDir, onFile);
        return contractSource;
    }
    public getAll(): ContractSource[] {
        const contractSources: ContractSource[] = [];
        const onFile = (filePath: string) => {
            const contractPath = path.join(this._contractsDir, filePath);
            const absoluteContractPath = path.resolve(contractPath);
            const source = fs.readFileSync(absoluteContractPath).toString('utf-8');
            const contractSource = { source, path: contractPath, absolutePath: absoluteContractPath };
            contractSources.push(contractSource);
        };
        this._traverseContractsDir(this._contractsDir, onFile);
        return contractSources;
    }
    // tslint:disable-next-line:prefer-function-over-method
    private _traverseContractsDir(dirPath: string, onFile: (filePath: string) => true | void): boolean {
        let dirContents: string[] = [];
        try {
            dirContents = fs.readdirSync(dirPath);
        } catch (err) {
            throw new Error(`No directory found at ${dirPath}`);
        }
        for (const fileName of dirContents) {
            const absoluteEntryPath = path.join(dirPath, fileName);
            const isDirectory = fs.lstatSync(absoluteEntryPath).isDirectory();
            const entryPath = path.relative(this._contractsDir, absoluteEntryPath);
            let isComplete;
            if (isDirectory) {
                isComplete = this._traverseContractsDir(absoluteEntryPath, onFile);
            } else if (fileName.endsWith(JSON_FILE_EXTENSION)) {
                isComplete = onFile(entryPath);
            }
            if (isComplete) {
                return isComplete;
            }
        }
        return false;
    }
}
