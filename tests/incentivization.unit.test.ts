import { suite, test } from '@testdeck/mocha';
import {assert} from 'chai';
import {mock, instance, when} from 'ts-mockito';
import {BinancePriceSource, Incentivizer} from '../src/incentivizer';
import {Account} from "near-api-js";
import testConfig from "../src/json/test-config.json";
import * as nearAPI from "near-api-js";
import {parseTokenAmount} from "../src/utils_near";
import BN from "bn.js";

@suite class IncentivizationUnitTests {
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
        assert(result.toString() === "15".padEnd(15, '0'));

        decimals = 10
        result = await incentivizer.getAmountToTransfer(rule, new BN("55000000000000"), decimals);
        assert(result.toString() === "275".padEnd(11, '0'));

        decimals = 0;
        result = await incentivizer.getAmountToTransfer(rule, new BN("5000"), decimals);
        assert(result.toString() === "3");

        result = await incentivizer.getAmountToTransfer(rule, new BN("3000"), decimals);
        assert(result.toString() === "2");

        result = await incentivizer.getAmountToTransfer(rule, new BN("1000"), decimals);
        assert(result.toString() === "1");

        result = await incentivizer.getAmountToTransfer(rule, new BN("100"), decimals);
        assert(result.toString() === "0");
    }

    @test async getAmountToTransferTestBinance() {
        const decimals = 0;
        const incentivizer = new Incentivizer(instance(mock(Account)), [], new BinancePriceSource());
        const result = await incentivizer.getAmountToTransfer({ethTokenSymbol:"DAI",
            incentivizationTokenSymbol:"LINK",
            incentivizationFactor:0.001,
            fiatSymbol: "USDT"
        }, new BN("30000".padEnd(decimals, '0')), decimals);

        assert(result.toString() != "");
    }

    @test async parseTokenAmountTest(){
        console.assert(parseTokenAmount("1.5", 10) === "15000000000");
        console.assert(parseTokenAmount("100000000", 8) === "1000000000");
        console.assert(parseTokenAmount("0200000000", 9) === "20000000000");
    }

    @test async incentivizeTest() {
        const decimals = 0;
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
        const result = await incentivizer.incentivize({
            contractAddress: rule.ethToken,
            sender: "",
            amount: "3000".padEnd(decimals, '0'),
            accountId: rule.receiverAccountIdForTest
        });

        assert(result == true);
    }
}
