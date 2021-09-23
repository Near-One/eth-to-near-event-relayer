import * as fs from 'fs';

const LAST_PROCESSED_BLOCK_SESSION_FILE_NAME = '.event_relayer_session';

export function isLastSessionExists() {
    try {
        if (fs.existsSync(LAST_PROCESSED_BLOCK_SESSION_FILE_NAME)) {
            return true;
        }
    } catch(err) {
        return false;
    }
}

export function getLastSessionBlockNumber() {
    if (!isLastSessionExists()) {
        console.error(`Session file does not exist!`);
        return -1;
    }

    try {
        const last_block_str = fs.readFileSync(LAST_PROCESSED_BLOCK_SESSION_FILE_NAME, 'utf-8');
        return Number(last_block_str);
    } catch (err) {
        console.error(err);
        return -1;
    }
}

export function recordSession(blockNumber: number) {
    try {
        fs.writeFileSync(LAST_PROCESSED_BLOCK_SESSION_FILE_NAME, blockNumber.toString());
    } catch (err) {
        console.error(err);
    }
}
