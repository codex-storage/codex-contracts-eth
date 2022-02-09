// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Stakes.sol";

// exposes internal functions of Stakes for testing
contract TestStakes is Stakes {
  constructor(IERC20 token) Stakes(token) {}

  function stake(address account) public view returns (uint256) {
    return _stake(account);
  }

  function increaseStake(uint256 amount) public {
    _increaseStake(amount);
  }

  function withdrawStake() public {
    _withdrawStake();
  }

  function lockStake(address account) public {
    _lockStake(account);
  }

  function unlockStake(address account) public {
    _unlockStake(account);
  }

  function slash(address account, uint256 percentage) public {
    _slash(account, percentage);
  }
}
