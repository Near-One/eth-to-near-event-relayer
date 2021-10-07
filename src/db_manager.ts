import lokijs from 'lokijs'
import BN from "bn.js";

let db : lokijs = null;

export async function open(fileName = '.loki_db.json'): Promise<Loki> {
    db = new lokijs(fileName, {env: "NODEJS", persistenceMethod: "fs", autosave: true});
    return new Promise((resolve) => {
        db.loadDatabase({},function (err){
            if (err) {
                throw err;
            }
            resolve(db);
        });
    });
}

export async function close(): Promise<lokijs> {
    return new Promise((resolve) => {
        db.close(function (err){
            resolve(db);
            if (err) {
                console.log(err);
            }
        });
    });
}

export function incentivizationCol(){ // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
    return db.addCollection("incentivization", { indices: ["ethTokenAddress", "incentivizationTokenAddress"],
        exact:["ethTokenAddress", "incentivizationTokenAddress", "accountId", "txHash", "tokensAmount", "eventTxHash"] });
}

export function relayerCol(){ // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
    return db.addCollection("relayer", { indices: ["eventTxHash"],
        exact:["eventTxHash", "blockNumber", "depositTxHash"] });
}

export function getTotalTokensSpent(ethTokenAddress: string, incentivizationTokenAddress: string): BN{
    return incentivizationCol().chain().find({ethTokenAddress: ethTokenAddress,
        incentivizationTokenAddress: incentivizationTokenAddress
    }).mapReduce((obj)=>{return obj.tokensAmount}, (array)=>{
        const sum = new BN(0);
        for (const amount of array){
            if(amount != null){
                sum.iadd(new BN(amount));
            }
        }
        return sum;
    });
}
