import lokijs from 'lokijs'

let isLoaded = false;
const db = new lokijs('.loki_db.json', {env: "NODEJS", persistenceMethod: "fs", autosave: true});

export async function init(): Promise<Loki> {
    return new Promise((resolve) => {
        db.loadDatabase({},function (err){
            if (err) {
                throw err;
            }
            isLoaded = true;
            resolve(db);
        });
    });
}

export async function close() {
    return new Promise((resolve) => {
        db.close(function (err){
            resolve(db);
            if (err) {
                console.log(err);
            }
        });
    });
}

export function incentivizationCol(){
    return db.addCollection("incentivization", { indices: ["ethTokenAddress", "tokensAmount"],
        exact:["ethTokenAddress", "accountId", "txHash", "tokensAmount"] });
}

