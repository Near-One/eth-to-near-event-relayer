import { suite, test } from '@testdeck/mocha';
import {assert} from 'chai';
import {mock, instance, when} from 'ts-mockito';
import {BinancePriceSource, Incentivizer} from '../src/incentivizer';
import {Account} from "near-api-js";

@suite class IncentivizationUnitTests {
    @test async getAmountToTransferTest() {
        const mockedPriceSource:BinancePriceSource = mock(BinancePriceSource);
        when(mockedPriceSource.getPrice("DAIUSDT")).thenResolve(1.5);
        when(mockedPriceSource.getPrice("LINKUSDT")).thenResolve(3);

        const incentivizer = new Incentivizer(instance(mock(Account)), instance(mockedPriceSource));
        const result = await incentivizer.getAmountToTransfer({ethTokenSymbol:"DAI",
            incentivizationTokenSymbol:"LINK",
            incentivizationFactor:0.001
        },30000, 18);

        assert(result.toString() === "15000000000000000000");
    }

    @test async getAmountToTransferTestBinance() {
        const incentivizer = new Incentivizer(instance(mock(Account)), new BinancePriceSource());
        const result = await incentivizer.getAmountToTransfer({ethTokenSymbol:"DAI",
            incentivizationTokenSymbol:"LINK",
            incentivizationFactor:0.001
        },200, 18);

        assert(result.toString() != "");
    }
}
