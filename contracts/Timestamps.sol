// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// Represents a moment in time, represented as unix time (number of seconds
/// since 1970). Uses a uint40 to facilitate efficient packing in structs. A
/// uint40 allows times to be represented for the coming 30 000 years.
type Timestamp is uint40;
/// Represents a duration of time in seconds
type Duration is uint40;

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
  /// Returns the current block timestamp converted to a Timestamp type
  function currentTime() internal view returns (Timestamp) {
    return Timestamp.wrap(uint40(block.timestamp));
  }

  /// Calculates the duration from start until end
  function until(
    Timestamp start,
    Timestamp end
  ) internal pure returns (Duration) {
    return Duration.wrap(Timestamp.unwrap(end) - Timestamp.unwrap(start));
  }
}
