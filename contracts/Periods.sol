// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Timestamps.sol";

contract Periods {
  error Periods_InvalidSecondsPerPeriod();

  type Period is uint40;

  Duration internal immutable _secondsPerPeriod;

  constructor(Duration secondsPerPeriod) {
    if (secondsPerPeriod == Duration.wrap(0)) {
      revert Periods_InvalidSecondsPerPeriod();
    }
    _secondsPerPeriod = secondsPerPeriod;
  }

  function _periodOf(Timestamp timestamp) internal view returns (Period) {
    return
      Period.wrap(
        Timestamp.unwrap(timestamp) / Duration.unwrap(_secondsPerPeriod)
      );
  }

  function _blockPeriod() internal view returns (Period) {
    return _periodOf(Timestamps.currentTime());
  }

  function _nextPeriod(Period period) internal pure returns (Period) {
    return Period.wrap(Period.unwrap(period) + 1);
  }

  function _periodStart(Period period) internal view returns (Timestamp) {
    return
      Timestamp.wrap(
        Period.unwrap(period) * Duration.unwrap(_secondsPerPeriod)
      );
  }

  function _periodEnd(Period period) internal view returns (Timestamp) {
    return _periodStart(_nextPeriod(period));
  }

  function _isBefore(Period a, Period b) internal pure returns (bool) {
    return Period.unwrap(a) < Period.unwrap(b);
  }

  function _isAfter(Period a, Period b) internal pure returns (bool) {
    return _isBefore(b, a);
  }
}
