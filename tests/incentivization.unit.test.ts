import {suite, test} from '@testdeck/mocha';
import {expect} from 'chai';
import {instance, mock, when} from 'ts-mockito';
import {BinancePriceSource, Incentivizer} from '../src/incentivizer';
import * as nearAPI from "near-api-js";
import {Account} from "near-api-js";
import testConfig from "../src/json/test-config.json";
import {parseTokenAmount} from "../src/utils_near";
import BN from "bn.js";
import * as dbManager from "../src/db_manager";


@suite class IncentivizationUnitTests { // eslint-disable-line @typescript-eslint/no-unused-vars
    @test async getAmountToTransferTest() {
        const mockedPriceSource:BinancePriceSource = mock(BinancePriceSource);
        when(mockedPriceSource.getPrice("DAI","USDT")).thenResolve(1.5);
        when(mockedPriceSource.getPrice("LINK", "USDT")).thenResolve(3);
        const rule = {ethTokenSymbol:"DAI",
            incentivizationTokenSymbol:"LINK",
            incentivizationFactor:0.001,
            fiatSymbol: "USDT"
        };

        let decimals = 18;
        const incentivizer = new Incentivizer(instance(mock(Account)), testConfig.rules, instance(mockedPriceSource));
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
        const incentivizer = new Incentivizer(instance(mock(Account)), [], new BinancePriceSource());
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
        const keyStore = new nearAPI.keyStores.UnencryptedFileSystemKeyStore(testConfig.keyStorePath);
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
        const incentivizer = new Incentivizer(relayerNearAccount, testConfig.rules, instance(mockedPriceSource));
        const rule = testConfig.rules[0];
        return await incentivizer.incentivize({
            contractAddress: rule.ethToken,
            sender: "",
            amount: amount,
            accountId: rule.receiverAccountIdForTest
        });
    }

    @test async incentivizeTestTrue() {
        expect(await this.incentivizeTest("3000")).to.be.true;
    }

    @test async incentivizeTestFalse() {
        expect(await this.incentivizeTest("3")).to.be.false;
    }

    async before() {
        await dbManager.init();
    }

    async after() {
        await dbManager.close();
    }
}
