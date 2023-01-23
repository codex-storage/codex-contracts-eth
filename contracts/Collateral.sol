// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

abstract contract Collateral {
  IERC20 public immutable token;
  CollateralFunds private _funds;

  mapping(address => uint256) private _balances;

  constructor(IERC20 token_) collateralInvariant {
    token = token_;
  }

  function balanceOf(address account) public view returns (uint256) {
    return _balances[account];
  }

  function _add(address account, uint256 amount) private {
    _balances[account] += amount;
    _funds.balance += amount;
  }

  function _subtract(address account, uint256 amount) private {
    _balances[account] -= amount;
    _funds.balance -= amount;
  }

  function _transferFrom(address sender, uint256 amount) internal {
    address receiver = address(this);
    require(token.transferFrom(sender, receiver, amount), "Transfer failed");
  }

  function deposit(uint256 amount) public collateralInvariant {
    _transferFrom(msg.sender, amount);
    _funds.deposited += amount;
    _add(msg.sender, amount);
  }

  function _isWithdrawAllowed() internal virtual returns (bool);

  function withdraw() public collateralInvariant {
    require(_isWithdrawAllowed(), "Account locked");
    uint256 amount = balanceOf(msg.sender);
    _funds.withdrawn += amount;
    _subtract(msg.sender, amount);
    assert(token.transfer(msg.sender, amount));
  }

  function _slash(
    address account,
    uint256 percentage
  ) internal collateralInvariant {
    uint256 amount = (balanceOf(account) * percentage) / 100;
    _funds.slashed += amount;
    _subtract(account, amount);
  }

  modifier collateralInvariant() {
    CollateralFunds memory oldFunds = _funds;
    _;
    assert(_funds.deposited >= oldFunds.deposited);
    assert(_funds.withdrawn >= oldFunds.withdrawn);
    assert(_funds.slashed >= oldFunds.slashed);
    assert(
      _funds.deposited == _funds.balance + _funds.withdrawn + _funds.slashed
    );
  }

  struct CollateralFunds {
    uint256 balance;
    uint256 deposited;
    uint256 withdrawn;
    uint256 slashed;
  }
}
