.PHONY: run

START_FROM_BLOCK=10147800

run:
	node src/index.js $(START_FROM_BLOCK)
