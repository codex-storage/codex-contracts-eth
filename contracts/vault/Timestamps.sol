// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

type Timestamp is uint64;
type Duration is uint64;

using {_timestampEquals as ==} for Timestamp global;
using {_timestampNotEqual as !=} for Timestamp global;
using {_timestampLessThan as <} for Timestamp global;
using {_timestampAtMost as <=} for Timestamp global;

function _timestampEquals(Timestamp a, Timestamp b) pure returns (bool) {
  return Timestamp.unwrap(a) == Timestamp.unwrap(b);
}

function _timestampNotEqual(Timestamp a, Timestamp b) pure returns (bool) {
  return Timestamp.unwrap(a) != Timestamp.unwrap(b);
}

function _timestampLessThan(Timestamp a, Timestamp b) pure returns (bool) {
  return Timestamp.unwrap(a) < Timestamp.unwrap(b);
}

function _timestampAtMost(Timestamp a, Timestamp b) pure returns (bool) {
  return Timestamp.unwrap(a) <= Timestamp.unwrap(b);
}

library Timestamps {
  function currentTime() internal view returns (Timestamp) {
    return Timestamp.wrap(uint64(block.timestamp));
  }

  function until(
    Timestamp start,
    Timestamp end
  ) internal pure returns (Duration) {
    return Duration.wrap(Timestamp.unwrap(end) - Timestamp.unwrap(start));
  }
}
