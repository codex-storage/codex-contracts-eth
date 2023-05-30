#!/bin/bash
set -e

root=$(cd $(dirname "$0")/.. && pwd)

if command -v echidna; then
  fuzz () {
    echidna ${root} \
      --config ${root}/fuzzing/echidna.yaml \
      --corpus-dir ${root}/fuzzing/corpus \
      --crytic-args --ignore-compile \
      --contract $1
  }
else
  fuzz () {
    docker run \
      --rm \
      -v ${root}:/src ghcr.io/crytic/echidna/echidna \
      bash -c \
        "cd /src && echidna . \
          --config fuzzing/echidna.yaml \
          --corpus-dir fuzzing/corpus \
          --crytic-args --ignore-compile \
          --contract $1"
  }
fi

fuzz FuzzMarketplace
