.PHONY: run restore-last-session

START_FROM_BLOCK=10147800

default:
	tsc
run:
	node build/src/index.js --start-from-block $(START_FROM_BLOCK)
restore-last-session:
	node build/src/index.js --restore-last-session
