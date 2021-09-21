const fs = require('fs');

const LAST_PROCESSED_BLOCK_SESSION_FILE_NAME = '.event_relayer_session';

function isLastSessionExists() {
    try {
        if (fs.existsSync(LAST_PROCESSED_BLOCK_SESSION_FILE_NAME)) {
            return true;
        }
    } catch(err) {
        return false;
    }
}

function getLastSessionBlockNumber() {
    if (!isLastSessionExists()) {
        console.error(`Session file does not exist!`);
        return -1;
    }

    try {
        const last_block_str = fs.readFileSync(LAST_PROCESSED_BLOCK_SESSION_FILE_NAME, 'utf-8');
        const last_block_number = Number(last_block_str);
        return last_block_number;
    } catch (err) {
        console.error(err);
        return -1;
    }
}

function recordSession(blockNumber) {
    try {
        fs.writeFileSync(LAST_PROCESSED_BLOCK_SESSION_FILE_NAME, blockNumber.toString());
    } catch (err) {
        console.error(err);
    }
}

exports.isLastSessionExists = isLastSessionExists;
exports.getLastSessionBlockNumber = getLastSessionBlockNumber;
exports.recordSession = recordSession;
