// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./AccountLocks.sol";

contract Collateral is AccountLocks {
  IERC20 private immutable token;
  Totals private totals;
  mapping(address => uint256) private balances;

  constructor(IERC20 _token) invariant {
    token = _token;
  }

  function balanceOf(address account) public view returns (uint256) {
    return balances[account];
  }

  function add(address account, uint256 amount) private {
    balances[account] += amount;
    totals.balance += amount;
  }

  function subtract(address account, uint256 amount) private {
    balances[account] -= amount;
    totals.balance -= amount;
  }

  function transferFrom(address sender, uint256 amount) private {
    address receiver = address(this);
    require(token.transferFrom(sender, receiver, amount), "Transfer failed");
  }

  function deposit(uint256 amount) public invariant {
    transferFrom(msg.sender, amount);
    totals.deposited += amount;
    add(msg.sender, amount);
  }

  function withdraw() public invariant {
    _unlockAccount();
    uint256 amount = balanceOf(msg.sender);
    totals.withdrawn += amount;
    subtract(msg.sender, amount);
    assert(token.transfer(msg.sender, amount));
  }

  function _slash(address account, uint256 percentage) internal invariant {
    uint256 amount = (balanceOf(account) * percentage) / 100;
    totals.slashed += amount;
    subtract(account, amount);
  }

  modifier invariant() {
    Totals memory oldTotals = totals;
    _;
    assert(totals.deposited >= oldTotals.deposited);
    assert(totals.withdrawn >= oldTotals.withdrawn);
    assert(totals.slashed >= oldTotals.slashed);
    assert(
      totals.deposited == totals.balance + totals.withdrawn + totals.slashed
    );
  }

  struct Totals {
    uint256 balance;
    uint256 deposited;
    uint256 withdrawn;
    uint256 slashed;
  }
}
