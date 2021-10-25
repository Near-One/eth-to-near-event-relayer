import Binance from 'node-binance-api';

export interface IPriceSource {
    getPrice(fistSymbol: string, secondSymbol: string): Promise<number>;
}

export class BinancePriceSource implements IPriceSource{
    private binance = new Binance();
    async getPrice(fistSymbol: string, secondSymbol: string): Promise<number>{
        const pair = fistSymbol + secondSymbol;
        return Number((await this.binance.prices(pair))[pair]);
    }
}
