#!/bin/bash
set -e
echidna-test . --contract FuzzMarketplace --config fuzzing/echidna.yaml
