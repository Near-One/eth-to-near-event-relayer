import {Entity, Column, Index, PrimaryGeneratedColumn} from "typeorm";

@Entity()
export class IncentivizationEvent {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    uuid: string;

    @Index()
    @Column()
    ethTokenAddress: string;

    @Index()
    @Column()
    incentivizationTokenAddress: string;

    @Column()
    accountId: string;

    @Column()
    txHash: string;

    @Column()
    tokensAmount: string;

    @Column()
    eventTxHash: string;
}
