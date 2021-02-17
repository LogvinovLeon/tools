#!/usr/bin/env node
// We need the above pragma since this script will be run as a command-line tool.

import { logUtils } from '@0x/utils';
import * as _ from 'lodash';
import 'source-map-support/register';
import * as yargs from 'yargs';

import { ALL_CONTRACTS_IDENTIFIER, Compiler, TYPE_ALL_FILES_IDENTIFIER } from './compiler';
import { JSONCompiler } from './json_compiler';

const SEPARATOR = ',';

interface BaseArgsType {
    contracts?: string | TYPE_ALL_FILES_IDENTIFIER;
    contractsDir?: string;
    artifactsDir?: string;
}

type ContractsType = string[] | TYPE_ALL_FILES_IDENTIFIER | undefined;

(async () => {
    const argv = yargs
        .command(
            ['compile', '*'],
            'compile Solidity contracts',
            argvCompile => {
                argvCompile
                    .option('contracts-dir', {
                        type: 'string',
                        description: 'path of contracts directory to compile',
                    })
                    .option('artifacts-dir', {
                        type: 'string',
                        description: 'path to write contracts artifacts to',
                    })
                    .option('contracts', {
                        type: 'string',
                        description: 'comma separated list of contracts to compile',
                    })
                    .option('watch', {
                        alias: 'w',
                        default: false,
                    });
            },
            async (argvCompile: BaseArgsType & { watch: boolean }) => {
                const contracts: ContractsType =
                    argvCompile.contracts === undefined
                        ? undefined
                        : argvCompile.contracts === ALL_CONTRACTS_IDENTIFIER
                        ? ALL_CONTRACTS_IDENTIFIER
                        : argvCompile.contracts.split(SEPARATOR);
                const opts = _.omitBy(
                    {
                        contractsDir: argvCompile.contractsDir,
                        artifactsDir: argvCompile.artifactsDir,
                        contracts,
                        isOfflineMode: process.env.SOLC_OFFLINE ? true : undefined,
                    },
                    v => v === undefined,
                );
                const compiler = new Compiler(await Compiler.getCompilerOptionsAsync(opts));
                if (argvCompile.watch) {
                    await compiler.watchAsync();
                } else {
                    await compiler.compileAsync();
                }
                process.exit(0);
            },
        )
        .command(
            'compile-json',
            'compile from standard JSON input format',
            argvCompileJson => {
                argvCompileJson
                    .option('contracts-dir', {
                        type: 'string',
                        description: 'path of contracts directory to compile',
                    })
                    .option('artifacts-dir', {
                        type: 'string',
                        description: 'path to write contracts artifacts to',
                    })
                    .option('contracts', {
                        type: 'string',
                        description: 'comma separated list of contracts to compile',
                    });
            },
            async (argvCompileJSON: BaseArgsType) => {
                const contracts: ContractsType =
                    argvCompileJSON.contracts === undefined
                        ? undefined
                        : argvCompileJSON.contracts === ALL_CONTRACTS_IDENTIFIER
                        ? ALL_CONTRACTS_IDENTIFIER
                        : argvCompileJSON.contracts.split(SEPARATOR);
                const opts = _.omitBy(
                    {
                        contractsDir: argvCompileJSON.contractsDir,
                        artifactsDir: argvCompileJSON.artifactsDir,
                        contracts,
                        isOfflineMode: process.env.SOLC_OFFLINE ? true : undefined,
                    },
                    v => v === undefined,
                );
                const compiler = new JSONCompiler(await JSONCompiler.getCompilerOptionsAsync(opts));
                await compiler.compileAsync();
                process.exit(0);
            },
        )
        .demandCommand().argv;
})().catch(err => {
    logUtils.log(err);
    process.exit(1);
});
