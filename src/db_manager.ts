import lokijs from 'lokijs'
import BN from "bn.js";

let db : lokijs = null;

export async function open(fileName = '.relayer_db.json'): Promise<Loki> {
    db = new lokijs(fileName, {env: "NODEJS", persistenceMethod: "fs", autosave: true, autosaveInterval: 5000});
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
        exact:["uuid", "ethTokenAddress", "incentivizationTokenAddress", "accountId", "txHash", "tokensAmount", "eventTxHash"] });
}

export function relayerCol(){ // eslint-disable-line @typescript-eslint/explicit-module-boundary-types
    return db.addCollection("relayer", { indices: ["eventTxHash", "blockNumber"],
        exact:["eventTxHash", "blockNumber", "depositTxHash"] });
}

export function getTotalTokensSpent(uuid: string, ethTokenAddress: string, incentivizationTokenAddress: string): BN{
    return incentivizationCol().chain().find({ethTokenAddress: ethTokenAddress,
        incentivizationTokenAddress: incentivizationTokenAddress,
        uuid: uuid,
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
