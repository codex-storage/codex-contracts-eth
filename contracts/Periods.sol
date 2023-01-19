// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

contract Periods {
  type Period is uint256;

  uint256 internal immutable secondsPerPeriod;

  constructor(uint256 _secondsPerPeriod) {
    secondsPerPeriod = _secondsPerPeriod;
  }

  function _periodOf(uint256 timestamp) internal view returns (Period) {
    return Period.wrap(timestamp / secondsPerPeriod);
  }

  function _blockPeriod() internal view returns (Period) {
    return _periodOf(block.timestamp);
  }

  function _nextPeriod(Period period) internal pure returns (Period) {
    return Period.wrap(Period.unwrap(period) + 1);
  }

  function _periodStart(Period period) internal view returns (uint256) {
    return Period.unwrap(period) * secondsPerPeriod;
  }

  function _periodEnd(Period period) internal view returns (uint256) {
    return _periodStart(_nextPeriod(period));
  }

  function _isBefore(Period a, Period b) internal pure returns (bool) {
    return Period.unwrap(a) < Period.unwrap(b);
  }

  function _isAfter(Period a, Period b) internal pure returns (bool) {
    return _isBefore(b, a);
  }
}
