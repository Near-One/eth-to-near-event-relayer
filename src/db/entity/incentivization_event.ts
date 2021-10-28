import {Entity, Column, Index, PrimaryGeneratedColumn} from "typeorm";

@Entity()
export class IncentivizationEvent {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
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

    @Index()
    @Column()
    eventTxHash: string;

    @Column()
    depositTxHash: string;
}
