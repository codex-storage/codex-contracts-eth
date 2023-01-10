// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

contract Periods {
  type Period is uint256;

  uint256 internal immutable secondsPerPeriod;

  constructor(uint256 _secondsPerPeriod) {
    secondsPerPeriod = _secondsPerPeriod;
  }

  function periodOf(uint256 timestamp) internal view returns (Period) {
    return Period.wrap(timestamp / secondsPerPeriod);
  }

  function blockPeriod() internal view returns (Period) {
    return periodOf(block.timestamp);
  }

  function nextPeriod(Period period) internal pure returns (Period) {
    return Period.wrap(Period.unwrap(period) + 1);
  }

  function periodStart(Period period) internal view returns (uint256) {
    return Period.unwrap(period) * secondsPerPeriod;
  }

  function periodEnd(Period period) internal view returns (uint256) {
    return periodStart(nextPeriod(period));
  }

  function isBefore(Period a, Period b) internal pure returns (bool) {
    return Period.unwrap(a) < Period.unwrap(b);
  }

  function isAfter(Period a, Period b) internal pure returns (bool) {
    return isBefore(b, a);
  }
}
