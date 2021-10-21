// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Stakes.sol";

// exposes internal functions of Stakes for testing
contract TestStakes is Stakes {

  constructor(IERC20 token) Stakes(token) {}

  function lock(address account) public {
    _lock(account);
  }

  function unlock(address account) public {
    _unlock(account);
  }
}
