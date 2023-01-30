#!/bin/bash
set -e

if command -v echidna-test; then
  fuzz () {
    echidna-test . \
      --config fuzzing/echidna.yaml \
      --contract $1
  }
else
  fuzz () {
    docker run \
      --rm \
      -v `pwd`:/src ghcr.io/crytic/echidna/echidna \
      bash -c \
        "cd /src && echidna-test . \
          --config fuzzing/echidna.yaml \
          --crytic-args --ignore-compile \
          --contract $1"
  }
fi

fuzz FuzzMarketplace
