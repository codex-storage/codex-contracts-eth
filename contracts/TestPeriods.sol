// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./Periods.sol";

contract TestPeriods is Periods {
  
  function initialize (
    uint64 secondsPerPeriod
  ) public initializer {
    _initializePeriods(secondsPerPeriod);
  }
}
