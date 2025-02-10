// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./vault/VaultBase.sol";

contract Vault is VaultBase {
  // solhint-disable-next-line no-empty-blocks
  constructor(IERC20 token) VaultBase(token) {}

  function getBalance(
    Fund fund,
    Recipient recipient
  ) public view returns (uint128) {
    Controller controller = Controller.wrap(msg.sender);
    Balance memory balance = _getBalance(controller, fund, recipient);
    return balance.available + balance.designated;
  }

  function getDesignatedBalance(
    Fund fund,
    Recipient recipient
  ) public view returns (uint128) {
    Controller controller = Controller.wrap(msg.sender);
    Balance memory balance = _getBalance(controller, fund, recipient);
    return balance.designated;
  }

  function getLockStatus(Fund fund) public view returns (LockStatus) {
    Controller controller = Controller.wrap(msg.sender);
    return _getLockStatus(controller, fund);
  }

  function getLockExpiry(Fund fund) public view returns (Timestamp) {
    Controller controller = Controller.wrap(msg.sender);
    return _getLockExpiry(controller, fund);
  }

  function lock(Fund fund, Timestamp expiry, Timestamp maximum) public {
    Controller controller = Controller.wrap(msg.sender);
    _lock(controller, fund, expiry, maximum);
  }

  function extendLock(Fund fund, Timestamp expiry) public {
    Controller controller = Controller.wrap(msg.sender);
    _extendLock(controller, fund, expiry);
  }

  function deposit(Fund fund, Recipient recipient, uint128 amount) public {
    Controller controller = Controller.wrap(msg.sender);
    _deposit(controller, fund, recipient, amount);
  }

  function designate(
    Fund fund,
    Recipient recipient,
    uint128 amount
  ) public {
    Controller controller = Controller.wrap(msg.sender);
    _designate(controller, fund, recipient, amount);
  }

  function transfer(
    Fund fund,
    Recipient from,
    Recipient to,
    uint128 amount
  ) public {
    Controller controller = Controller.wrap(msg.sender);
    _transfer(controller, fund, from, to, amount);
  }

  function flow(
    Fund fund,
    Recipient from,
    Recipient to,
    TokensPerSecond rate
  ) public {
    Controller controller = Controller.wrap(msg.sender);
    _flow(controller, fund, from, to, rate);
  }

  function burnAccount(Fund fund, Recipient recipient) public {
    Controller controller = Controller.wrap(msg.sender);
    _burnAccount(controller, fund, recipient);
  }

  function burnFund(Fund fund) public {
    Controller controller = Controller.wrap(msg.sender);
    _burnFund(controller, fund);
  }

  function withdraw(Fund fund, Recipient recipient) public {
    Controller controller = Controller.wrap(msg.sender);
    _withdraw(controller, fund, recipient);
  }

  function withdrawByRecipient(Controller controller, Fund fund) public {
    Recipient recipient = Recipient.wrap(msg.sender);
    _withdraw(controller, fund, recipient);
  }
}
