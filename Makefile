.PHONY: run restore-last-session

start-from-block=10147800

default:
	yarn run tsc
	yarn run eslint . --ext .ts
run:
	mkdir -p build/proofs
	node build/src/index.js --start-from-block=$(start-from-block) --network=$(network)
restore-last-session:
	mkdir -p build/proofs
	node build/src/index.js --restore-last-session
clean:
	rm -rf build
