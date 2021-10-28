import {Entity, Column, Index, PrimaryGeneratedColumn} from "typeorm";

@Entity()
export class DepositEvent {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column()
    eventTxHash: string;

    @Index()
    @Column()
    blockNumber: number;

    @Column()
    depositTxHash: string;
}
