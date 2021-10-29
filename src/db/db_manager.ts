import "reflect-metadata";
import {createConnection} from "typeorm";
import {Connection} from "typeorm/connection/Connection";
import {Repository} from "typeorm/repository/Repository";
import {IncentivizationEvent} from "./entity/incentivization_event";
import BN from "bn.js";
import {DepositEvent} from "./entity/deposit_event";

export class DbManager {
    static dbConnection : Connection = null;

    static async open(fileName = '.relayer_db'): Promise<Connection> {
        DbManager.dbConnection = await createConnection({
            name: "default",
            type: "sqlite",
            database: fileName,
            synchronize: true,
            entities: [
                IncentivizationEvent,
                DepositEvent
            ],
        })

        return DbManager.dbConnection;
    }

    static async close(): Promise<void> {
        if (DbManager.dbConnection == null) {
            return;
        }
        return DbManager.dbConnection.close();
    }

    static incentivizationEventRep(): Repository<IncentivizationEvent> {
        return DbManager.dbConnection.getRepository(IncentivizationEvent);
    }

    static depositEventRep(): Repository<DepositEvent> {
        return DbManager.dbConnection.getRepository(DepositEvent);
    }

    static async getTotalTokensSpent(uuid: string, ethTokenAddress: string, incentivizationTokenAddress: string): Promise<BN>{
        const events = await DbManager.incentivizationEventRep().createQueryBuilder().select(["tokensAmount"])
            .where("ethTokenAddress = :ethTokenAddress")
            .andWhere("incentivizationTokenAddress = :incentivizationTokenAddress")
            .andWhere("uuid = :uuid")
            .setParameters({ethTokenAddress,
                incentivizationTokenAddress,
                uuid
            }).getRawMany();

        const sum = new BN(0);
        for (const event of events) {
            if (event.tokensAmount != null) {
                sum.iadd(new BN(event.tokensAmount));
            }
        }
        return sum;
    }
}
