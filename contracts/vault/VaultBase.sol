// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Accounts.sol";
import "./Timestamps.sol";
import "./TokenFlows.sol";
import "./Locks.sol";

using SafeERC20 for IERC20;
using Timestamps for Timestamp;
using Accounts for Account;
using Locks for Lock;

abstract contract VaultBase {
  IERC20 internal immutable _token;

  type Controller is address;
  type Fund is bytes32;
  type Recipient is address;

  mapping(Controller => mapping(Fund => Lock)) private _locks;
  mapping(Controller => mapping(Fund => mapping(Recipient => Account)))
    private _accounts;

  constructor(IERC20 token) {
    _token = token;
  }

  function _getLockStatus(
    Controller controller,
    Fund fund
  ) internal view returns (LockStatus) {
    return _locks[controller][fund].status();
  }

  function _getLockExpiry(
    Controller controller,
    Fund fund
  ) internal view returns (Timestamp) {
    return _locks[controller][fund].expiry;
  }

  function _getBalance(
    Controller controller,
    Fund fund,
    Recipient recipient
  ) internal view returns (Balance memory) {
    Lock memory lock = _locks[controller][fund];
    LockStatus lockStatus = lock.status();
    if (lockStatus == LockStatus.Locked) {
      Account memory account = _accounts[controller][fund][recipient];
      account.update(Timestamps.currentTime());
      return account.balance;
    }
    if (lockStatus == LockStatus.Unlocked) {
      Account memory account = _accounts[controller][fund][recipient];
      account.update(lock.expiry);
      return account.balance;
    }
    return Balance({available: 0, designated: 0});
  }

  function _lock(
    Controller controller,
    Fund fund,
    Timestamp expiry,
    Timestamp maximum
  ) internal {
    Lock memory lock = _locks[controller][fund];
    require(lock.status() == LockStatus.NoLock, VaultFundAlreadyLocked());
    lock.expiry = expiry;
    lock.maximum = maximum;
    _checkLockInvariant(lock);
    _locks[controller][fund] = lock;
  }

  function _extendLock(
    Controller controller,
    Fund fund,
    Timestamp expiry
  ) internal {
    Lock memory lock = _locks[controller][fund];
    require(lock.status() == LockStatus.Locked, VaultFundNotLocked());
    require(lock.expiry <= expiry, VaultInvalidExpiry());
    lock.expiry = expiry;
    _checkLockInvariant(lock);
    _locks[controller][fund] = lock;
  }

  function _deposit(
    Controller controller,
    Fund fund,
    Recipient recipient,
    uint128 amount
  ) internal {
    Lock storage lock = _locks[controller][fund];
    require(lock.status() == LockStatus.Locked, VaultFundNotLocked());

    Account storage account = _accounts[controller][fund][recipient];

    account.balance.available += amount;
    lock.value += amount;

    _token.safeTransferFrom(
      Controller.unwrap(controller),
      address(this),
      amount
    );
  }

  function _designate(
    Controller controller,
    Fund fund,
    Recipient recipient,
    uint128 amount
  ) internal {
    Lock memory lock = _locks[controller][fund];
    require(lock.status() == LockStatus.Locked, VaultFundNotLocked());

    Account memory account = _accounts[controller][fund][recipient];
    require(amount <= account.balance.available, VaultInsufficientBalance());

    account.balance.available -= amount;
    account.balance.designated += amount;
    _checkAccountInvariant(account, lock);

    _accounts[controller][fund][recipient] = account;
  }

  function _transfer(
    Controller controller,
    Fund fund,
    Recipient from,
    Recipient to,
    uint128 amount
  ) internal {
    Lock memory lock = _locks[controller][fund];
    require(lock.status() == LockStatus.Locked, VaultFundNotLocked());

    Account memory sender = _accounts[controller][fund][from];
    require(amount <= sender.balance.available, VaultInsufficientBalance());

    sender.balance.available -= amount;
    _checkAccountInvariant(sender, lock);

    _accounts[controller][fund][from] = sender;

    _accounts[controller][fund][to].balance.available += amount;
  }

  function _flow(
    Controller controller,
    Fund fund,
    Recipient from,
    Recipient to,
    TokensPerSecond rate
  ) internal {
    Lock memory lock = _locks[controller][fund];
    require(lock.status() == LockStatus.Locked, VaultFundNotLocked());

    Account memory sender = _accounts[controller][fund][from];
    sender.flowOut(rate);
    _checkAccountInvariant(sender, lock);
    _accounts[controller][fund][from] = sender;

    Account memory receiver = _accounts[controller][fund][to];
    receiver.flowIn(rate);
    _accounts[controller][fund][to] = receiver;
  }

  function _burnDesignated(
    Controller controller,
    Fund fund,
    Recipient recipient,
    uint128 amount
  ) internal {
    Lock memory lock = _locks[controller][fund];
    require(lock.status() == LockStatus.Locked, VaultFundNotLocked());

    Account storage account = _accounts[controller][fund][recipient];
    require(account.balance.designated >= amount, VaultInsufficientBalance());

    account.balance.designated -= amount;

    _token.safeTransfer(address(0xdead), amount);
  }

  function _burnAccount(
    Controller controller,
    Fund fund,
    Recipient recipient
  ) internal {
    Lock storage lock = _locks[controller][fund];
    require(lock.status() == LockStatus.Locked, VaultFundNotLocked());

    Account memory account = _accounts[controller][fund][recipient];
    require(account.flow.incoming == account.flow.outgoing, VaultFlowNotZero());
    uint128 amount = account.balance.available + account.balance.designated;

    lock.value -= amount;

    delete _accounts[controller][fund][recipient];

    _token.safeTransfer(address(0xdead), amount);
  }

  function _burnFund(Controller controller, Fund fund) internal {
    Lock storage lock = _locks[controller][fund];
    require(lock.status() == LockStatus.Locked, VaultFundNotLocked());

    lock.burned = true;

    _token.safeTransfer(address(0xdead), lock.value);
  }

  function _withdraw(
    Controller controller,
    Fund fund,
    Recipient recipient
  ) internal {
    Lock memory lock = _locks[controller][fund];
    require(lock.status() == LockStatus.Unlocked, VaultFundNotUnlocked());

    Account memory account = _accounts[controller][fund][recipient];
    account.update(lock.expiry);
    uint128 amount = account.balance.available + account.balance.designated;

    lock.value -= amount;

    if (lock.value == 0) {
      delete _locks[controller][fund];
    } else {
      _locks[controller][fund] = lock;
    }

    delete _accounts[controller][fund][recipient];

    _token.safeTransfer(Recipient.unwrap(recipient), amount);
  }

  function _checkLockInvariant(Lock memory lock) private pure {
    require(lock.expiry <= lock.maximum, VaultInvalidExpiry());
  }

  function _checkAccountInvariant(
    Account memory account,
    Lock memory lock
  ) private pure {
    require(account.isSolventAt(lock.maximum), VaultInsufficientBalance());
  }

  error VaultInsufficientBalance();
  error VaultInvalidExpiry();
  error VaultFundNotLocked();
  error VaultFundNotUnlocked();
  error VaultFundAlreadyLocked();
  error VaultFlowNotZero();
}
