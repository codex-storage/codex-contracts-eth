// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Stakes {

  IERC20 private token;
  mapping(address=>uint) private stakes;
  mapping(address=>uint) private locks;

  constructor(IERC20 __token) {
    token = __token;
  }

  function _token() internal view returns (IERC20) {
    return token;
  }

  function _stake(address account) internal view returns (uint) {
    return stakes[account];
  }

  function _increaseStake(uint amount) internal {
    token.transferFrom(msg.sender, address(this), amount);
    stakes[msg.sender] += amount;
  }

  function _withdrawStake() internal {
    require(locks[msg.sender] == 0, "Stake locked");
    token.transfer(msg.sender, stakes[msg.sender]);
  }

  function _lockStake(address account) internal {
    locks[account] += 1;
  }

  function _unlockStake(address account) internal {
    require(locks[account] > 0, "Stake already unlocked");
    locks[account] -= 1;
  }

  function _slash(address account, uint percentage) internal {
    stakes[account] = stakes[account] * (100 - percentage) / 100;
  }
}
