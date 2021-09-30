.PHONY: run restore-last-session

START_FROM_BLOCK=10147800

default:
	yarn run tsc
	eslint . --ext .ts
run:
	mkdir -p build/proofs
	node build/src/index.js --start-from-block $(START_FROM_BLOCK)
restore-last-session:
	mkdir -p build/proofs
	node build/src/index.js --restore-last-session
clean:
	rm -rf build
