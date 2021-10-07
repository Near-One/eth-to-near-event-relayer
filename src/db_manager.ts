import lokijs from 'lokijs'

const db = new lokijs('.loki_db.json', {env: "NODEJS", persistenceMethod: "fs", autosave: true});

export async function init(): Promise<Loki> {
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
