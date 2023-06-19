#!/bin/bash
set -e

root=$(cd $(dirname "$0")/.. && pwd)
arch=$(arch)

if command -v echidna; then
  fuzz () {
    echidna ${root} \
      --config ${root}/fuzzing/echidna.yaml \
      --corpus-dir ${root}/fuzzing/corpus \
      --crytic-args --ignore-compile \
      --contract $1
  }
elif [ "${arch}" = "x86_64" ]; then
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
else
  echo "Error: echidna not found, and the docker image does not support ${arch}"
  echo "Please install echidna: https://github.com/crytic/echidna#installation"
  exit 1
fi

fuzz FuzzMarketplace
