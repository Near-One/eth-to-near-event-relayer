import {suite, test} from '@testdeck/mocha';
import {expect} from 'chai';
import {anything, instance, mock, when} from 'ts-mockito';
import {Incentivizer} from '../src/incentivizer';
import {BinancePriceSource} from '../src/price_source'
import * as nearAPI from "near-api-js";
import {Account} from "near-api-js";
import testConfig from "./test-config.json";
import {parseTokenAmount} from "../src/utils_near";
import BN from "bn.js";
import * as dbManager from "../src/db_manager";
import {getTotalTokensSpent} from "../src/db_manager";
import * as fs from "fs";
import * as dotenv from "dotenv";
import {FungibleToken} from "../src/fungible_token";
dotenv.config({ path: "tests/.env" });

@suite class IncentivizationUnitTests { // eslint-disable-line @typescript-eslint/no-unused-vars
    @test async getAmountToTransferTest() {
        const mockedPriceSource:BinancePriceSource = mock(BinancePriceSource);
        when(mockedPriceSource.getPrice("FX","USDT")).thenResolve(1.5);
        when(mockedPriceSource.getPrice("LINK", "USDT")).thenResolve(3);
        const rule = {ethTokenSymbol:"FX",
            incentivizationTokenSymbol:"LINK",
            incentivizationFactor:0.001,
            fiatSymbol: "USDT"
        };

        let decimals = 18;
        const incentivizer = new Incentivizer(instance(mock(Account)), instance(mockedPriceSource));
        incentivizer.init(testConfig.rules);
        let result = await incentivizer.getAmountToTransfer(rule, new BN("3".padEnd(decimals, '0')), decimals);
        expect(result.toString()).to.be.equal("15".padEnd(15, '0'));

        decimals = 10
        result = await incentivizer.getAmountToTransfer(rule, new BN("55000000000000"), decimals);
        expect(result.toString()).to.be.equal("275".padEnd(11, '0'));

        decimals = 0;
        result = await incentivizer.getAmountToTransfer(rule, new BN("5000"), decimals);
        expect(result.toString()).to.be.equal("3");

        result = await incentivizer.getAmountToTransfer(rule, new BN("3000"), decimals);
        expect(result.toString()).to.be.equal("2");

        result = await incentivizer.getAmountToTransfer(rule, new BN("1000"), decimals);
        expect(result.toString()).to.be.equal("1");

        result = await incentivizer.getAmountToTransfer(rule, new BN("100"), decimals);
        expect(result.toString() === "0");

        decimals = 2;
        result = await incentivizer.getAmountToTransfer(rule, new BN("10000"), decimals);
        expect(result.toString()).to.be.equal("5");
    }

    @test async getAmountToTransferTestBinance() {
        const decimals = 0;
        const incentivizer = new Incentivizer(instance(mock(Account)), new BinancePriceSource());
        incentivizer.init([]);
        const result = await incentivizer.getAmountToTransfer({ethTokenSymbol:"DAI",
            incentivizationTokenSymbol:"LINK",
            incentivizationFactor:0.001,
            fiatSymbol: "USDT"
        }, new BN("30000".padEnd(decimals, '0')), decimals);

        expect(result.toString()).to.not.be.empty;
    }

    @test async parseTokenAmountTest(){
        expect(parseTokenAmount("1.5", 10)).to.be.equal("15000000000");
        expect(parseTokenAmount("10", 8)).to.be.equal("1000000000");
        expect(parseTokenAmount("020", 8)).to.be.equal("2000000000");
    }

    async incentivizeTest(amount: string): Promise<boolean>{
        const keyStore = new nearAPI.keyStores.UnencryptedFileSystemKeyStore(process.env.NEAR_KEY_STORE_PATH);
        const near = await nearAPI.connect({
            deps: {
                keyStore,
            },
            nodeUrl: testConfig.nearJsonRpc,
            networkId: testConfig.nearNetwork
        });
        const relayerNearAccount = await near.account(testConfig.relayerNearAccount);
        const mockedPriceSource:BinancePriceSource = mock(BinancePriceSource);
        when(mockedPriceSource.getPrice("FAU", "USDT")).thenResolve(1.5);
        when(mockedPriceSource.getPrice("eFAU","USDT")).thenResolve(2);
        const incentivizer = new Incentivizer(relayerNearAccount, instance(mockedPriceSource));
        incentivizer.init(testConfig.rules);
        const rule = testConfig.rules[0];
        return await incentivizer.incentivize({
            contractAddress: rule.ethToken,
            sender: "",
            amount: amount,
            accountId: rule.receiverAccountIdForTest,
            txHash: ""
        });
    }

    @test async incentivizeTestTrue() {
        expect(await this.incentivizeTest("3000")).to.be.true;
    }

    @test async incentivizeTestFalse() {
        expect(await this.incentivizeTest("3")).to.be.false;
    }

    @test async testIncentivizeTotalCap(){
        const rule = Object.assign({}, testConfig.rules[0]);
        const mockedContract:FungibleToken = mock(FungibleToken);
        when(mockedContract.transfer(anything(),anything(),anything(),anything())).thenResolve({
            status: null,
            transaction: {hash: "testHASH"},
            transaction_outcome: null,
            receipts_outcome: null
        });
        when(mockedContract.getMetaData()).thenResolve({
            icon: null,
            name: "",
            reference: null,
            reference_hash: null,
            spec: "",
            symbol: "",
            decimals: 0});
        when(mockedContract.balanceOf(anything())).thenResolve("1000000");
        const mockedPriceSource:BinancePriceSource = mock(BinancePriceSource);
        when(mockedPriceSource.getPrice(anything(), anything())).thenResolve(1.5);
        const incentivizer = new Incentivizer(instance(mock(Account)), instance(mockedPriceSource));
        incentivizer.init(testConfig.rules);

        const lockEvent = {
            contractAddress: rule.ethToken,
            sender: "",
            amount: "",
            accountId: rule.receiverAccountIdForTest,
            txHash: ""
        };

        let totalSpentBefore = getTotalTokensSpent(rule.uuid, rule.ethToken, rule.incentivizationToken);
        lockEvent.amount = "1";
        let res = await incentivizer.incentivizeByRule(lockEvent, rule, instance(mockedContract));
        expect(res).to.be.false;
        let totalSpentAfter = getTotalTokensSpent(rule.uuid, rule.ethToken, rule.incentivizationToken);
        expect(totalSpentAfter.toString()).to.be.equal(totalSpentBefore.toString());

        lockEvent.amount = "10000";
        res = await incentivizer.incentivizeByRule(lockEvent, rule, instance(mockedContract));
        expect(res).to.be.true;
        totalSpentBefore = totalSpentAfter;
        totalSpentAfter = getTotalTokensSpent(rule.uuid, rule.ethToken, rule.incentivizationToken);
        expect(totalSpentAfter.toString()).to.be.equal(totalSpentBefore.add(new BN("10")).toString());

        rule.incentivizationTotalCap = 10;
        res = await incentivizer.incentivizeByRule(lockEvent, rule, instance(mockedContract));
        expect(res).to.be.false;
        totalSpentBefore = totalSpentAfter;
        totalSpentAfter = getTotalTokensSpent(rule.uuid, rule.ethToken, rule.incentivizationToken);
        expect(totalSpentAfter.toString()).to.be.equal(totalSpentBefore.toString());
    }

    async before() {
        const dbFile = ".relayer_db_test.json";
        try {
            fs.unlinkSync(dbFile)
        } catch(err) {
            // continue regardless of error
        }
        await dbManager.open(dbFile);
    }

    async after() {
        await dbManager.close();
    }
}
