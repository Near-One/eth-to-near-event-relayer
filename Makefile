.PHONY: run restore-last-session

START_FROM_BLOCK=10147800

run:
	node src/index.js --start-from-block $(START_FROM_BLOCK)

restore-last-session:
	node src/index.js --restore-last-session
