.PHONY: run restore-last-session

START_FROM_BLOCK=6013034
NETWORK="sepolia"

default:
	yarn
	yarn run tsc
	yarn run eslint . --ext .ts
run:
	mkdir -p build/proofs
	node build/src/index.js --start-from-block=$(START_FROM_BLOCK) --network=$(NETWORK)
restore-last-session:
	mkdir -p build/proofs
	node build/src/index.js --restore-last-session
clean:
	rm -rf build
