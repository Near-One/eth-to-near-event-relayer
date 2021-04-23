.PHONY: run

START_FROM_BLOCK=10090520

run:
	node src/index.js $(START_FROM_BLOCK)
