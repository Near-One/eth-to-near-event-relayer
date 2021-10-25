import * as fs from 'fs';

const LAST_PROCESSED_BLOCK_SESSION_FILE_NAME = '.event_relayer_session';

interface ILastSession {
    lastBlockNumber: number,
    network: string
}

export function isLastSessionExists(): boolean {
    try {
        if (fs.existsSync(LAST_PROCESSED_BLOCK_SESSION_FILE_NAME)) {
            return true;
        }
    } catch(err) {
        return false;
    }
}

export function getLastSession(): ILastSession {
    if (!isLastSessionExists()) {
        console.error(`Session file does not exist!`);
        return null;
    }

    try {
        const state = JSON.parse(fs.readFileSync(LAST_PROCESSED_BLOCK_SESSION_FILE_NAME, 'utf-8'));
        if (typeof state === "object" && state != null) {
            return state;
        }
    } catch (err) {
        console.error(err);
    }

    return null;
}

export function recordSession(lastSession: ILastSession): void {
    try {
        fs.writeFileSync(LAST_PROCESSED_BLOCK_SESSION_FILE_NAME, JSON.stringify(lastSession));
    } catch (err) {
        console.error(err);
    }
}
