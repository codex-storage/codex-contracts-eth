// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

abstract contract Collateral {
  IERC20 public immutable token;
  CollateralFunds private funds;

  mapping(address => uint256) private balances;

  constructor(IERC20 _token) collateralInvariant {
    token = _token;
  }

  function balanceOf(address account) public view returns (uint256) {
    return balances[account];
  }

  function add(address account, uint256 amount) private {
    balances[account] += amount;
    funds.balance += amount;
  }

  function subtract(address account, uint256 amount) private {
    balances[account] -= amount;
    funds.balance -= amount;
  }

  function transferFrom(address sender, uint256 amount) internal {
    address receiver = address(this);
    require(token.transferFrom(sender, receiver, amount), "Transfer failed");
  }

  function deposit(uint256 amount) public collateralInvariant {
    transferFrom(msg.sender, amount);
    funds.deposited += amount;
    add(msg.sender, amount);
  }

  function isWithdrawAllowed() internal virtual returns (bool);

  function withdraw() public collateralInvariant {
    require(isWithdrawAllowed(), "Account locked");
    uint256 amount = balanceOf(msg.sender);
    funds.withdrawn += amount;
    subtract(msg.sender, amount);
    assert(token.transfer(msg.sender, amount));
  }

  function _slashAmount(address account, uint256 percentage)
    internal
    view
    returns (uint256)
  {
    return (balanceOf(account) * percentage) / 100;
  }

  function _slash(address account, uint256 percentage)
    internal
    collateralInvariant
  {
    uint256 amount = _slashAmount(account, percentage);
    funds.slashed += amount;
    subtract(account, amount);
  }

  modifier collateralInvariant() {
    CollateralFunds memory oldFunds = funds;
    _;
    assert(funds.deposited >= oldFunds.deposited);
    assert(funds.withdrawn >= oldFunds.withdrawn);
    assert(funds.slashed >= oldFunds.slashed);
    assert(funds.deposited == funds.balance + funds.withdrawn + funds.slashed);
  }

  struct CollateralFunds {
    uint256 balance;
    uint256 deposited;
    uint256 withdrawn;
    uint256 slashed;
  }
}
