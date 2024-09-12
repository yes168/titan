"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MintCommand = void 0;
const nest_commander_1 = require("nest-commander");
const common_1 = require("../../common");
const ft_open_minter_1 = require("./ft.open-minter");
const providers_1 = require("../../providers");
const common_2 = require("@nestjs/common");
const console_1 = require("console");
const token_1 = require("../../token");
const decimal_js_1 = require("decimal.js");
const boardcast_command_1 = require("../boardcast.command");
const merge_1 = require("../send/merge");
const ft_1 = require("../send/ft");
const pick_1 = require("../send/pick");
function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}
let MintCommand = class MintCommand extends boardcast_command_1.BoardcastCommand {
    constructor(spendService, walletService, configService) {
        super(spendService, walletService, configService);
        this.spendService = spendService;
        this.walletService = walletService;
        this.configService = configService;
    }
    async cat_cli_run(passedParams, options) {
        try {
            if (options.id) {
                const address = this.walletService.getAddress();
                const token = await (0, token_1.findTokenMetadataById)(this.configService, options.id);
                if (!token) {
                    console.error(`No token found for tokenId: ${options.id}`);
                    return;
                }
                const scaledInfo = (0, token_1.scaleConfig)(token.info);
                let amount;
                if (passedParams[0]) {
                    try {
                        const d = new decimal_js_1.default(passedParams[0]).mul(Math.pow(10, scaledInfo.decimals));
                        amount = BigInt(d.toString());
                    }
                    catch (error) {
                        (0, common_1.logerror)(`Invalid amount: "${passedParams[0]}"`, error);
                        return;
                    }
                }
                const MAX_RETRY_COUNT = 10;
                for (let index = 0; index < MAX_RETRY_COUNT; index++) {
                    // await this.merge(token, address);
                    const feeRate = await this.getFeeRate();
                    const feeUtxos = await this.getFeeUTXOs(address);
                    if (feeUtxos.length === 0) {
                        console.warn('Insufficient satoshis balance!');
                        return;
                    }
                    const count = await (0, common_1.getTokenMinterCount)(this.configService, token.tokenId);
                    const maxTry = count < MAX_RETRY_COUNT ? count : MAX_RETRY_COUNT;
                    if (count == 0 && index >= maxTry) {
                        console.error('No available minter UTXO found!');
                        return;
                    }
                    const offset = getRandomInt(count - 1);
                    const minter = await (0, common_1.getTokenMinter)(this.configService, this.walletService, token, offset);
                    if (minter == null) {
                        continue;
                    }
                    if ((0, common_1.isOpenMinter)(token.info.minterMd5)) {
                        const minterState = minter.state.data;
                        if (minterState.isPremined && amount > scaledInfo.limit) {
                            console.error('The number of minted tokens exceeds the limit!');
                            return;
                        }
                        const limit = scaledInfo.limit;
                        if (!minter.state.data.isPremined && scaledInfo.premine > 0n) {
                            if (typeof amount === 'bigint') {
                                if (amount !== scaledInfo.premine) {
                                    throw new Error(`first mint amount should equal to premine ${scaledInfo.premine}`);
                                }
                            }
                            else {
                                amount = scaledInfo.premine;
                            }
                        }
                        else {
                            amount = amount || limit;
                            amount =
                                amount > minter.state.data.remainingSupply
                                    ? minter.state.data.remainingSupply
                                    : amount;
                        }
                        const mintTxIdOrErr = await (0, ft_open_minter_1.openMint)(this.configService, this.walletService, this.spendService, feeRate, feeUtxos, token, 2, minter, amount);
                        if (mintTxIdOrErr instanceof Error) {
                            if ((0, common_1.needRetry)(mintTxIdOrErr)) {
                                (0, console_1.log)(`retry to mint token [${token.info.symbol}] ...`);
                                await (0, common_1.sleep)(6);
                                continue;
                            }
                            else {
                                (0, common_1.logerror)(`mint token [${token.info.symbol}] failed`, mintTxIdOrErr);
                                return;
                            }
                        }
                        console.log(`Minting ${(0, common_1.unScaleByDecimals)(amount, token.info.decimals)} ${token.info.symbol} tokens in txid: ${mintTxIdOrErr} ...`);
                        return;
                    }
                    else {
                        throw new Error('unkown minter!');
                    }
                }
                console.error(`mint token [${token.info.symbol}] failed`);
            }
            else {
                throw new Error('expect a ID option');
            }
        }
        catch (error) {
            (0, common_1.logerror)('mint failed!', error);
        }
    }
    async merge(metadata, address) {
        const res = await (0, common_1.getTokens)(this.configService, this.spendService, metadata, address);
        if (res !== null) {
            const { contracts: tokenContracts } = res;
            if (tokenContracts.length > 1) {
                const cachedTxs = new Map();
                console.info(`Start merging your [${metadata.info.symbol}] tokens ...`);
                const feeUtxos = await this.getFeeUTXOs(address);
                const feeRate = await this.getFeeRate();
                const [newTokens, newFeeUtxos, e] = await (0, merge_1.mergeTokens)(this.configService, this.walletService, this.spendService, feeUtxos, feeRate, metadata, tokenContracts, address, cachedTxs);
                if (e instanceof Error) {
                    (0, common_1.logerror)('merge token failed!', e);
                    return;
                }
                const feeUtxo = (0, pick_1.pickLargeFeeUtxo)(newFeeUtxos);
                if (newTokens.length > 1) {
                    const amountTobeMerge = (0, ft_1.calcTotalAmount)(newTokens);
                    const result = await (0, ft_1.sendToken)(this.configService, this.walletService, feeUtxo, feeRate, metadata, newTokens, address, address, amountTobeMerge, cachedTxs);
                    if (result) {
                        await (0, merge_1.broadcastMergeTokenTxs)(this.configService, this.walletService, this.spendService, [result.commitTx, result.revealTx]);
                        console.info(`Merging your [${metadata.info.symbol}] tokens in txid: ${result.revealTx.id} ...`);
                    }
                }
            }
        }
    }
    parseId(val) {
        return val;
    }
    async getFeeUTXOs(address) {
        let feeUtxos = await (0, common_1.getUtxos)(this.configService, this.walletService, address);
        feeUtxos = feeUtxos.filter((utxo) => {
            return this.spendService.isUnspent(utxo);
        });
        if (feeUtxos.length === 0) {
            console.warn('Insufficient satoshis balance!');
            return [];
        }
        return feeUtxos;
    }
};
exports.MintCommand = MintCommand;
__decorate([
    (0, nest_commander_1.Option)({
        flags: '-i, --id [tokenId]',
        description: 'ID of the token',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", String)
], MintCommand.prototype, "parseId", null);
exports.MintCommand = MintCommand = __decorate([
    (0, nest_commander_1.Command)({
        name: 'mint',
        description: 'Mint a token',
    }),
    __param(0, (0, common_2.Inject)()),
    __param(1, (0, common_2.Inject)()),
    __param(2, (0, common_2.Inject)()),
    __metadata("design:paramtypes", [providers_1.SpendService,
        providers_1.WalletService,
        providers_1.ConfigService])
], MintCommand);
//# sourceMappingURL=mint.command.js.map
